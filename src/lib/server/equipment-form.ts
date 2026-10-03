import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import {
  DEFAULT_SERVICE,
  EQUIPMENT_TYPES,
  SPEC_FIELDS,
  equipmentName,
  parseServiceCadence,
  serviceCadenceValue,
  serviceVerb,
  specToDisplay,
  specToStored,
  type EquipmentType,
  type SpecField,
} from "$lib/equipment";
import { addDays, dateInZone, isDate, todayInZone } from "$lib/time";
import { formatNumber } from "$lib/units";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { tasks, type Equipment, type User } from "./db/schema";
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
 * remove it when switched off. A task whose cadence is unchanged is left as is.
 */
export function syncServiceTask(user: User, e: Equipment, days: number | null) {
  const task = serviceTask(e.id);
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
      name: `${serviceVerb(e.type)} ${equipmentName(e)}`,
      kind: "maintenance",
      recurring: true,
      intervalDays: days,
      scheduleMode: "completion",
      nextDue,
      openFormOnDone: false,
      equipmentId: e.id,
    });
  } else if (task.intervalDays !== days || !task.recurring) {
    db.update(tasks)
      .set({
        recurring: true,
        intervalDays: days,
        scheduleMode: "completion",
        nextDue,
        snoozedUntil: null,
      })
      .where(eq(tasks.id, task.id))
      .run();
  }
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
  const task = e ? serviceTask(e.id) : null;
  const serviceEvery = e
    ? serviceCadenceValue(task?.recurring ? task.intervalDays : null)
    : (DEFAULT_SERVICE[type] ?? "off");
  return {
    type,
    brand: e?.brand ?? "",
    model: e?.model ?? "",
    installedAt: e?.installedAt ?? todayInZone(user.timeZone),
    notes: e?.notes ?? "",
    specs,
    // the Service reminder: a preset, or custom with its days
    serviceEvery,
    serviceDays:
      serviceEvery === "custom" && task?.intervalDays
        ? String(task.intervalDays)
        : "",
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
  const input: EquipmentInput = {
    type,
    brand: optStr(form, "brand", 60),
    model: optStr(form, "model", 60),
    specs,
    installedAt,
    notes: optStr(form, "notes"),
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
  const { errors, input, serviceDays } = parse(form, user, before);
  if (Object.keys(errors).length) return fail(400, { errors });
  if (equipmentId) {
    const e = updateEquipment(user.id, equipmentId, input);
    if (serviceDays !== undefined) syncServiceTask(user, e, serviceDays);
    setFlash(event.cookies, "✓ Equipment saved");
  } else {
    const e = addEquipment(user.id, tankId, input, user.timeZone);
    if (serviceDays) syncServiceTask(user, e, serviceDays);
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
