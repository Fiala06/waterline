import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import {
  DEFAULT_SERVICE,
  EQUIPMENT_TYPES,
  MAX_PERIODS,
  SPEC_FIELDS,
  equipmentName,
  parseSchedule,
  parseServiceCadence,
  serviceCadenceValue,
  serviceVerb,
  specToDisplay,
  specToStored,
  type EquipmentType,
  type Schedule,
  type SpecField,
} from "$lib/equipment";
import { normalizeBarcode } from "$lib/barcode";
import { MAX_DOSES, MAX_SECONDS } from "$lib/dosers";
import { parseWeekdays, WEEKDAYS } from "$lib/tasks";
import { addDays, dateInZone, isDate, isTime, todayInZone } from "$lib/time";
import { formatNumber } from "$lib/units";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { tasks, type Equipment, type User } from "./db/schema";
import { listDoses, syncDoses, type DoseInput } from "./dosers";
import { recentDosingProducts } from "./logs";
import { listProducts } from "./products";
import { setFlash } from "./flash";
import { num, optStr, str } from "./forms";
import {
  addEquipment,
  getEquipment,
  removeEquipment,
  updateEquipment,
  type EquipmentInput,
} from "./specs";
import { createTask } from "./tasks";

/** The item's service reminder: its open maintenance task, if any. */
export function serviceTask(equipmentId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.equipmentId, equipmentId), isNotNull(tasks.nextDue)))
    .get();
}

/**
 * Keep the item's service reminder in step with the form: create it, change
 * its cadence (due again that long after the last service, or from today), or
 * remove it when switched off. Renaming the item also renames its task without
 * moving its due date or clearing a snooze.
 */
export function syncServiceTask(user: User, e: Equipment, days: number | null) {
  const task = serviceTask(e.id);
  const name = `${serviceVerb(e.type)} ${equipmentName(e)}`;
  const today = todayInZone(user.timeZone);
  const from = e.lastServicedAt
    ? dateInZone(e.lastServicedAt, user.timeZone)
    : today;
  const nextDue = (() => {
    const d = addDays(from, days ?? 0);
    return d < today ? today : d;
  })();
  if (!days) {
    if (task) db.delete(tasks).where(eq(tasks.id, task.id)).run();
    return;
  }
  if (!task) {
    createTask(user.id, e.tankId, {
      name,
      kind: "maintenance",
      recurring: true,
      intervalDays: days,
      scheduleMode: "completion",
      nextDue,
      openFormOnDone: false,
      equipmentId: e.id,
    });
  } else if (task.name !== name || task.intervalDays !== days || !task.recurring) {
    const cadenceChanged = task.intervalDays !== days || !task.recurring;
    db.update(tasks)
      .set({
        name,
        ...(cadenceChanged
          ? {
              recurring: true,
              intervalDays: days,
              scheduleMode: "completion" as const,
              nextDue,
              snoozedUntil: null,
            }
          : {}),
      })
      .where(eq(tasks.id, task.id))
      .run();
  }
}

/** A doser's dose as the form holds it (#196): text fields, and the days ticked (every day: all seven). */
export interface DoseFormRow {
  id: string;
  product: string;
  amount: string;
  at: string;
  seconds: string;
  weekdays: number[];
  paused: boolean;
}

/** The doses of a doser for its form, or none for a new item. */
export function doseFormRows(e: Equipment | null): DoseFormRow[] {
  if (!e || e.type !== "doser") return [];
  return listDoses(e.id).map((d) => {
    const days = parseWeekdays(d.weekdays);
    return {
      id: d.id,
      product: d.product,
      amount: formatNumber(d.amountMl, 2),
      at: d.at,
      seconds: d.seconds ? String(d.seconds) : "",
      weekdays: days.length ? days : WEEKDAYS.map((w) => w.day),
      paused: d.paused,
    };
  });
}

/** Products to offer a doser's dose (#196): dosed on the tank before, then saved under Settings › Products. */
export function doseProducts(userId: string, tankId: string): string[] {
  const seen = new Set<string>();
  return [...recentDosingProducts(tankId, 12).map((r) => r.product), ...listProducts(userId).map((p) => p.name.trim())].filter(
    (name) => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()),
  );
}

