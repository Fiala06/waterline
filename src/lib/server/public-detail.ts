// The public page's diagnostic detail: what someone helping a keeper with a
// problem needs to see at once. The keeper's question, what's out of range and
// what it was before, every reading lined up against water changes, dosing and
// changes to the tank, the test log, the setup and routine, losses and the care
// log by day. Only what the owner's switches allow: with "Detail for people
// helping me" off, days only (no times), no notes, no observations and no
// schedule, as the page has always been.
import { and, eq, isNull } from 'drizzle-orm';
import { tankLighting, equipmentName, specSummary, scheduleLabel, hoursText, EQUIPMENT_TYPE_LABEL, type Schedule } from '$lib/equipment';
import { eventKindLabel, eventTitle, WATER_SOURCES } from '$lib/events';
import { displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, shortName, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { dueInfo, effectiveDue, intervalText } from '$lib/tasks';
import { addDays, daysBetween, fmtDate, fmtTime, todayInZone, utcToZoned } from '$lib/time';
import { tankTypeLabel } from '$lib/types';
import { careLine, tankTargets, tankWarnings } from '$lib/care';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import type { EventCategory } from '$lib/types';
import { db } from './db';
import { equipment, livestock, plants, tasks, type Event, type PublicPage, type Tank, type User } from './db/schema';
import { eventsSince, latestReadings, testsSince } from './logs';
import { scheduledItems } from './specs';
import { careFor } from './species-care';
import { displaySamples, latestSamples, sampleSeries } from './sensors';
import { bySpecies, livestockLabel, speciesKey } from '$lib/livestock';
import { listParams } from './tanks';

const SOURCES: Record<string, string> = { tap: 'Tap', rodi: 'RODI', mix: 'Mix', well: 'Well' };
/** the categories a visitor sees without the detail switch, and the ones it adds */
const CARE_CATEGORIES: EventCategory[] = ['water_change', 'dosing', 'maintenance', 'livestock', 'equipment'];
const DETAIL_CATEGORIES: EventCategory[] = ['observation', 'note', 'feeding', 'health'];
const MAX_TESTS = 200;
const MAX_CARE = 300;

type Level = 'ok' | 'warn' | 'bad' | 'none';
const dow = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "PDT": the zone's short name today, for "All times PDT". */
export function zoneLabel(tz: string, now = new Date()) {
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? tz;
	} catch {
		return tz;
	}
}

// Pets stay unnamed unless the owner turns their names on (as on the rest of the page)
// (a health entry lists its animals as "Zippy · Otocinclus": the species stays)
const withoutPetNames = (e: Event): Event => ({
	...e,
	data: { ...e.data, nickname: null, previous: null, ...(Array.isArray(e.data.names) ? { names: (e.data.names as string[]).map((n) => n.split(' · ').at(-1)!) } : {}) }
});
const isNaming = (e: Event) => e.category === 'livestock' && e.data.action === 'named';
const isLoss = (e: Event) => e.category === 'livestock' && e.data.kind !== 'plant' && e.data.action === 'removed' && e.data.reason === 'loss';

/** A day's lights or CO₂ as fractions of the day, for the 24-hour bar. */
function bars(s: Schedule | null | undefined) {
	if (!s) return [];
	const min = (hm: string) => {
		const [h, m] = hm.split(':').map(Number);
		return h * 60 + m;
	};
	return s.periods.flatMap((p) => {
		const on = min(p.on);
		const off = min(p.off);
		// across midnight: two pieces
		return off > on
			? [{ from: on / 1440, to: off / 1440, label: `${p.on}–${p.off}` }]
			: [
					{ from: on / 1440, to: 1, label: `${p.on}–${p.off}` },
					{ from: 0, to: off / 1440, label: '' }
				];
	});
}

