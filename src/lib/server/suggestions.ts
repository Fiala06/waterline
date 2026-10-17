// Suggested steps from readings (#179): what the app knows about a tank, for
// the rules in src/lib/suggestions.ts, and switching a rule off for a tank.
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { addDays, dateInZone, todayInZone } from '$lib/time';
import { CLEAR_EVERY, clearText, isSuggestionRule, suggestSteps, type Suggestion, type SuggestionRuleId } from '$lib/suggestions';
import { db } from './db';
import { events, tankParameters, tanks, type Tank, type User } from './db/schema';
import { recentDosingProducts } from './logs';
import { roleOn } from './tanks';
import { listTasks } from './tasks';

/** A tank this new with ammonia or nitrite may be cycling: the dashboard asks (#68), and this waits. */
export const CYCLE_DAYS = 56;
/** A dose logged this many days back makes a tank dosed, with no routine. */
const DOSED_DAYS = 30;

/**
 * The steps a tank's readings suggest (parameter id → stored value): the latest
 * readings on the dashboard, a test's own on its page. Only for the tank's
 * owner, who can act on them.
 */
export function tankSuggestions(user: User, tank: Tank, readings: Map<string, number>): Suggestion[] {
	if (roleOn(user.id, tank) !== 'owner' || !readings.size) return [];
	const today = todayInZone(user.timeZone);
	const params = db.select().from(tankParameters).where(eq(tankParameters.tankId, tank.id)).all();
	const read = params.filter((p) => !p.isCustom && readings.has(p.id)).map((p) => ({ paramId: p.id, key: p.key, value: readings.get(p.id)!, name: p.name }));
	if (!read.length) return [];
	const born = tank.startDate ?? tank.createdAt.slice(0, 10);
	const open = listTasks(user.id, tank.id).map((r) => r.task);
	const wc = open.find((t) => t.kind === 'water_change' && t.recurring && t.intervalDays && (t.scheduleMode === 'completion' || t.scheduleMode === 'fixed'));
	const routine = open.find((t) => t.kind === 'dosing');
	const lastDose = recentDosingProducts(tank.id, 1)[0];
	const dosedLately = !!lastDose && dateInZone(lastDose.at, user.timeZone) >= addDays(today, -DOSED_DAYS);
	const spot = db
		.select({ id: events.id, at: events.occurredAt })
		.from(events)
		.where(
			and(
				eq(events.tankId, tank.id),
				eq(events.category, 'observation'),
				sql`json_extract(${events.data}, '$.kind') = 'algae' and json_extract(${events.data}, '$.algae') = 'Green spot'`,
				gte(events.occurredAt, `${addDays(today, -14)}T00:00:00.000Z`)
			)
		)
		.orderBy(desc(events.occurredAt))
		.get();
	return suggestSteps({
		tankId: tank.id,
		readings: read,
		cycled: !tank.cycling && (tank.cyclingAskDismissed || born < addDays(today, -CYCLE_DAYS)),
		// already every 2 days or until it clears: nothing to suggest
		waterChange: wc ? { id: wc.id, name: wc.name, intervalDays: wc.intervalDays!, clearing: !!wc.tempUntilParam || (!!wc.tempIntervalDays && wc.tempIntervalDays <= CLEAR_EVERY) } : null,
		dosed: !!routine || dosedLately,
		product: routine?.product ?? lastDose?.product ?? null,
		greenSpot: spot ? { eventId: spot.id, date: dateInZone(spot.at, user.timeZone) } : null,
		off: tank.suggestionsOff
	});
}

/** Switch a rule off for a tank, or back on. */
export function setSuggestion(tankId: string, rule: SuggestionRuleId, on: boolean) {
	const tank = db.select({ off: tanks.suggestionsOff }).from(tanks).where(eq(tanks.id, tankId)).get();
	if (!tank) return;
	const off = new Set(tank.off.filter(isSuggestionRule));
	if (on) off.delete(rule);
	else off.add(rule);
	db.update(tanks).set({ suggestionsOff: [...off] }).where(eq(tanks.id, tankId)).run();
}

/** What clears a pause or a cadence for a while (#179), by the parameter's id: "ammonia reads 0". */
export function clearTextOf(paramId: string | null): string | null {
	if (!paramId) return null;
	const p = db.select().from(tankParameters).where(eq(tankParameters.id, paramId)).get();
	return p ? clearText(p) : null;
}
