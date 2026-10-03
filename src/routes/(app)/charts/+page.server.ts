import { and, eq, gte } from 'drizzle-orm';
import { eventTitle } from '$lib/events';
import { displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, statusOf } from '$lib/params';
import { statusIcon, statusShort } from '$lib/status';
import { fmtDate, fmtDay, dateInZone } from '$lib/time';
import { formatNumber } from '$lib/units';
import { db } from '$lib/server/db';
import { tests } from '$lib/server/db/schema';
import { eventsSince, latestReadings, series } from '$lib/server/logs';
import { getTank, listParams, listTanks } from '$lib/server/tanks';
import { tankNotes } from '$lib/server/trends';
import { CHART_RANGES } from '$lib/charts';
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

	const withData = params.filter((p) => latest.has(p.id));
	const param =
		params.find((p) => p.id === url.searchParams.get('p')) ??
		withData.find((p) => statusOf(p, latest.get(p.id)?.value).level === 'bad') ??
		withData[0] ??
		params[0];

	const list = params.map((p) => {
		const st = statusOf(p, latest.get(p.id)?.value);
		return { id: p.id, name: p.name, unit: paramUnit(p, user), level: st.level, icon: statusIcon[st.level], status: statusShort(st) };
	});
	if (!param) return { tank: { id: tank.id, name: tank.name }, range: range.key, list, chart: null };

	const raw = series(tank.id, param.id, since);
	// a click on a reading opens its test in History: the test taken at that instant
	const testAt = new Map(
		db
			.select({ id: tests.id, takenAt: tests.takenAt })
			.from(tests)
			.where(and(eq(tests.tankId, tank.id), gte(tests.takenAt, since)))
			.all()
			.map((t) => [t.takenAt, t.id])
	);
	const points = raw.map((r) => ({
		t: Date.parse(r.takenAt),
		v: displayValue(param, r.value, user),
		href: testAt.has(r.takenAt) ? `/entries/test/${testAt.get(r.takenAt)}` : undefined
	}));
	// Too few points in this range: is it the range, or are there no tests yet?
	const allTime = points.length < 2 && range.days ? series(tank.id, param.id, '0000').length : points.length;
	const from = range.days ? now - range.days * 86_400_000 : (points[0]?.t ?? now - 30 * 86_400_000);

	// Events on the timeline, with the reading just before and after each one.
	const evs = eventsSince(tank.id, ['water_change', 'dosing'], new Date(from).toISOString());
	const fv = (stored: number) => fmtValue(param, stored, user);
	const markers = evs.map((e) => {
		const t = Date.parse(e.occurredAt);
		const before = [...raw].reverse().find((r) => Date.parse(r.takenAt) <= t);
		const after = raw.find((r) => Date.parse(r.takenAt) > t);
		return {
			t,
			href: `/entries/event/${e.id}`,
			kind: e.category === 'dosing' ? ('dosing' as const) : ('water_change' as const),
			label: eventTitle(e, user),
			day: fmtDate(dateInZone(e.occurredAt, user.timeZone)),
			change: before && after ? `${param.name} ${fv(before.value)} → ${fv(after.value)}${paramUnit(param, user) ? ' ' + paramUnit(param, user) : ''}` : null
		};
	});

	// Compare: the same parameter in the keeper's other tanks, over the same range
	const same = (o: (typeof params)[number]) => o.key === param.key && (param.key !== 'custom' || o.name.trim().toLowerCase() === param.name.trim().toLowerCase());
	const others = listTanks(user.id)
		.filter((t) => t.id !== tank.id)
		.flatMap((t) => {
			const o = listParams(t.id, { all: true }).find(same);
			const last = o && latestReadings(t.id).get(o.id);
			if (!o || !last) return [];
			const st = statusOf(o, last.value);
			return [
				{
					tankId: t.id,
					tankName: t.name,
					paramId: o.id,
					latest: `${fmtValue(o, last.value, user)}${paramUnit(o, user) ? ` ${paramUnit(o, user)}` : ''}`,
					level: st.level,
					status: statusShort(st),
					points: series(t.id, o.id, since).map((r) => ({ t: Date.parse(r.takenAt), v: displayValue(o, r.value, user) })),
					band: {
						min: o.min == null ? null : displayValue(o, o.min, user),
						max: o.max == null ? null : displayValue(o, o.max, user)
					},
					target: fmtRange(o, user),
					decimals: paramDecimals(o, user)
				}
			];
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

	return {
		tank: { id: tank.id, name: tank.name },
		range: range.key,
		list,
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
			allTime,
			from,
			to: now,
			markers,
			stats,
			insight: insight ? { text: insight.text, warn: insight.warn, up: insight.direction === 'up' } : null,
			others
		}
	};
};
