import {
  EQUIPMENT_TYPE_LABEL,
  equipmentName,
  isWithoutType,
  onNowText,
  parseSchedule,
  scheduleLabel,
  serviceDueText,
  specSummary,
  WITHOUT_TYPES,
  withoutLabel,
} from "$lib/equipment";
import { error, fail, redirect } from "@sveltejs/kit";
import { setFlash } from "$lib/server/flash";
import { num, optStr, str } from "$lib/server/forms";
import { getTank } from "$lib/server/tanks";
import { addPar, deletePar, listPar, scheduledItems, setWithout } from "$lib/server/specs";
import { PAR_ZONES } from "$lib/par";
import { effectiveDue } from "$lib/tasks";
import { dateInZone, daysBetween, fmtDate, fmtDateLong, isDate, todayInZone, utcToZoned, zonedToUtc } from "$lib/time";
import { db } from "$lib/server/db";
import { tasks } from "$lib/server/db/schema";
import { listEquipment } from "$lib/server/specs";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";

const since = (d: string | null) =>
  d
    ? new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

export const load: PageServerLoad = ({ locals, params }) => {
  const user = locals.user!;
  const today = todayInZone(user.timeZone);
  const openTasks = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.tankId, params.id), isNotNull(tasks.nextDue)))
    .all();
  const nowTime = utcToZoned(new Date(), user.timeZone).time;
  const view = (e: ReturnType<typeof listEquipment>[number]) => {
    const name = equipmentName(e);
    const task = openTasks.find((t) => t.equipmentId === e.id);
    const due = task && !e.removedAt ? effectiveDue(task) : null;
    const schedule = parseSchedule(e.schedule);
    return {
      // when it runs (#25): "08:00–12:00, 14:00–18:00 · 8 h" and "● On now · off at 12:00"
      schedule: schedule ? { label: scheduleLabel(schedule), now: onNowText(schedule, nowTime) } : null,
      id: e.id,
      type: EQUIPMENT_TYPE_LABEL[e.type],
      name,
      // T2: "Tidewell 200 W" gets "Set 77 °F", not a second "200 W"
      summary: specSummary(e.type, e.specs, user).filter(
        (s) => !name.includes(s),
      ),
      since: since(e.installedAt),
      serviced: e.lastServicedAt
        ? fmtDate(dateInZone(e.lastServicedAt, user.timeZone))
        : null,
      task: task?.name ?? null,
      // "Service due in 12 days" / "✕ Service overdue 3 days", from its reminder
      service: due ? serviceDueText(daysBetween(today, due)) : null,
      notes: e.notes,
    };
  };
  const current = listEquipment(user.id, params.id);
  const items = current.map(view);
  const tank = getTank(user.id, params.id);
  const without = tank.withoutEquipment;
  // PAR readings (#25), reef tanks: the latest at each spot on the map, and every reading listed
  const par = tank.type === "reef" ? listPar(user.id, params.id) : [];
  const latestBySpot = new Map<string, (typeof par)[number]>();
  for (const r of par) if (!latestBySpot.has(r.spot.toLowerCase())) latestBySpot.set(r.spot.toLowerCase(), r);
  return {
    // the day timeline (#25): every item on a schedule, and the time now in the keeper's zone
    timeline: scheduledItems(params.id).map((i) => ({ label: i.name, schedule: i.schedule, kind: i.type })),
    now: nowTime,
    par:
      tank.type === "reef"
        ? {
            // the footprint's shape from the tank's size (2 : 1 when it has none)
            aspect: tank.lengthCm && tank.widthCm ? Math.min(4, Math.max(1, tank.lengthCm / tank.widthCm)) : 2,
            spots: [...latestBySpot.values()].map((r) => ({ id: r.id, spot: r.spot, x: r.x, y: r.y, value: r.value })),
            readings: par.map((r) => ({ id: r.id, spot: r.spot, value: r.value, note: r.note, day: fmtDateLong(dateInZone(r.measuredAt, user.timeZone)) })),
            today,
            zones: PAR_ZONES.map((z) => z.label),
          }
        : null,
    // the tab's toolbar: "4 items"
    toolbarText: items.length
      ? `${items.length} item${items.length === 1 ? "" : "s"}`
      : "",
    items,
    past: listEquipment(user.id, params.id, { removed: true }).map(view),
    // Goes without: "No heater" and the like, for the kinds the tank has none of
    withoutOptions: WITHOUT_TYPES.filter(
      (t) => without.includes(t) || !current.some((e) => e.type === t),
    ).map((t) => ({ type: t, label: withoutLabel(t), on: without.includes(t) })),
  };
};

export const actions: Actions = {
  /** PAR readings (#25): a reading at a spot, placed by its zone on the map. */
  par: async ({ request, locals, params, cookies }) => {
    const user = locals.user!;
    const form = await request.formData();
    const value = num(form, "value");
    const spot = str(form, "spot").slice(0, 40);
    const zone = PAR_ZONES.find((z) => z.label === str(form, "zone"));
    const day = str(form, "day") || todayInZone(user.timeZone);
    const errors: Record<string, string> = {};
    if (value == null || value < 0 || value > 5000) errors.value = "Enter the PAR reading (0–5000).";
    if (!zone) errors.zone = "Pick where in the tank.";
    if (!isDate(day) || day > todayInZone(user.timeZone)) errors.day = "Pick a day up to today.";
    if (Object.keys(errors).length) return fail(400, { par: { errors } });
    addPar(user.id, params.id, {
      spot: spot || zone!.label,
      x: zone!.x,
      y: zone!.y,
      value: Math.round(value!),
      note: optStr(form, "note", 200),
      measuredAt: zonedToUtc(day, "12:00", user.timeZone).toISOString(),
    });
    setFlash(cookies, `✓ PAR ${Math.round(value!)} at ${spot || zone!.label}`);
    redirect(303, `/tanks/${params.id}/equipment#par`);
  },
  parDelete: async ({ request, locals, params, cookies }) => {
    const r = deletePar(locals.user!.id, params.id, str(await request.formData(), "id"));
    setFlash(cookies, `PAR reading at ${r.spot} deleted`);
    redirect(303, `/tanks/${params.id}/equipment#par`);
  },
  /** Goes without: mark or unmark "No heater" (and the like). */
  without: async ({ request, locals, params, cookies }) => {
    const form = await request.formData();
    const type = form.get("type");
    if (!isWithoutType(type)) error(400, "Unknown equipment");
    const on = form.get("on") === "1";
    setWithout(locals.user!.id, params.id, type, on);
    setFlash(cookies, on ? `✓ ${withoutLabel(type)} in this tank` : `${EQUIPMENT_TYPE_LABEL[type]} no longer marked as none`);
    redirect(303, `/tanks/${params.id}/equipment`);
  },
};
