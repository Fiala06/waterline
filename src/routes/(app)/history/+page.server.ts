import { inArray } from 'drizzle-orm';
import { eventIcon, eventKindLabel, eventTitle } from '$lib/events';
import { shortName, statusOf, fmtValue } from '$lib/params';
import { addDays, dateInZone, daysBetween, fmtDate, fmtDateLong, fmtTime, fmtWeekday, isDate, todayInZone, zonedToUtc } from '$lib/time';
import { db } from '$lib/server/db';
import { testReadings } from '$lib/server/db/schema';
import { eventView, testView, type EntryView } from '$lib/server/entry-view';
import { thumbsFor } from '$lib/server/photos';
import { cursorText, historyCounts, historyPage, olderCount, parseCursor, type HistoryWindow } from '$lib/server/history-page';
import { isShared, tankPeople } from '$lib/server/members';
import { getTank, listParams, roleOn } from '$lib/server/tanks';
import { searchTerm } from '$lib/search';
import { FILTERS, RANGES } from '$lib/history';
import { RANGE_COOKIE, rememberOptions } from '$lib/remember';
import type { PageServerLoad } from './$types';

// the range picked last time, so History opens the way it was left (All time, once chosen, stays)
export const load: PageServerLoad = async ({ locals, parent, url, cookies, isDataRequest }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null };
	const tank = getTank(user.id, currentTankId);
	const role = roleOn(user.id, tank);
	const tz = user.timeZone;

	const cat = FILTERS.some((f) => f.key === url.searchParams.get('cat')) ? url.searchParams.get('cat')! : 'all';
	const valid = (v: string | null | undefined) => !!v && RANGES.some((r) => r.key === v);
	const asked = url.searchParams.get('range');
	const saved = cookies.get(RANGE_COOKIE);
	// dates of the keeper's own choosing (#312): ?from= and ?to=, days in their time zone, either one or both
	const day = (k: string) => {
		const v = url.searchParams.get(k);
		return v && isDate(v) ? v : null;
	};
	let from = day('from');
	let to = day('to');
	if (from && to && from > to) [from, to] = [to, from];
	// a preset picked from the menu wins over dates left in the form
	const custom = asked === 'custom' || (!valid(asked) && !!(from || to));
	const range = custom ? 'custom' : valid(asked) ? asked! : valid(saved) ? saved! : '30';
	// kept on a real visit only (#223), as the current tank is: see $lib/remember (never a range of dates)
	if (!isDataRequest && !custom && (valid(asked) || valid(saved))) cookies.set(RANGE_COOKIE, range, rememberOptions);
	const since = custom
		? from
			? zonedToUtc(from, '00:00', tz).toISOString()
			: '0000'
		: range === 'all'
			? '0000'
			: new Date(Date.now() - Number(range) * 86_400_000).toISOString();
	const until = custom && to ? zonedToUtc(addDays(to, 1), '00:00', tz).toISOString() : null;
	// the search box (#312): matched in SQL before counting and paging
	const search = searchTerm(url.searchParams.get('q'));
	const window: HistoryWindow = { since, until, search };

	// counted and filtered in SQL, and a page at a time (#240): see $lib/server/history-page
	const counts = historyCounts(tank.id, window);
	const before = parseCursor(url.searchParams.get('before'));
	const listed = historyPage({ tankId: tank.id, ...window, cat, before });
	const shownTests = listed.entries.flatMap((x) => (x.kind === 'test' ? [x.row] : []));
	const shownEvents = listed.entries.flatMap((x) => (x.kind === 'event' ? [x.row] : []));

	// what's before the range, so a short range never looks like missing data: "42 older entries · Show all time"
	let older: { count: number; before: string } | null = null;
	if (since !== '0000') {
		const n = olderCount(tank.id, window, cat);
		if (n) older = { count: n, before: fmtDate(dateInZone(since, tz)) };
	}
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
			// this page's tests only
			.where(inArray(testReadings.testId, shownTests.map((t) => t.id)))
			.all();
		for (const r of rows) {
			countByTest.set(r.testId, (countByTest.get(r.testId) ?? 0) + 1);
			const p = params.get(r.parameterId);
			if (p && statusOf(p, r.value).level === 'bad') {
				badByTest.set(r.testId, [...(badByTest.get(r.testId) ?? []), `✕ ${shortName(p)} ${fmtValue(p, r.value, user)}`]);
			}
		}
	}

	// a shared tank (#22): each entry says who logged it
	const people = isShared(tank.id) ? tankPeople(tank) : null;
	const by = (userId: string | null) => (people && userId && people.has(userId) ? ` · by ${people.get(userId)}` : '');
	type Item = { key: string; href: string; at: string; icon: string; title: string; sub: string; bad: string | null; thumb: string | null };
	// in the page's order: newest first, tests before events at the same moment
	const items: Item[] = listed.entries.map((x): Item => {
		if (x.kind === 'test') {
			const t = x.row;
			const n = countByTest.get(t.id) ?? 0;
			const bad = badByTest.get(t.id);
			return {
				key: `test:${t.id}`,
				href: `/entries/test/${t.id}`,
				at: t.takenAt,
				icon: 'test',
				title: `Water test · ${n} reading${n === 1 ? '' : 's'}`,
				sub: `${fmtTime(t.takenAt, tz)}${!bad && t.note ? ` · ${t.note}` : ''}${by(t.loggedBy)}`,
				bad: bad ? bad.join(', ') : null,
				thumb: thumbs.get(t.id) ?? null
			};
		}
		const e = x.row;
		return {
			key: `event:${e.id}`,
			href: `/entries/event/${e.id}`,
			at: e.occurredAt,
			icon: eventIcon(e),
			title: eventTitle(e, user),
			// a dose a doser made (#196) says so, as an entry someone else logged says who
			sub: `${fmtTime(e.occurredAt, tz)}${e.category === 'water_change' ? '' : ` · ${eventKindLabel(e)}`}${e.data.auto === true ? ' · by the doser' : by(e.loggedBy)}`,
			bad: null,
			thumb: thumbs.get(e.id) ?? null
		};
	});

	const today = todayInZone(tz);
	const groups: { day: string; label: string; items: Item[] }[] = [];
	for (const it of items) {
		const day = dateInZone(it.at, tz);
		let g = groups.at(-1);
		if (!g || g.day !== day) {
			const long = fmtWeekday(day).replace(',', '').toUpperCase();
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
		// every entry of the range in this category, however many are on the page
		total: counts[cat] ?? 0,
		// "Show older": the entries of the range after this page
		more: listed.next ? { before: cursorText(listed.next), count: listed.remaining } : null,
		// on a later page: where it starts, for the way back to the newest
		from: before ? fmtDate(dateInZone(before.at, tz)) : null,
		older,
		rangeLabel: custom ? customLabel(from, to) : RANGES.find((r) => r.key === range)!.label,
		search,
		dates: { from: from ?? '', to: to ?? '' },
		selected: detail ? `${detail.kind}:${detail.id}` : null,
		detail
	};
};

/** "Oct 1 – Oct 31, 2026", "Since Oct 1, 2026", "Until Oct 31, 2026", or all time with neither. */
function customLabel(from: string | null, to: string | null): string {
	if (from && to) return `${fmtDateLong(from)} – ${fmtDateLong(to)}`;
	if (from) return `Since ${fmtDateLong(from)}`;
	if (to) return `Until ${fmtDateLong(to)}`;
	return 'All time';
}
