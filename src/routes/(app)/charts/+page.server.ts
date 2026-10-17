import { and, eq, gte } from 'drizzle-orm';
import { eventTitle } from '$lib/events';
import { displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, statusOf } from '$lib/params';
import { statusIcon, statusShort } from '$lib/status';
import { fmtDate, fmtDay, dateInZone } from '$lib/time';
import { formatNumber } from '$lib/units';
import { db } from '$lib/server/db';
import { tests } from '$lib/server/db/schema';
import { eventsSince, latestReadings, series } from '$lib/server/logs';
import { getTank, listParams } from '$lib/server/tanks';
import { tankNotes } from '$lib/server/trends';
import { displaySamples, isLive, latestSamples, sampleCount, sampleSeries } from '$lib/server/sensors';
import { fmtWhen } from '$lib/time';
import { CHART_RANGES, equipmentTypeLookup, overlayKind, parseCompare } from '$lib/charts';
import { equipmentName } from '$lib/equipment';
import { whatChanged } from '$lib/what-changed';
import { listEquipment } from '$lib/server/specs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null };
	const tank = getTank(user.id, currentTankId);
	const latest = latestReadings(tank.id);
	const params = listParams(tank.id, { all: true }).filter((p) => p.tracked || latest.has(p.id));

	const range = CHART_RANGES.find((r) => r.key === url.searchParams.get('r')) ?? CHART_RANGES[1];
	const now = Date.now();
	const since = range.days ? new Date(now - range.days * 86_400_000).toISOString() : '0000';

	// a parameter a sensor reports counts as having data too (#130)
	const live = latestSamples(tank.id);
	const withData = params.filter((p) => latest.has(p.id) || live.has(p.id));
	const param =
		params.find((p) => p.id === url.searchParams.get('p')) ??
		withData.find((p) => statusOf(p, latest.get(p.id)?.value).level === 'bad') ??
		withData[0] ??
		params[0];

	const list = params.map((p) => {
		const st = statusOf(p, latest.get(p.id)?.value);
		return { id: p.id, name: p.name, unit: paramUnit(p, user), level: st.level, icon: statusIcon[st.level], status: statusShort(st) };
	});
	if (!param) return { tank: { id: tank.id, name: tank.name }, range: range.key, list, chart: null, all: null };

	// a click on a reading opens its test in History: the test taken at that instant
	const testAt = new Map(
		db
			.select({ id: tests.id, takenAt: tests.takenAt })
			.from(tests)
			.where(and(eq(tests.tankId, tank.id), gte(tests.takenAt, since)))
			.all()
			.map((t) => [t.takenAt, t.id])
	);
	const hrefAt = (takenAt: string) => (testAt.has(takenAt) ? `/entries/test/${testAt.get(takenAt)}` : undefined);
	// Events on the timeline (#88: each overlay kind on its own switch on the page)
	const equipmentType = equipmentTypeLookup(listEquipment(user.id, tank.id).map((i) => ({ id: i.id, name: equipmentName(i), type: i.type })));
	// (feeding and livestock changes aren't drawn, but belong in What changed? below)
	const eventsFrom = (from: number) => eventsSince(tank.id, ['water_change', 'dosing', 'maintenance', 'equipment', 'observation', 'feeding', 'livestock'], new Date(from).toISOString());
	const markersOf = (evs: ReturnType<typeof eventsFrom>) =>
		evs.flatMap((e) => {
			const kind = overlayKind(e, equipmentType);
			if (!kind) return [];
			return [{ t: Date.parse(e.occurredAt), href: `/entries/event/${e.id}`, kind, label: eventTitle(e, user), day: fmtDate(dateInZone(e.occurredAt, user.timeZone)), change: null as string | null }];
		});

	// Every parameter on one chart, each against its own target (?p=all)
	if (url.searchParams.get('p') === 'all') {
		const lines = params.map((p) => {
			const st = statusOf(p, latest.get(p.id)?.value);
			return {
				id: p.id,
				name: p.name,
				unit: paramUnit(p, user),
				decimals: paramDecimals(p, user),
				target: fmtRange(p, user),
				band: {
					min: p.min == null ? null : displayValue(p, p.min, user),
					max: p.max == null ? null : displayValue(p, p.max, user)
				},
				points: series(tank.id, p.id, since).map((r) => ({ t: Date.parse(r.takenAt), v: displayValue(p, r.value, user), href: hrefAt(r.takenAt) })),
				latest: latest.has(p.id) ? fmtValue(p, latest.get(p.id)!.value, user) : null,
				level: st.level,
				status: statusShort(st)
			};
		});
		const drawn = lines.filter((l) => l.points.length && (l.band.min != null || l.band.max != null));
		const first = Math.min(...drawn.map((l) => l.points[0].t));
		const from = range.days ? now - range.days * 86_400_000 : Number.isFinite(first) ? first : now - 30 * 86_400_000;
		return {
			tank: { id: tank.id, name: tank.name },
			range: range.key,
			list,
			chart: null,
			all: {
				lines: drawn,
				// tested in this range but nothing to hold them against
				noTarget: lines.filter((l) => l.points.length && l.band.min == null && l.band.max == null).map((l) => l.name),
				// nothing in this range: is it the range, or are there no tests yet?
				anyEver: latest.size > 0,
				from,
				to: now,
				markers: markersOf(eventsFrom(from))
			}
		};
	}

	const raw = series(tank.id, param.id, since);
	// compared parameters (#87): up to two more, each on its own scale, from ?c=id,id
	const compare = parseCompare(url.searchParams.getAll('c').join(','), params.map((p) => p.id), param.id).map((id) => {
		const cp = params.find((p) => p.id === id)!;
		return {
			id: cp.id,
			name: cp.name,
			unit: paramUnit(cp, user),
			decimals: paramDecimals(cp, user),
			points: series(tank.id, cp.id, since).map((r) => ({ t: Date.parse(r.takenAt), v: displayValue(cp, r.value, user) }))
		};
	});
	// readings from a sensor (#19): a thin line under the tests, and the latest as Live
	const sensor = displaySamples(sampleSeries(tank.id, param.id, since), param, user);
	const liveSample = live.get(param.id);
	const liveStat = liveSample
		? {
				value: fmtValue(param, liveSample.value, user),
				level: statusOf(param, liveSample.value).level,
				status: statusShort(statusOf(param, liveSample.value)),
				at: fmtWhen(liveSample.at, user.timeZone),
				source: liveSample.source,
				// Live while the sensor keeps reporting, Last once it's gone quiet
				fresh: isLive(liveSample.at, liveSample.prevAt)
			}
		: null;
	const points = raw.map((r) => ({ t: Date.parse(r.takenAt), v: displayValue(param, r.value, user), href: hrefAt(r.takenAt) }));
	// Too few points in this range: is it the range, or is there nothing yet?
	// Sensor samples count as readings here (#130): a probe's chart shows
	// without a test, and a range with none says to try a longer one.
	const enough = points.length >= 2 || sensor.length >= 2;
	const allTime = enough || !range.days ? Math.max(points.length, sensor.length) : Math.max(series(tank.id, param.id, '0000').length, sampleCount(tank.id, param.id));
	const from = range.days ? now - range.days * 86_400_000 : (points[0]?.t ?? sensor[0]?.t ?? now - 30 * 86_400_000);

	// the events in range, with the reading just before and after each one
	const evs = eventsFrom(from);
	const fv = (stored: number) => fmtValue(param, stored, user);
	const markers = markersOf(evs).map((m) => {
		const before = [...raw].reverse().find((r) => Date.parse(r.takenAt) <= m.t);
		const after = raw.find((r) => Date.parse(r.takenAt) > m.t);
		return { ...m, change: before && after ? `${param.name} ${fv(before.value)} → ${fv(after.value)}${paramUnit(param, user) ? ' ' + paramUnit(param, user) : ''}` : null };
	});

	const values = raw.map((r) => r.value);
	const inRange = values.filter((v) => statusOf(param, v).level !== 'bad').length;
	const lastValue = values.at(-1);
	const unit = paramUnit(param, user);
	const withUnit = (s: string) => (unit ? `${s} ${unit}` : s);
	// "+11 since Sep 29": the latest reading against the one before it
	const change = (() => {
		if (raw.length < 2) return null;
		const a = raw[raw.length - 2];
		const b = raw[raw.length - 1];
		const delta = displayValue(param, b.value, user) - displayValue(param, a.value, user);
		const dec = paramDecimals(param, user);
		const amount = Math.abs(delta) < 10 ** -dec / 2 ? 'No change' : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), dec)}`;
		const before = fmtDay(a.takenAt, user.timeZone);
		return { amount, over: before === 'Today' ? 'since the test before' : `since ${before.toLowerCase() === 'yesterday' ? 'yesterday' : before}` };
	})();
	const stats = values.length
		? {
				latest: fv(lastValue!),
				latestLevel: statusOf(param, lastValue).level,
				latestStatus: statusShort(statusOf(param, lastValue)),
				average: withUnit(fv(values.reduce((a, b) => a + b, 0) / values.length)),
				range: withUnit(`${fv(Math.min(...values))}–${fv(Math.max(...values))}`),
				inTarget: `${inRange} of ${values.length}`,
				inRangePct: `${Math.round((inRange / values.length) * 100)}%`,
				change,
				count: values.length
			}
		: null;
	// What stands out (a run, a pace, a pattern), as the dashboard tells it
	const insight = tankNotes(tank.id, user).find((n) => n.parameterId === param.id) ?? null;
	// What changed? (#89): the latest move worth a word, and what was logged in that stretch
	const changed = whatChanged(
		param,
		raw.map((r) => ({ t: Date.parse(r.takenAt), value: r.value })),
		evs.map((e) => ({ id: e.id, t: Date.parse(e.occurredAt), title: eventTitle(e, user) })),
		user
	);

	return {
		tank: { id: tank.id, name: tank.name },
		range: range.key,
		list,
		all: null,
		chart: {
			paramId: param.id,
			name: param.name,
			unit: paramUnit(param, user),
			decimals: paramDecimals(param, user),
			target: fmtRange(param, user),
			// "5–20", for "ppm · target 5–20" next to the unit
			targetBare: fmtRange(param, user, false),
			band: {
				min: param.min == null ? null : displayValue(param, param.min, user),
				max: param.max == null ? null : displayValue(param, param.max, user)
			},
			points,
			sensor,
			compare,
			live: liveStat,
			allTime,
			from,
			to: now,
			markers,
			stats,
			insight: insight ? { text: insight.text, warn: insight.warn, up: insight.direction === 'up' } : null,
			changed: changed
				? {
						headline: changed.headline,
						up: changed.direction === 'up',
						days: changed.days,
						events: changed.events.map((e) => ({ href: `/entries/event/${e.id}`, title: e.title, day: fmtDate(dateInZone(new Date(e.t).toISOString(), user.timeZone)) }))
					}
				: null
		}
	};
};
