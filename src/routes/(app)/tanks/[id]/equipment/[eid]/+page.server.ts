import { error } from "@sveltejs/kit";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { EQUIPMENT_TYPE_LABEL, serviceDueText } from "$lib/equipment";
import { eventTitle } from "$lib/events";
import { fmtMoney } from "$lib/money";
import { effectiveDue, intervalText } from "$lib/tasks";
import { db } from "$lib/server/db";
import { events, tasks } from "$lib/server/db/schema";
import { dosesLoggedBy } from "$lib/server/dosers";
import {
  doseProducts,
  equipmentFormValues,
  removeEquipmentAction,
  saveEquipmentAction,
} from "$lib/server/equipment-form";
import { expensesForEquipment } from "$lib/server/expenses";
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
  // what it cost (#148): the expenses linked to it
  const spent = expensesForEquipment(e.id);
  return {
    tankId: e.tankId,
    values: equipmentFormValues(e, user),
    brands: knownBrands(user.id),
    products: e.type === "doser" ? doseProducts(user.id, e.tankId) : [],
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
      cost: {
        total: fmtMoney(spent.totalCents, user.currency),
        rows: spent.rows.map((x) => ({
          id: x.id,
          what: x.what,
          day: fmtDate(x.date),
          amount: fmtMoney(x.amountCents, user.currency),
          receipt: !!x.receiptType,
        })),
        addHref: `/tanks/${e.tankId}/spending/new?equipment=${e.id}`,
      },
      // a doser (#196): the doses it logged
      doses:
        e.type === "doser"
          ? dosesLoggedBy(e.id).map((h) => ({
              id: h.id,
              title: eventTitle(h, user),
              day: fmtDate(dateInZone(h.occurredAt, user.timeZone)),
            }))
          : null,
    },
  };
};

export const actions: Actions = {
  save: (e) => saveEquipmentAction(e, e.params.id, e.params.eid),
  remove: (e) => removeEquipmentAction(e, e.params.eid),
};
