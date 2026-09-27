import { and, desc, eq, gte } from 'drizzle-orm';
import { eventIcon, eventKindLabel, eventTitle } from '$lib/events';
import { shortName, statusOf, fmtValue } from '$lib/params';
import { dateInZone, daysBetween, fmtTime, todayInZone } from '$lib/time';
import { db } from '$lib/server/db';
import { events, testReadings, tests } from '$lib/server/db/schema';
import { eventView, testView, type EntryView } from '$lib/server/entry-view';
import { thumbsFor } from '$lib/server/photos';
import { getTank, listParams } from '$lib/server/tanks';
import type { EventCategory } from '$lib/types';
import { FILTERS, RANGES } from '$lib/history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null };
	const tank = getTank(user.id, currentTankId);
	const tz = user.timeZone;

	const cat = FILTERS.some((f) => f.key === url.searchParams.get('cat')) ? url.searchParams.get('cat')! : 'all';
	const range = RANGES.some((r) => r.key === url.searchParams.get('range')) ? url.searchParams.get('range')! : '30';
	const since = range === 'all' ? '0000' : new Date(Date.now() - Number(range) * 86_400_000).toISOString();

	const allTests = db
		.select()
		.from(tests)
		.where(and(eq(tests.tankId, tank.id), gte(tests.takenAt, since)))
		.orderBy(desc(tests.takenAt))
		.all();
	const allEvents = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tank.id), gte(events.occurredAt, since)))
		.orderBy(desc(events.occurredAt))
		.all();

	const counts: Record<string, number> = { all: allTests.length + allEvents.length, test: allTests.length };
	for (const e of allEvents) counts[e.category] = (counts[e.category] ?? 0) + 1;

	const showTests = cat === 'all' || cat === 'test';
	const shownEvents = cat === 'all' ? allEvents : cat === 'test' ? [] : allEvents.filter((e) => e.category === (cat as EventCategory));
	const shownTests = showTests ? allTests : [];
	const thumbs = thumbsFor(
		shownEvents.map((e) => e.id),
		shownTests.map((t) => t.id)
	);

	// Out-of-range readings per test, for "8:12 AM · ✕ Nitrate 35".
	const params = new Map(listParams(tank.id, { all: true }).map((p) => [p.id, p]));
	const badByTest = new Map<string, string[]>();
	const countByTest = new Map<string, number>();
	if (shownTests.length) {
		const rows = db
			.select({ testId: testReadings.testId, parameterId: testReadings.parameterId, value: testReadings.value })
			.from(testReadings)
			.innerJoin(tests, eq(tests.id, testReadings.testId))
			.where(and(eq(tests.tankId, tank.id), gte(tests.takenAt, since)))
			.all();
		for (const r of rows) {
			countByTest.set(r.testId, (countByTest.get(r.testId) ?? 0) + 1);
			const p = params.get(r.parameterId);
			if (p && statusOf(p, r.value).level === 'bad') {
				badByTest.set(r.testId, [...(badByTest.get(r.testId) ?? []), `✕ ${shortName(p)} ${fmtValue(p, r.value, user)}`]);
			}
		}
	}

	type Item = { key: string; href: string; at: string; icon: string; title: string; sub: string; bad: string | null; thumb: string | null };
	const items: Item[] = [
		...shownTests.map((t) => {
			const n = countByTest.get(t.id) ?? 0;
			const bad = badByTest.get(t.id);
			return {
				key: `test:${t.id}`,
				href: `/entries/test/${t.id}`,
				at: t.takenAt,
				icon: 'test',
				title: `Water test · ${n} reading${n === 1 ? '' : 's'}`,
				sub: `${fmtTime(t.takenAt, tz)}${!bad && t.note ? ` · ${t.note}` : ''}`,
				bad: bad ? bad.join(', ') : null,
				thumb: thumbs.get(t.id) ?? null
			};
		}),
		...shownEvents.map((e) => ({
			key: `event:${e.id}`,
			href: `/entries/event/${e.id}`,
			at: e.occurredAt,
			icon: eventIcon(e),
			title: eventTitle(e, user),
			sub: `${fmtTime(e.occurredAt, tz)}${e.category === 'water_change' ? '' : ` · ${eventKindLabel(e)}`}`,
			bad: null,
			thumb: thumbs.get(e.id) ?? null
		}))
	].sort((a, b) => b.at.localeCompare(a.at));

	const today = todayInZone(tz);
	const groups: { day: string; label: string; items: Item[] }[] = [];
	for (const it of items) {
		const day = dateInZone(it.at, tz);
		let g = groups.at(-1);
		if (!g || g.day !== day) {
			const long = new Date(day + 'T12:00:00Z')
				.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
				.replace(',', '')
				.toUpperCase();
			const diff = daysBetween(day, today);
			g = { day, label: diff === 0 ? `TODAY · ${long}` : diff === 1 ? `YESTERDAY · ${long}` : long, items: [] };
			groups.push(g);
		}
		g.items.push(it);
	}

	// Desktop detail pane: ?entry=test:<id> or event:<id>, defaulting to the newest.
	const wanted = url.searchParams.get('entry') ?? items[0]?.key ?? null;
	let detail: EntryView | null = null;
	if (wanted) {
		const [kind, id] = wanted.split(':');
		try {
			detail = kind === 'test' ? testView(user, id) : kind === 'event' ? eventView(user, id) : null;
		} catch {
			detail = null;
		}
	}

	return {
		tank: { id: tank.id, name: tank.name },
		cat,
		range,
		counts,
		groups,
		total: items.length,
		selected: detail ? `${detail.kind}:${detail.id}` : null,
		detail
	};
};
