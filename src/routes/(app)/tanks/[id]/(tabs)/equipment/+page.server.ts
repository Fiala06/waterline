import {
  EQUIPMENT_TYPE_LABEL,
  equipmentName,
  isWithoutType,
  serviceDueText,
  specSummary,
  WITHOUT_TYPES,
  withoutLabel,
} from "$lib/equipment";
import { error, redirect } from "@sveltejs/kit";
import { setFlash } from "$lib/server/flash";
import { getTank } from "$lib/server/tanks";
import { setWithout } from "$lib/server/specs";
import { effectiveDue } from "$lib/tasks";
import { dateInZone, daysBetween, fmtDate, todayInZone } from "$lib/time";
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
  const view = (e: ReturnType<typeof listEquipment>[number]) => {
    const name = equipmentName(e);
    const task = openTasks.find((t) => t.equipmentId === e.id);
    const due = task && !e.removedAt ? effectiveDue(task) : null;
    return {
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
  const without = getTank(user.id, params.id).withoutEquipment;
  return {
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