export function publicDetail(page: PublicPage, tank: Tank, owner: User, opts: { days: number; now?: Date }) {
	const now = opts.now ?? new Date();
	const tz = owner.timeZone;
	const prefs = owner;
	const details = page.showDetails;
	const names = page.showPetNames;
	const today = todayInZone(tz, now);
	const params = listParams(tank.id);
	const latest = latestReadings(tank.id);
	const byId = new Map(params.map((p) => [p.id, p]));

	// Every instant on the page is placed on the keeper's wall clock: a test at 7:12 PM
	// in Oregon sits at 7:12 PM on the chart wherever the visitor is. Without detail, noon of its day.
	const wall = (instant: string) => {
		const z = utcToZoned(instant, tz);
		return Date.parse(`${z.date}T${details ? z.time : '12:00'}:00Z`);
	};
	const dayOf = (instant: string) => utcToZoned(instant, tz).date;
	// "Oct 13 · 7:12 PM" with detail, "Oct 13" without
	const when = (instant: string) => (details ? `${fmtDate(dayOf(instant))} · ${fmtTime(instant, tz)}` : fmtDate(dayOf(instant)));

	// The period: the visitor's chart range, from midnight that many days ago to the end of today
	const allTime = opts.days === 0;
	const firstDay = allTime ? null : addDays(today, -opts.days + 1);
	// a day's start on the keeper's clock, as an instant (a little before, to be safe across zones)
	const sinceInstant = firstDay ? new Date(Date.parse(firstDay + 'T00:00:00Z') - 14 * 3_600_000).toISOString() : '0000';
	const inRange = (instant: string) => !firstDay || dayOf(instant) >= firstDay;

	// ── Readings: the tests in the period, oldest first ────────────────────
	// the charts and the readings are separate switches (as they always were): each takes what it may
	const allTests = page.showReadings || page.showCharts ? testsSince(tank.id, sinceInstant).filter((t) => inRange(t.test.takenAt)) : [];
	const tests = page.showReadings ? allTests : [];
	const used = params.filter((p) => tests.some((t) => t.readings.has(p.id)));
	const chartedTests = page.showCharts ? allTests : [];
	// a probe or controller's readings (#19), the thin line in its lane, when readings are public
	const live = page.showReadings ? latestSamples(tank.id) : new Map();
	const sensorOf = (pid: string) => {
		const p = byId.get(pid)!;
		// a probe's line always runs at its hours, as it did on the old chart (and its tile says when)
		return displaySamples(sampleSeries(tank.id, pid, sinceInstant), p, prefs).map((s) => {
			const z = utcToZoned(new Date(s.t).toISOString(), tz);
			return { t: Date.parse(`${z.date}T${z.time}:00Z`), v: s.v };
		});
	};
	const charted = params.filter((p) => chartedTests.some((t) => t.readings.has(p.id)) || live.has(p.id));

	// ── Events: what was done to the tank in the period ────────────────────
	const categories = page.showActivity ? [...CARE_CATEGORIES, ...(details ? DETAIL_CATEGORIES : [])] : [];
	const evs = categories.length
		? eventsSince(tank.id, categories, sinceInstant)
				.filter((e) => inRange(e.occurredAt))
				.filter((e) => names || !isNaming(e))
				.filter((e) => !(e.category === 'note' && e.data.system)) // "Reviewed tank setup" and the like are the app's, not care
				.map((e) => (names ? e : withoutPetNames(e)))
		: [];
	const waterChanges = evs.filter((e) => e.category === 'water_change');

	// ── Needs attention: out of range or near a limit, with what it was before ──
	const cards = page.showReadings
		? params
				.filter((p) => latest.has(p.id))
				.map((p) => {
					const r = latest.get(p.id)!;
					const st = statusOf(p, r.value);
					// the readings before it, for "was 0 on Oct 9" and the small line
					const hist = testsSince(tank.id, new Date(Date.parse(r.takenAt) - 120 * 86_400_000).toISOString())
						.filter((t) => t.readings.has(p.id))
						.map((t) => ({ at: t.test.takenAt, v: t.readings.get(p.id)! }));
					const prev = [...hist].reverse().find((h) => h.at < r.takenAt);
					const spark = hist.slice(-10).map((h) => displayValue(p, h.v, prefs));
					return {
						id: p.id,
						name: shortName(p),
						longName: p.name,
						value: fmtValue(p, r.value, prefs),
						unit: paramUnit(p, prefs),
						level: st.level as Level,
						status: statusShort(st),
						target: fmtRange(p, prefs, false),
						prev: prev ? { value: fmtValue(p, prev.v, prefs), day: fmtDate(dayOf(prev.at)) } : null,
						spark,
						band: { min: p.min == null ? null : displayValue(p, p.min, prefs), max: p.max == null ? null : displayValue(p, p.max, prefs) },
						// "0 in 14 of 15 tests" for a reading stuck out of range
						outOf: (() => {
							const inPeriod = tests.filter((t) => t.readings.has(p.id));
							const out = inPeriod.filter((t) => statusOf(p, t.readings.get(p.id)!).level === 'bad').length;
							return inPeriod.length >= 3 && out >= 2 ? `out of range in ${out} of ${inPeriod.length} tests` : null;
						})()
					};
				})
		: [];
	const attention = cards.filter((c) => c.level === 'bad' || c.level === 'warn').sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
	const steady = cards.filter((c) => c.level !== 'bad' && c.level !== 'warn');

	// ── Readings & events, one shared time axis ────────────────────────────
	const pointTimes = chartedTests.map((t) => wall(t.test.takenAt));
	const from = firstDay ? Date.parse(firstDay + 'T00:00:00Z') : Math.min(Date.parse(today + 'T00:00:00Z') - 29 * 86_400_000, ...pointTimes, ...evs.map((e) => wall(e.occurredAt)));
	const to = Date.parse(addDays(today, 1) + 'T00:00:00Z');
	const lanes = page.showCharts
		? charted
				.map((p) => {
					const pts = chartedTests
						.filter((t) => t.readings.has(p.id))
						.map((t) => {
							const v = t.readings.get(p.id)!;
							const st = statusOf(p, v);
							return {
								t: wall(t.test.takenAt),
								v: displayValue(p, v, prefs),
								level: st.level as Level,
								label: `${when(t.test.takenAt)} · ${fmtValue(p, v, prefs)}${paramUnit(p, prefs) ? ` ${paramUnit(p, prefs)}` : ''} · ${statusShort(st)}`
							};
						});
					const l = latest.get(p.id);
					const st = statusOf(p, l?.value);
					return {
						id: p.id,
						name: p.name,
						unit: paramUnit(p, prefs),
						decimals: paramDecimals(p, prefs),
						target: fmtRange(p, prefs),
						band: { min: p.min == null ? null : displayValue(p, p.min, prefs), max: p.max == null ? null : displayValue(p, p.max, prefs) },
						points: pts,
						latest: l && page.showReadings ? `${fmtValue(p, l.value, prefs)}${paramUnit(p, prefs) ? ` ${paramUnit(p, prefs)}` : ''}` : null,
						sensor: live.has(p.id) ? sensorOf(p.id) : [],
						level: st.level as Level,
						status: statusShort(st)
					};
				})
				.filter((l) => l.points.length > 0 || l.sensor.length > 1)
				// problems first, then as the keeper orders them
				.sort((a, b) => ({ bad: 0, warn: 1, ok: 2, none: 3 })[a.level] - ({ bad: 0, warn: 1, ok: 2, none: 3 })[b.level])
		: [];
	const pct = (e: Event) => (typeof e.data.percent === 'number' ? `${formatNumber(e.data.percent, 0)}%` : null);
	const srcShort = (e: Event) => (e.data.source === 'rodi' ? 'RO' : (WATER_SOURCES.find((s) => s.value === e.data.source)?.label.toLowerCase() ?? null));
	const markers = {
		waterChanges: waterChanges.map((e) => ({ t: wall(e.occurredAt), short: [pct(e), srcShort(e)].filter(Boolean).join(' ') || 'WC', label: `${when(e.occurredAt)} · ${eventTitle(e, prefs)}` })),
		doses: evs
			.filter((e) => e.category === 'dosing')
			.map((e) => ({ t: wall(e.occurredAt), label: `${when(e.occurredAt)} · ${eventTitle(e, prefs)}` })),
		// everything else that changed, one numbered mark per day: "Sep 28 · Planted Java fern, Anubias +6 more"
		changes: (() => {
			const days = new Map<string, Event[]>();
			for (const e of evs.filter((x) => x.category !== 'water_change' && x.category !== 'dosing' && x.category !== 'feeding')) {
				const d = dayOf(e.occurredAt);
				days.set(d, [...(days.get(d) ?? []), e]);
			}
			return [...days].map(([d, list], i) => {
				const titles = list.map((e) => eventTitle(e, prefs));
				return {
					n: i + 1,
					t: Date.parse(d + 'T12:00:00Z'),
					day: fmtDate(d),
					text: titles.length > 4 ? `${titles.slice(0, 3).join('; ')}; +${titles.length - 3} more` : titles.join('; '),
					loss: list.some(isLoss)
				};
			});
		})()
	};
	const ticks = (() => {
		const spanDays = Math.round((to - from) / 86_400_000);
		const step = spanDays <= 14 ? 2 : spanDays <= 45 ? 7 : spanDays <= 120 ? 14 : spanDays <= 400 ? 30 : 90;
		const out: { t: number; label: string }[] = [];
		for (let t = to - 86_400_000; t >= from; t -= step * 86_400_000) {
			const d = new Date(t).toISOString().slice(0, 10);
			out.unshift({ t, label: fmtDate(d) });
		}
		return out;
	})();

	// ── Test log: every test in the period, newest first ───────────────────
	const changeTimes = waterChanges.map((e) => e.occurredAt);
	const testLog = {
		columns: used.map((p) => ({ id: p.id, name: shortName(p), unit: paramUnit(p, prefs) })),
		rows: [...tests]
			.reverse()
			.slice(0, MAX_TESTS)
			.map((t, i, all) => {
				const older = all[i + 1]?.test.takenAt ?? '';
				return {
					id: t.test.id,
					when: when(t.test.takenAt),
					cells: used.map((p) => {
						const v = t.readings.get(p.id);
						if (v == null) return null;
						const st = statusOf(p, v);
						return { v: fmtValue(p, v, prefs), level: st.level as Level, status: statusShort(st) };
					}),
					note: details ? (t.test.note?.trim() ?? null) : null,
					// a water change between this test and the one before it
					changeBefore: changeTimes.some((c) => c > older && c < t.test.takenAt)
				};
			}),
		more: tests.length > MAX_TESTS ? tests.length - MAX_TESTS : 0
	};

	// ── Setup ───────────────────────────────────────────────────────────────
	const len = (cm: number) => formatNumber(toDisplay(cm, 'length', prefs), 0);
	const vol = (l: number) => `${formatNumber(toDisplay(l, 'volume', prefs), 1)} ${unitLabel('volume', prefs)}`;
	const lighting = page.showEquipment ? tankLighting(tank, scheduledItems(tank.id)) : null;
	const setup = page.showEquipment
		? ([
				['Tank', [[tank.specBrand, tank.specModel].filter(Boolean).join(' '), tank.lengthCm && tank.widthCm && tank.heightCm ? `${len(tank.lengthCm)} × ${len(tank.widthCm)} × ${len(tank.heightCm)} ${unitLabel('length', prefs)}` : null, tank.glass].filter(Boolean).join(' · ') || null],
				['Volume', tank.nominalVolumeL != null ? `${vol(tank.nominalVolumeL)}${tank.actualVolumeL != null ? ` tank · ${vol(tank.actualVolumeL)} of water` : ''}` : null],
				['Substrate', tank.substrate],
				['Water source', tank.waterSource ? (SOURCES[tank.waterSource] ?? tank.waterSource) : null],
				['Set up', tank.startDate ? `${fmtDate(tank.startDate)}${tank.startDate.slice(0, 4) !== today.slice(0, 4) ? `, ${tank.startDate.slice(0, 4)}` : ''}` : null]
			].filter(([, v]) => v) as [string, string][])
		: [];
	const schedules = lighting
		? [
				lighting.lights && { name: 'Light', bars: bars(lighting.lights.schedule), text: [lighting.lights.hours != null ? hoursText(lighting.lights.hours) : null, lighting.lights.schedule.rampMin ? `${lighting.lights.schedule.rampMin} min ramp` : null].filter(Boolean).join(' · ') },
				lighting.co2 && { name: 'CO₂', bars: bars(lighting.co2.schedule), text: lighting.co2.hours != null ? hoursText(lighting.co2.hours) : '' }
			].filter((x): x is { name: string; bars: ReturnType<typeof bars>; text: string } => !!x)
		: [];
	const gear = page.showEquipment
		? db
				.select()
				.from(equipment)
				.where(and(eq(equipment.tankId, tank.id), isNull(equipment.removedAt)))
				.all()
				.map((e) => ({
					id: e.id,
					type: EQUIPMENT_TYPE_LABEL[e.type],
					name: equipmentName(e),
					spec: [...specSummary(e.type, e.specs, prefs).slice(0, 2), e.schedule ? scheduleLabel(e.schedule) : null].filter(Boolean).join(' · ') || null,
					since: e.installedAt ? fmtDate(e.installedAt) : null,
					// new in the period: worth knowing when something changed
					fresh: !!e.installedAt && !!firstDay && e.installedAt >= firstDay
				}))
		: [];

	// ── Routine: water changes and dosing in the period ────────────────────
	const pcts = waterChanges.map((e) => e.data.percent).filter((v): v is number => typeof v === 'number');
	const gaps = waterChanges.slice(1).map((e, i) => (Date.parse(e.occurredAt) - Date.parse(waterChanges[i].occurredAt)) / 86_400_000);
	const sources = new Map<string, number>();
	for (const e of waterChanges) if (typeof e.data.source === 'string') sources.set(SOURCES[e.data.source] ?? e.data.source, (sources.get(SOURCES[e.data.source] ?? e.data.source) ?? 0) + 1);
	const products = new Map<string, { count: number; last: string; amounts: Set<string> }>();
	for (const e of evs.filter((x) => x.category === 'dosing')) {
		const name = typeof e.data.product === 'string' && e.data.product ? e.data.product : 'Product';
		const g = products.get(name) ?? { count: 0, last: e.occurredAt, amounts: new Set<string>() };
		g.count++;
		g.last = e.occurredAt > g.last ? e.occurredAt : g.last;
		const amount = eventTitle(e, prefs).split(' · ')[1];
		if (amount) g.amounts.add(amount);
		products.set(name, g);
	}
	const routine = page.showActivity
		? {
				waterChanges: waterChanges.length,
				avgPct: pcts.length ? `${formatNumber(pcts.reduce((a, b) => a + b, 0) / pcts.length, 0)}%` : null,
				avgGap: gaps.length ? `${formatNumber(gaps.reduce((a, b) => a + b, 0) / gaps.length, 1)} d` : null,
				sources: [...sources].map(([k, n]) => `${k} for ${n} of ${waterChanges.length}`).join(' · ') || null,
				dosing: [...products].map(([product, g]) => ({ product, count: g.count, typical: [...g.amounts].slice(0, 2).join(', ') || null, last: fmtDate(dayOf(g.last)) })),
				feeding: details ? evs.some((e) => e.category === 'feeding') : null
			}
		: null;

	// ── The schedule: only with detail on (tasks were never public before) ─
	const schedule = details
		? db
				.select()
				.from(tasks)
				.where(eq(tasks.tankId, tank.id))
				.all()
				.filter((t) => t.nextDue)
				.map((t) => {
					const due = effectiveDue(t)!;
					const d = dueInfo(due, today);
					return { name: t.name, every: intervalText(t), due: d.days < 0 ? `${plural(-d.days, 'day')} overdue` : d.days === 0 ? 'due today' : `next ${fmtDate(due)}`, overdue: d.days < 0 };
				})
				.sort((a, b) => Number(b.overdue) - Number(a.overdue))
		: [];

	// ── Livestock: who's in, who was lost, and care ranges ─────────────────
	const rows = page.showLivestock
		? db
				.select()
				.from(livestock)
				.where(and(eq(livestock.tankId, tank.id), isNull(livestock.removedAt), eq(livestock.status, 'in_tank')))
				.all()
		: [];
	// with names: each group, then its pets by name ("Captain · Betta"); without, pets count with their species
	const animals = names
		? bySpecies(rows).map((l) => ({ id: l.id, name: livestockLabel(l), scientific: l.scientificName, count: l.count, since: l.addedAt ? fmtDate(l.addedAt) : null }))
		: [
				...rows
					.reduce((m, l) => {
						const g = m.get(speciesKey(l));
						if (g) {
							g.count += l.count;
							if (l.addedAt && (!g.added || l.addedAt < g.added)) g.added = l.addedAt;
						} else m.set(speciesKey(l), { id: l.id, name: l.commonName, scientific: l.scientificName, count: l.count, added: l.addedAt });
						return m;
					}, new Map<string, { id: string; name: string; scientific: string | null; count: number; added: string | null }>())
					.values()
			].map((g) => ({ id: g.id, name: g.name, scientific: g.scientific, count: g.count, since: g.added ? fmtDate(g.added) : null }));
	const losses =
		page.showLivestock && page.showActivity
			? evs.filter(isLoss).map((e) => ({ day: fmtDate(dayOf(e.occurredAt)), text: eventTitle(e, prefs).replace(/ · loss$/, ''), note: details ? (e.note?.trim() ?? null) : null }))
			: [];
	const lostCount = page.showLivestock && page.showActivity ? evs.filter(isLoss).reduce((n, e) => n + (typeof e.data.count === 'number' ? e.data.count : 1), 0) : 0;
	const plantList = page.showLivestock
		? db
				.select()
				.from(plants)
				.where(and(eq(plants.tankId, tank.id), isNull(plants.removedAt)))
				.all()
				.map((p) => ({ id: p.id, name: p.name, position: p.position }))
		: [];
	const kept = rows;
	// one entry per species (a named pet counts with its group), so nothing is said twice
	const perKind = [
		...kept
			.reduce((m, l) => {
				const g = m.get(speciesKey(l));
				if (g) g.count += l.count;
				else m.set(speciesKey(l), { s: l.scientificName, name: l.commonName, count: l.count });
				return m;
			}, new Map<string, { s: string | null; name: string; count: number }>())
			.values()
	];
	const care = perKind
		.map((l) => {
			const c = careFor(l.s);
			return c ? { name: l.name, line: careLine(c, prefs) } : null;
		})
		.filter((x): x is { name: string; line: string } => !!x);
	const warnings = kept.length
		? tankWarnings(
				perKind,
				careFor,
				tankTargets(params),
				prefs
			).map((w) => w.replace(/^▲ /, ''))
		: [];

	// ── Care log by day, newest first ──────────────────────────────────────
	type CareItem = { time: string | null; kind: string; category: string; title: string; note: string | null; loss: boolean; bad: boolean };
	const items: { at: string; item: CareItem }[] = [
		...evs.slice(-MAX_CARE).map((e) => {
			const title = eventTitle(e, prefs);
			const note = details ? (e.note?.trim() ?? null) : null;
			return {
				at: e.occurredAt,
				item: {
					time: details ? fmtTime(e.occurredAt, tz) : null,
					kind: eventKindLabel(e),
					category: e.category === 'health' ? 'observation' : e.category === 'note' ? 'observation' : e.category,
					title: e.category === 'note' ? (note?.split('\n')[0] ?? 'Note') : title,
					note: e.category === 'note' ? (note && note.includes('\n') ? note.split('\n').slice(1).join(' ') : null) : note && note !== title ? note : null,
					loss: isLoss(e),
					bad: false
				}
			};
		}),
		...tests.map((t) => {
			const out = used.filter((p) => t.readings.has(p.id) && statusOf(p, t.readings.get(p.id)!).level === 'bad');
			return {
				at: t.test.takenAt,
				item: {
					time: details ? fmtTime(t.test.takenAt, tz) : null,
					kind: 'Water test',
					category: 'test',
					title: out.length
						? out.map((p) => `${shortName(p)} ${fmtValue(p, t.readings.get(p.id)!, prefs)} ${statusShort(statusOf(p, t.readings.get(p.id)!)).replace('✕ ', '').toLowerCase()}`).join(', ')
						: `${plural(t.readings.size, 'reading')}, all in range`,
					note: details ? (t.test.note?.trim() ?? null) : null,
					loss: false,
					bad: out.length > 0
				}
			};
		})
	].sort((a, b) => b.at.localeCompare(a.at));
	const careDays: { day: string; dow: string; items: CareItem[] }[] = [];
	for (const { at, item } of items) {
		const d = dayOf(at);
		const label = d === today ? 'Today' : fmtDate(d);
		const last = careDays.at(-1);
		if (last && last.day === label) last.items.push(item);
		else careDays.push({ day: label, dow: dow(d), items: [item] });
	}

	// ── The header line ────────────────────────────────────────────────────
	const dayNumber = tank.startDate ? daysBetween(tank.startDate, today) + 1 : null;
	const size = tank.lengthCm && tank.widthCm && tank.heightCm ? `${len(tank.lengthCm)} × ${len(tank.widthCm)} × ${len(tank.heightCm)} ${unitLabel('length', prefs)}` : null;
	const units = [
		details ? `All times ${zoneLabel(tz, now)}` : 'Dates in the keeper’s time zone',
		`temperature ${unitLabel('temp', prefs)}`,
		`hardness in ${prefs.hardnessUnit === 'ppm' ? 'ppm' : 'dGH / dKH'}`,
		`volume in ${unitLabel('volume', prefs)}${prefs.unitSystem === 'imperial' ? ' (US)' : ''}`
	].join(' · ');

	return {
		details,
		question: page.question?.trim() || null,
		tankType: tankTypeLabel(tank.type),
		dayNumber,
		size,
		waterVolume: tank.actualVolumeL != null ? vol(tank.actualVolumeL) : null,
		units,
		attention,
		steady,
		lanes,
		markers: page.showCharts ? markers : { waterChanges: [], doses: [], changes: [] },
		axis: { from, to, ticks, now: details ? Date.parse(`${today}T${utcToZoned(now.toISOString(), tz).time}:00Z`) : Date.parse(today + 'T12:00:00Z') },
		testLog,
		setup,
		schedules,
		gear,
		routine,
		schedule,
		animals,
		losses,
		lostCount,
		plants: plantList,
		care,
		warnings,
		careDays,
		eventCount: evs.length
	};
}

