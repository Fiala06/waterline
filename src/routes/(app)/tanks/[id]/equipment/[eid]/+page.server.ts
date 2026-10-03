import { error } from "@sveltejs/kit";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { EQUIPMENT_TYPE_LABEL, serviceDueText } from "$lib/equipment";
import { eventTitle } from "$lib/events";
import { effectiveDue, intervalText } from "$lib/tasks";
import { db } from "$lib/server/db";
import { events, tasks } from "$lib/server/db/schema";
import {
  equipmentFormValues,
  removeEquipmentAction,
  saveEquipmentAction,
} from "$lib/server/equipment-form";
import { getEquipment, knownBrands } from "$lib/server/specs";
import { dateInZone, daysBetween, fmtDate, todayInZone } from "$lib/time";
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
  const e = getEquipment(user.id, params.eid);
  if (e.tankId !== params.id) error(404, "Equipment not found");
  // what's been logged about it: services, settings, its install and removal
  const history = db
    .select()
    .from(events)
    .where(
      and(
        eq(events.tankId, e.tankId),
        sql`json_extract(${events.data}, '$.equipment_id') = ${e.id}`,
      ),
    )
    .orderBy(desc(events.occurredAt))
    .limit(30)
    .all()
    .map((h) => ({
      id: h.id,
      title: eventTitle(h, user),
      note: h.note,
      day: fmtDate(dateInZone(h.occurredAt, user.timeZone)),
    }));
  const task = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.equipmentId, e.id), isNotNull(tasks.nextDue)))
    .get();
  const today = todayInZone(user.timeZone);
  const due = task ? effectiveDue(task) : null;
  return {
    tankId: e.tankId,
    values: equipmentFormValues(e, user),
    brands: knownBrands(user.id),
    today,
    about: {
      kicker: [
        EQUIPMENT_TYPE_LABEL[e.type],
        since(e.installedAt) && `since ${since(e.installedAt)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      serviced: e.lastServicedAt
        ? fmtDate(dateInZone(e.lastServicedAt, user.timeZone))
        : null,
      history,
      task: task
        ? {
            id: task.id,
            name: task.name,
            line: [due && `Next ${fmtDate(due)}`, intervalText(task)]
              .filter(Boolean)
              .join(" · "),
            due:
              due && !e.removedAt
                ? serviceDueText(daysBetween(today, due))
                : null,
          }
        : null,
    },
  };
};

export const actions: Actions = {
  save: (e) => saveEquipmentAction(e, e.params.id, e.params.eid),
  remove: (e) => removeEquipmentAction(e, e.params.eid),
};
