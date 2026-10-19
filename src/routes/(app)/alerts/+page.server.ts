// Alerts (#195): every reading out of range and overdue task across the
// tanks, with the admin's update notice, as a page like Tasks. The list is
// the shell's (the bell counts the same alerts); this adds each reading's
// last few readings for its sparkline, the filters, and Mark read / unread,
// which keep the account's list so every device agrees.
import { error } from '@sveltejs/kit';
import { eq, inArray, lte, sql } from 'drizzle-orm';
import { updateAlert, type Alert } from '$lib/alerts';
import { db } from '$lib/server/db';
import { testReadings, tests } from '$lib/server/db/schema';
import { markAlertsSeen, unmarkAlertsSeen } from '$lib/server/users';
import { todayInZone } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

/** Readings in each row's sparkline, as on the Overview. */
const SPARK_READINGS = 8;

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { alerts, app, tanks } = await parent();
	const wanted = url.searchParams.get('tank');
	const list: Alert[] = [...(app.update ? [updateAlert(app.update.version)] : []), ...alerts];
	const sparks = sparksFor(list.flatMap((a) => (a.kind === 'reading' ? [a.paramId] : [])));
	return {
		/** the tank picked in the filter, when it's one of theirs */
		tank: tanks.some((t) => t.id === wanted) ? wanted : null,
		unreadOnly: url.searchParams.get('show') === 'unread',
		today: todayInZone(user.timeZone),
		alerts: list.map((a) => (a.kind === 'reading' ? { ...a, spark: sparks.get(a.paramId) ?? [] } : a))
	};
};

/** Each parameter's last readings from water tests, oldest first, in one query. */
function sparksFor(paramIds: string[]) {
	const out = new Map<string, number[]>(paramIds.map((id) => [id, []]));
	if (!paramIds.length) return out;
	const ranked = db
		.select({
			parameterId: testReadings.parameterId,
			value: testReadings.value,
			takenAt: tests.takenAt,
			n: sql<number>`row_number() over (partition by ${testReadings.parameterId} order by ${tests.takenAt} desc)`.as('n')
		})
		.from(testReadings)
		.innerJoin(tests, eq(tests.id, testReadings.testId))
		.where(inArray(testReadings.parameterId, paramIds))
		.as('ranked');
	for (const r of db.select().from(ranked).where(lte(ranked.n, SPARK_READINGS)).orderBy(ranked.takenAt).all()) out.get(r.parameterId)?.push(r.value);
	return out;
}

/** The alert keys a form names: one, or every one listed for Mark all read. */
async function keysOf(request: Request) {
	const form = await request.formData();
	const keys = form.getAll('key').filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 200);
	if (!keys.length || keys.length > 300) error(400, 'Pick an alert to mark.');
	return keys;
}

export const actions: Actions = {
	read: async ({ request, locals }) => {
		markAlertsSeen(locals.user!.id, await keysOf(request));
		return { ok: true };
	},
	unread: async ({ request, locals }) => {
		unmarkAlertsSeen(locals.user!.id, await keysOf(request));
		return { ok: true };
	}
};