export type PublicDetail = ReturnType<typeof publicDetail>;

/** The page as plain text for a forum post or a chat: what someone needs to help, nothing private. */
export function forumSummary(d: PublicDetail, v: { name: string; type: string; volume: string | null; keeper: string | null; url: string; periodTitle: string }) {
	const out: string[] = [];
	out.push(`${v.name} · ${[v.type, v.volume, d.dayNumber ? `day ${d.dayNumber}` : null].filter(Boolean).join(' · ')}`);
	out.push(d.units);
	if (d.question) out.push('', d.question);
	if (d.attention.length) {
		out.push('', 'Needs attention:');
		for (const a of d.attention) out.push(`- ${a.longName} ${a.value}${a.unit ? ` ${a.unit}` : ''} (${a.status}; target ${a.target}${a.prev ? `; was ${a.prev.value} on ${a.prev.day}` : ''})`);
	}
	if (d.steady.length) out.push('', `In range: ${d.steady.map((s) => `${s.name} ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join(', ')}`);
	if (d.setup.length || d.schedules.length) {
		out.push('', 'Setup:');
		for (const [k, val] of d.setup) out.push(`- ${k}: ${val}`);
		for (const s of d.schedules) out.push(`- ${s.name}: ${s.bars.map((b) => b.label).filter(Boolean).join(', ')}${s.text ? ` (${s.text})` : ''}`);
		for (const g of d.gear) out.push(`- ${g.type}: ${g.name}${g.spec ? ` · ${g.spec}` : ''}${g.since ? ` · since ${g.since}` : ''}`);
	}
	if (d.routine && d.routine.waterChanges) {
		out.push('', `Routine, ${v.periodTitle}:`);
		out.push(`- ${plural(d.routine.waterChanges, 'water change')}${d.routine.avgPct ? `, about ${d.routine.avgPct} each` : ''}${d.routine.avgGap ? `, every ${d.routine.avgGap} on average` : ''}${d.routine.sources ? ` (${d.routine.sources})` : ''}`);
		for (const p of d.routine.dosing) out.push(`- ${p.product}: ${plural(p.count, 'dose')}${p.typical ? `, ${p.typical}` : ''}, last ${p.last}`);
	}
	if (d.animals.length) out.push('', `Livestock: ${d.animals.map((a) => `${a.count > 1 ? `${a.count} ` : ''}${a.name}`).join(', ')}`);
	if (d.losses.length) out.push(`Losses, ${v.periodTitle}: ${d.losses.map((l) => `${l.day} ${l.text}`).join('; ')}`);
	if (d.plants.length) out.push(`Plants: ${d.plants.map((p) => p.name).join(', ')}`);
	if (d.warnings.length) out.push(...d.warnings.map((w) => `Note: ${w}`));
	const recent = d.markers.changes.slice(-8);
	if (recent.length) {
		out.push('', 'Recent changes to the tank:');
		for (const c of recent) out.push(`- ${c.day}: ${c.text}`);
	}
	if (d.testLog.rows.length) {
		out.push('', 'Latest tests:');
		const cols = d.testLog.columns;
		for (const r of d.testLog.rows.slice(0, 8)) {
			out.push(`- ${r.when}: ${r.cells.map((c, i) => (c ? `${cols[i].name} ${c.v}` : null)).filter(Boolean).join(', ')}${r.note ? ` (${r.note})` : ''}`);
		}
	}
	out.push('', `Full log, charts and photos: ${v.url}`);
	return out.join('\n') + '\n';
}

/** The tests as CSV, one row per test and a column per parameter, for a spreadsheet. */
export function testsCsv(d: PublicDetail) {
	const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
	const head = ['When', ...d.testLog.columns.map((c) => (c.unit ? `${c.name} (${c.unit})` : c.name)), ...(d.details ? ['Note', 'Water change before'] : ['Water change before'])];
	const rows = [...d.testLog.rows].reverse().map((r) => [r.when.replace(' · ', ' '), ...r.cells.map((c) => c?.v ?? ''), ...(d.details ? [r.note ?? ''] : []), r.changeBefore ? 'yes' : '']);
	return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}