/** Form values (display units) for an equipment item. */
export function equipmentFormValues(e: Equipment | null, user: User) {
  const type = (e?.type ?? "filter") as EquipmentType;
  const specs: Record<string, string> = {};
  for (const t of EQUIPMENT_TYPES) {
    for (const f of SPEC_FIELDS[t]) {
      const v = e?.type === t ? e.specs[f.key] : undefined;
      specs[`${t}.${f.key}`] =
        v == null ? "" : typeof v === "number" ? shown(f, v, user) : String(v);
    }
  }
  const schedule = parseSchedule(e?.schedule);
  const task = e ? serviceTask(e.id) : null;
  const serviceEvery = e
    ? serviceCadenceValue(task?.recurring ? task.intervalDays : null)
    : (DEFAULT_SERVICE[type] ?? "off");
  return {
    type,
    brand: e?.brand ?? "",
    model: e?.model ?? "",
    // the product barcode it was scanned from (#147), kept with it
    barcode: e?.barcode ?? "",
    installedAt: e?.installedAt ?? todayInZone(user.timeZone),
    notes: e?.notes ?? "",
    specs,
    // the Service reminder: a preset, or custom with its days
    serviceEvery,
    serviceDays:
      serviceEvery === "custom" && task?.intervalDays
        ? String(task.intervalDays)
        : "",
    // when it runs (#25): all day, or its periods and ramp
    runs: schedule ? "schedule" : "always",
    periods: schedule?.periods ?? [],
    rampMin: schedule?.rampMin ? String(schedule.rampMin) : "0",
    // a doser's doses (#196)
    doses: doseFormRows(e),
  };
}

/**
 * A doser's doses from the form (#196): rows dose.<i>.product, .amount (mL),
 * .at, .seconds, .wd (the days ticked) and .paused, with .id for a row it
 * already had; a row left blank is skipped. undefined when the form has no
 * such fields (an older page, another type), so the item keeps what it had.
 */
export function parseDosesForm(
  form: FormData,
  errors: Record<string, string>,
): DoseInput[] | undefined {
  if (!form.has("doses")) return undefined;
  const out: DoseInput[] = [];
  for (let i = 0; i < MAX_DOSES; i++) {
    const key = (k: string) => `dose.${i}.${k}`;
    if (!form.has(key("product")) && !form.has(key("at"))) continue;
    const product = str(form, key("product")).slice(0, 80);
    const amountRaw = str(form, key("amount"));
    const at = str(form, key("at"));
    const secondsRaw = str(form, key("seconds"));
    if (!product && !amountRaw && !at) continue;
    const amount = num(form, key("amount"));
    const days = parseWeekdays(form.getAll(key("wd")).map(String).join(","));
    if (!product) errors[key("product")] = "Enter the product it doses.";
    if (amount == null || amount <= 0) errors[key("amount")] = "Enter how much, in mL.";
    if (!isTime(at)) errors[key("at")] = "Pick a time.";
    let seconds: number | null = null;
    if (secondsRaw) {
      const n = Math.round(Number(secondsRaw));
      if (!Number.isFinite(n) || n < 1 || n > MAX_SECONDS) errors[key("seconds")] = `Enter 1–${MAX_SECONDS} seconds, or leave it out.`;
      else seconds = n;
    }
    if (!days.length) errors[key("wd")] = "Pick at least one day.";
    out.push({
      id: optStr(form, key("id"), 64),
      product,
      amountMl: amount ?? 0,
      at,
      seconds,
      weekdays: days.length === 7 ? null : days.join(","),
      paused: str(form, key("paused")) === "1",
    });
  }
  return out;
}

/**
 * The schedule from the form (#25): "runs" is always or schedule; periods come
 * as periodOn / periodOff pairs, blank pairs skipped. undefined when the form
 * has no such fields (an older page), so the item keeps what it had.
 */
export function parseScheduleForm(
  form: FormData,
  errors: Record<string, string>,
): Schedule | null | undefined {
  if (!form.has("runs")) return undefined;
  if (str(form, "runs") !== "schedule") return null;
  const ons = form.getAll("periodOn").map(String);
  const offs = form.getAll("periodOff").map(String);
  const periods: Schedule["periods"] = [];
  for (let i = 0; i < Math.max(ons.length, offs.length); i++) {
    const on = (ons[i] ?? "").trim();
    const off = (offs[i] ?? "").trim();
    if (!on && !off) continue;
    if (!isTime(on) || !isTime(off)) {
      errors.periods = "Give each period an on and an off time.";
      continue;
    }
    if (on === off) {
      errors.periods = "A period's off time must differ from its on time.";
      continue;
    }
    periods.push({ on, off });
  }
  if (!periods.length && !errors.periods)
    errors.periods = "Add at least one period, or choose All day.";
  const ramp = Math.round(Number(str(form, "rampMin") || 0));
  return {
    periods: periods.slice(0, MAX_PERIODS),
    rampMin: Number.isFinite(ramp) && ramp > 0 ? Math.min(240, ramp) : null,
  };
}

