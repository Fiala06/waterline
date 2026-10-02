import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { newReviewTask, REVIEW_SECTIONS, type ReviewChecks, type ReviewSection } from '$lib/review';
import { equipmentName } from '$lib/equipment';
import { addDays, todayInZone } from '$lib/time';
import { db } from './db';
import { events, tanks, tasks, type Task, type User } from './db/schema';
import { getEquipment, markServiced } from './specs';
import { getTank } from './tanks';
import { completeTask } from './tasks';

// The setup review (#30). A review task per tank comes up every few months;
// its page checks the tank's details, equipment, target ranges, and livestock
// and plants. Finishing it completes the task and writes one History entry.

/** The tank's review task, if it has one (it's off when there's none). */
export function reviewTask(tankId: string): Task | undefined {
	return db.select().from(tasks).where(and(eq(tasks.tankId, tankId), eq(tasks.kind, 'review'))).get();
}

/** Tank settings › Setup review: how often, or off (the task is removed; picking a time again brings it back). */
export function setReviewEvery(user: User, tankId: string, every: number | 'off') {
	getTank(user.id, tankId);
	const task = reviewTask(tankId);
	if (every === 'off') {
		if (task) db.delete(tasks).where(eq(tasks.id, task.id)).run();
		return;
	}
	const today = todayInZone(user.timeZone);
	if (!task) {
		db.insert(tasks).values(newReviewTask(tankId, today, every)).run();
		return;
	}
	if (task.intervalDays === every) return;
	// a shorter interval brings the next one closer; a longer one leaves the date as it is
	const sooner = addDays(today, every);
	const nextDue = task.nextDue && task.nextDue > sooner ? sooner : task.nextDue;
	db.update(tasks).set({ intervalDays: every, recurring: true, scheduleMode: 'completion', nextDue }).where(eq(tasks.id, task.id)).run();
}

/** When the last review was finished (its History entry), or null. */
export function lastReviewAt(tankId: string): string | null {
	const row = db
		.select({ at: events.occurredAt })
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, 'note'), sql`json_extract(${events.data}, '$.system') = 'setup_reviewed'`))
		.orderBy(desc(events.occurredAt))
		.get();
	return row?.at ?? null;
}

// what in History says a part changed: equipment changes and servicing, livestock and plant changes
const SECTION_CATEGORIES: Partial<Record<ReviewSection, ('equipment' | 'livestock' | 'maintenance')[]>> = {
	equipment: ['equipment', 'maintenance'],
	livestock: ['livestock']
};

/** Parts with History entries since `since`: equipment and livestock leave a trail; details and targets don't. */
export function changedSince(tankId: string, since: string | null): ReviewSection[] {
	if (!since) return [];
	const cats = db
		.select({ category: events.category, data: events.data })
		.from(events)
		.where(and(eq(events.tankId, tankId), gt(events.occurredAt, since), inArray(events.category, ['equipment', 'maintenance', 'livestock'])))
		.all()
		// servicing only counts when it's of a piece of equipment
		.filter((e) => e.category !== 'maintenance' || typeof e.data.equipment_id === 'string')
		.map((e) => e.category);
	return REVIEW_SECTIONS.map((s) => s.key).filter((k) => SECTION_CATEGORIES[k]?.some((c) => cats.includes(c)));
}

/** ✓ Still right on one part: it counts as checked now. */
export function checkSection(userId: string, tankId: string, section: ReviewSection, at = new Date().toISOString()) {
	const tank = getTank(userId, tankId);
	const checks: ReviewChecks = { ...tank.reviewChecks, [section]: at };
	db.update(tanks).set({ reviewChecks: checks }).where(eq(tanks.id, tankId)).run();
	return checks;
}

/**
 * All still right: every part counts as checked, the review task is done (its
 * next one is set), and one History entry says what had changed since the
 * last review. The checks before it are kept on the entry, so Undo can put
 * them back.
 */
export function finishReview(user: User, tankId: string) {
	const tank = getTank(user.id, tankId);
	const at = new Date().toISOString();
	const since = lastReviewAt(tankId) ?? tank.createdAt;
	const changed = changedSince(tankId, since);
	const checks: ReviewChecks = Object.fromEntries(REVIEW_SECTIONS.map((s) => [s.key, at]));
	const event = db.transaction((tx) => {
		tx.update(tanks).set({ reviewChecks: checks }).where(eq(tanks.id, tankId)).run();
		return tx
			.insert(events)
			.values({ tankId, category: 'note', occurredAt: at, note: null, data: { system: 'setup_reviewed', changed, prev_checks: tank.reviewChecks } })
			.returning()
			.get();
	});
	const task = reviewTask(tankId);
	const done = task ? completeTask(user.id, task.id, { at, eventId: event.id, timeZone: user.timeZone }) : null;
	return { event, changed, nextDue: done?.nextDue ?? null, completionId: done?.completionId ?? null };
}

/** Serviced today, from the review: the date on the equipment and a maintenance entry in History. */
export function servicedToday(userId: string, tankId: string, equipmentId: string) {
	const item = getEquipment(userId, equipmentId);
	if (item.tankId !== tankId || item.removedAt) return null;
	const at = new Date().toISOString();
	markServiced(userId, item.id, at);
	db.insert(events)
		.values({ tankId, category: 'maintenance', occurredAt: at, note: null, data: { actions: [`Serviced ${equipmentName(item)}`], equipment_id: item.id } })
		.run();
	return item;
}
