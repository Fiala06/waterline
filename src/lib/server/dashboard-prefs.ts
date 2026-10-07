// Dashboard personalization (#94): a keeper's choices for a tank's dashboard,
// one row per keeper and tank; none means the defaults.
import { and, eq } from 'drizzle-orm';
import { DEFAULT_CHOICES, isSection, type DashboardChoices } from '$lib/dashboard';
import { db } from './db';
import { dashboardPrefs } from './db/schema';

export function dashboardChoices(userId: string, tankId: string): DashboardChoices {
	const row = db.select().from(dashboardPrefs).where(and(eq(dashboardPrefs.userId, userId), eq(dashboardPrefs.tankId, tankId))).get();
	if (!row) return DEFAULT_CHOICES;
	return { trendParamId: row.trendParamId, priority: row.priority, hidden: row.hidden.filter(isSection) };
}

export function saveDashboardChoices(userId: string, tankId: string, c: DashboardChoices) {
	const existing = db.select({ id: dashboardPrefs.id }).from(dashboardPrefs).where(and(eq(dashboardPrefs.userId, userId), eq(dashboardPrefs.tankId, tankId))).get();
	if (existing) db.update(dashboardPrefs).set({ trendParamId: c.trendParamId, priority: c.priority, hidden: c.hidden }).where(eq(dashboardPrefs.id, existing.id)).run();
	else db.insert(dashboardPrefs).values({ userId, tankId, trendParamId: c.trendParamId, priority: c.priority, hidden: c.hidden }).run();
}

/** Back to the dashboard as it comes. */
export function resetDashboardChoices(userId: string, tankId: string) {
	db.delete(dashboardPrefs).where(and(eq(dashboardPrefs.userId, userId), eq(dashboardPrefs.tankId, tankId))).run();
}