const shown = (f: SpecField, stored: number, user: User) =>
  formatNumber(specToDisplay(f, stored, user), 1);

function parse(form: FormData, user: User, before: Equipment | null) {
  const errors: Record<string, string> = {};
  const type = str(form, "type") as EquipmentType;
  if (!EQUIPMENT_TYPES.includes(type)) errors.type = "Choose a type.";
  const specs: Record<string, unknown> = {};
  for (const f of SPEC_FIELDS[type] ?? []) {
    const key = `spec.${f.key}`;
    if (f.kind === "number") {
      // a number left as shown keeps its exact stored value (no 1200 → 1199.98)
      const old = before?.type === type ? before.specs[f.key] : undefined;
      if (typeof old === "number" && str(form, key) === shown(f, old, user)) {
        specs[f.key] = old;
        continue;
      }
      const v = num(form, key);
      if (v == null) continue;
      if (v < 0) errors[key] = "Enter 0 or more.";
      specs[f.key] = specToStored(f, v, user);
    } else {
      const v = optStr(form, key, 80);
      if (v)
        specs[f.key] =
          f.kind === "select" && !f.options?.includes(v) ? null : v;
    }
  }
  const installedAt = optStr(form, "installedAt");
  if (installedAt && !isDate(installedAt)) errors.installedAt = "Pick a date.";
  const schedule = parseScheduleForm(form, errors);
  // a doser's doses (#196); another type keeps none
  const doses = type === "doser" ? parseDosesForm(form, errors) : before?.type === "doser" ? [] : undefined;
  const input: EquipmentInput = {
    type,
    brand: optStr(form, "brand", 60),
    model: optStr(form, "model", 60),
    specs,
    installedAt,
    notes: optStr(form, "notes"),
    ...(schedule !== undefined ? { schedule } : {}),
    // a form without the field (an older page, an import) leaves the barcode as it is
    ...(form.has("barcode") ? { barcode: normalizeBarcode(str(form, "barcode")) } : {}),
  };
  if (!input.brand && !input.model) errors.brand = "Enter a brand or model.";
  const serviceEvery = str(form, "serviceEvery");
  const serviceDays = parseServiceCadence(
    serviceEvery,
    str(form, "serviceDays"),
  );
  if (serviceEvery === "custom" && serviceDays == null)
    errors.serviceDays = "Enter 1–730 days.";
  // a form without the field (an older page) leaves the reminder as it is
  return {
    errors,
    input,
    serviceDays: form.has("serviceEvery") ? serviceDays : undefined,
    doses,
  };
}

export async function saveEquipmentAction(
  event: RequestEvent,
  tankId: string,
  equipmentId: string | null,
) {
  const user = event.locals.user!;
  const form = await event.request.formData();
  const before = equipmentId ? getEquipment(user.id, equipmentId) : null;
  const { errors, input, serviceDays, doses } = parse(form, user, before);
  if (Object.keys(errors).length) return fail(400, { errors });
  if (equipmentId) {
    const e = updateEquipment(user.id, equipmentId, input);
    if (serviceDays !== undefined) syncServiceTask(user, e, serviceDays);
    if (doses !== undefined) syncDoses(user, e, doses);
    setFlash(event.cookies, "✓ Equipment saved");
  } else {
    const e = addEquipment(user.id, tankId, input, user.timeZone);
    if (serviceDays) syncServiceTask(user, e, serviceDays);
    if (doses?.length) syncDoses(user, e, doses);
    setFlash(event.cookies, `✓ ${equipmentName(e)} added`);
  }
  redirect(303, `/tanks/${tankId}/equipment`);
}

export function removeEquipmentAction(
  event: RequestEvent,
  equipmentId: string,
) {
  const e = removeEquipment(event.locals.user!.id, equipmentId);
  setFlash(
    event.cookies,
    `${equipmentName(e)} removed${e.tasksRemoved ? " with its reminder" : ""}`,
  );
  redirect(303, `/tanks/${e.tankId}/equipment`);
}
