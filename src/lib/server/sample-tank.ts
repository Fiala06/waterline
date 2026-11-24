// A sample tank for visitors (#301): a planted freshwater tank with three
// months of made-up tests, water changes, upkeep, reminders and spending,
// shown through the public tank page so someone can see how Waterline works
// before signing in. It's built with the app's own functions inside one
// database transaction that is always rolled back: nothing of it is ever
// saved, it belongs to no account, nobody can sign in as it, and nothing it
// does can send a notification or reach a device (all of that happens outside
// these functions, after a real save). The result is kept for the day.
import { eq } from 'drizzle-orm';
import { fToC } from '$lib/units';
import { addDays, fmtDate, todayInZone, zonedToUtc } from '$lib/time';
import { fmtMoney, fmtSums } from '$lib/money';
import { db } from './db';
import { events, taskCompletions, tanks, tasks, users, type Tank, type User } from './db/schema';
import { CATEGORY_LABEL, listExpenses, addExpense, spendingSummary } from './expenses';
import { createEvent, createTest } from './logs';
import { getServerSettings } from './mail';
import { getPublicPage, publicView, updatePublicPage, type PublicRanges } from './public';
import { publicDetail } from './public-detail';
import { addEquipment, addLivestock, addPlant, changeCount, logTrim, markServiced } from './specs';
import { createTank, listParams, updateTank } from './tanks';
import { createTask } from './tasks';

/** Where the sample lives, and what it's called on the page. */
export const SAMPLE_PATH = '/sample';
const TZ = 'America/New_York';
const DAYS = 90;
const EMAIL = 'sample-tank@waterline.invalid';

/** Undoes everything the sample wrote. */
class RolledBack extends Error {}

function rng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The tank, in the database for the length of the transaction. */
function build(today: string): { user: User; tank: Tank } {
	const rand = rng(301);
	const between = (a: number, b: number) => a + rand() * (b - a);
	const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
	const day = (offset: number) => addDays(today, offset);
	const at = (offset: number, time: string) => zonedToUtc(day(offset), time, TZ).toISOString();

	const user = db
		.insert(users)
		.values({ email: EMAIL, displayName: 'Sample keeper', timeZone: TZ, unitSystem: 'imperial', hardnessUnit: 'dgh', setupDone: true })
		.returning()
		.get();
	const tank = createTank(user, {
		name: 'Riverbed 30',
		type: 'planted',
		growingStyle: 'low_tech',
		nominalVolumeL: 113.6,
		actualVolumeL: 98,
		startDate: day(-DAYS - 30),
		notes: 'Low-tech planted community tank: no CO₂, root tabs and a weekly liquid fertilizer.'
	});
	updateTank(user.id, tank.id, { substrate: 'Planted soil under sand', waterSource: 'tap', photoperiodH: 7 });
	db.update(tanks).set({ createdAt: at(-DAYS - 30, '10:00') }).where(eq(tanks.id, tank.id)).run();
	const created = db.select().from(events).where(eq(events.tankId, tank.id)).all().find((e) => e.data.system === 'tank_created');
	if (created) db.update(events).set({ occurredAt: at(-DAYS - 30, '10:00') }).where(eq(events.id, created.id)).run();

	const filter = addEquipment(user.id, tank.id, { type: 'filter', brand: 'Hang-on-back', model: '300', specs: { filterType: 'Hang-on-back', flowLh: 1100 }, installedAt: day(-DAYS - 30), notes: null }, TZ);
	addEquipment(user.id, tank.id, { type: 'light', brand: 'LED bar', model: '30 in', specs: { photoperiodH: 7, intensity: 60 }, installedAt: day(-DAYS - 30), notes: null }, TZ);
	addEquipment(user.id, tank.id, { type: 'heater', brand: 'Adjustable', model: '150 W', specs: { watts: 150, setC: fToC(77) }, installedAt: day(-DAYS - 30), notes: null }, TZ);

	const tetras = addLivestock(user.id, tank.id, { kind: 'fish', commonName: 'Neon tetra', scientificName: 'Paracheirodon innesi', count: 12, status: 'in_tank', addedAt: day(-80), source: null }, { at: at(-80, '17:30') }).row;
	addLivestock(user.id, tank.id, { kind: 'fish', commonName: 'Panda corydoras', scientificName: 'Corydoras panda', count: 6, status: 'in_tank', addedAt: day(-60), source: null }, { at: at(-60, '17:30') });
	addLivestock(user.id, tank.id, { kind: 'invert', commonName: 'Nerite snail', scientificName: 'Neritina natalensis', count: 2, status: 'in_tank', addedAt: day(-75), source: null }, { at: at(-75, '18:00') });
	changeCount(user.id, tetras.id, 11, 'loss', { at: at(-50, '08:10') });
	const plantIds: string[] = [];
	for (const [i, [name, sci, position]] of (
		[
			['Java fern', 'Microsorum pteropus', 'epiphyte'],
			['Amazon sword', 'Echinodorus grisebachii', 'midground'],
			['Cryptocoryne wendtii', 'Cryptocoryne wendtii', 'foreground'],
			['Water wisteria', 'Hygrophila difformis', 'background']
		] as const
	).entries()) {
		const p = addPlant(user.id, tank.id, { name, scientificName: sci, position, status: 'thriving' });
		db.update(events).set({ occurredAt: at(-DAYS - 28 + i, '15:00') }).where(eq(events.id, p.event.id)).run();
		plantIds.push(p.id);
	}

	const ids = new Map(listParams(tank.id, { all: true }).map((p) => [p.key, p.id]));
	const test = (offset: number, values: Record<string, number>, note: string | null = null) => {
		const readings = new Map<string, number>();
		for (const [k, v] of Object.entries(values)) if (ids.has(k)) readings.set(ids.get(k)!, v);
		createTest(user.id, tank.id, { takenAt: at(offset, '08:30'), note, readings }, { timeZone: TZ });
	};
	const event = (offset: number, time: string, category: Parameters<typeof createEvent>[2]['category'], data: Record<string, unknown>, note: string | null = null) =>
		createEvent(user.id, tank.id, { category, occurredAt: at(offset, time), note, data }, { timeZone: TZ }).event;

	// three months: nitrate creeps up between weekly water changes; one change is
	// skipped a month ago, so the chart shows what that does
	let nitrate = 8;
	const changes: { id: string; at: string }[] = [];
	for (let d = -DAYS; d <= 0; d++) {
		nitrate += between(0.9, 1.5);
		if ((d + 9) % 7 === 0 && d <= -9 && d !== -30) {
			const wc = event(d, '18:30', 'water_change', { percent: 25, volume_l: 24.5, source: 'tap', additives: [{ product: 'Water conditioner', amount: 5, unit: 'mL' }] });
			nitrate *= 0.7;
			changes.push({ id: wc.id, at: wc.occurredAt });
		}
		if (new Date(day(d) + 'T12:00:00Z').getUTCDay() === 0) event(d, '09:00', 'dosing', { product: 'Liquid fertilizer', amount: 5, unit: 'mL' });
		if (d % 4 === 0 || d === 0) {
			const full = d % 12 === 0 || d === 0;
			test(d, {
				ph: round(between(7.0, 7.4)),
				no3: d === 0 ? 40 : round(nitrate, 0),
				temp: round(fToC(between(76, 78)), 2),
				...(full ? { nh3: 0, no2: 0, gh: round(between(6, 8), 0), kh: round(between(3, 5), 0) } : {})
			}, d === 0 ? 'Nitrate up again: the water change is due.' : null);
		}
		if (d % 30 === -10) {
			const m = event(d, '19:00', 'maintenance', { actions: ['Cleaned filter', 'Scraped glass'], equipment_id: filter.id }, 'Rinsed the sponge in old tank water.');
			markServiced(user.id, filter.id, m.occurredAt, { timeZone: TZ });
		}
		if (d % 21 === -6) {
			const e = logTrim(user.id, tank.id, [plantIds[3]], null);
			db.update(events).set({ occurredAt: at(d, '18:00') }).where(eq(events.id, e.id)).run();
		}
	}
	event(-30, '20:00', 'note', {}, 'Away for the week, so no water change.');
	event(-3, '20:30', 'observation', { tags: ['Algae'] }, 'A little brown algae on the sword’s older leaves.');

	// reminders: the water change is due today, upkeep soon
	const wcTask = db.select().from(tasks).where(eq(tasks.tankId, tank.id)).get();
	if (wcTask) {
		db.update(tasks).set({ name: 'Water change 25%', nextDue: day(0) }).where(eq(tasks.id, wcTask.id)).run();
		for (const c of changes) db.insert(taskCompletions).values({ taskId: wcTask.id, completedAt: c.at, eventId: c.id }).run();
	}
	createTask(user.id, tank.id, { name: 'Test water', kind: 'test', recurring: true, intervalDays: 4, scheduleMode: 'completion', nextDue: day(4), openFormOnDone: true });
	createTask(user.id, tank.id, { name: 'Clean the filter', kind: 'maintenance', recurring: true, intervalDays: 30, scheduleMode: 'completion', nextDue: day(20), openFormOnDone: false, equipmentId: filter.id });
	createTask(user.id, tank.id, { name: 'Root tabs for the sword', kind: 'dosing', recurring: true, intervalDays: 60, scheduleMode: 'fixed', nextDue: day(9), openFormOnDone: false });

	for (const [d, cents, category, what] of [
		[-DAYS - 30, 15999, 'equipment', '30 gallon tank, filter and light'],
		[-DAYS - 29, 3200, 'plants', 'Java fern, Amazon sword, crypts and wisteria'],
		[-80, 3000, 'livestock', '12 Neon tetras'],
		[-75, 900, 'livestock', '2 Nerite snails'],
		[-60, 2700, 'livestock', '6 Panda corydoras'],
		[-45, 1499, 'consumables', 'Liquid fertilizer and root tabs'],
		[-14, 1199, 'consumables', 'Water conditioner']
	] as const)
		addExpense(user.id, tank.id, { date: day(d), amountCents: cents, category, what, note: null, currency: 'USD' });

	getPublicPage(user.id, tank.id);
	updatePublicPage(user.id, tank.id, {
		enabled: true,
		slug: 'sample',
		showTimeline: true,
		showDetails: true,
		displayName: 'full',
		description: 'A made-up planted community tank, to show what Waterline keeps: tests against targets, water changes, upkeep, reminders and spending.'
	});
	return { user: db.select().from(users).where(eq(users.id, user.id)).get()!, tank: db.select().from(tanks).where(eq(tanks.id, tank.id)).get()! };
}

/** What the sample's spending section shows: the total, by category, and the latest purchases. */
function spending(userId: string, tankId: string, today: string) {
	const rows = listExpenses(userId, tankId);
	const s = spendingSummary(rows, today);
	const byCategory = Object.entries(CATEGORY_LABEL)
		.map(([key, label]) => ({ label, cents: rows.filter((e) => e.category === key).reduce((n, e) => n + e.amountCents, 0) }))
		.filter((c) => c.cents > 0)
		.sort((a, b) => b.cents - a.cents)
		.map((c) => ({ label: c.label, amount: fmtMoney(c.cents, 'USD') }));
	return {
		total: fmtSums(s.all),
		byCategory,
		recent: rows.slice(0, 3).map((e) => ({ what: e.what, date: fmtDate(e.date), amount: fmtMoney(e.amountCents, e.currency) }))
	};
}

function render(today: string, ranges: PublicRanges) {
	// the settings row is made outside the transaction, so it's never one the rollback takes back
	getServerSettings();
	let out: { view: ReturnType<typeof publicView>; detail: ReturnType<typeof publicDetail>; spending: ReturnType<typeof spending> } | null = null;
	try {
		db.$client.transaction(() => {
			const { user, tank } = build(today);
			const page = getPublicPage(user.id, tank.id);
			const view = publicView(page, tank, user, ranges);
			out = { view, detail: publicDetail(page, tank, user, { days: view.ranges.chart.days }), spending: spending(user.id, tank.id, today) };
			throw new RolledBack();
		})();
	} catch (e) {
		if (!(e instanceof RolledBack)) throw e;
	}
	return out!;
}

const cache = new Map<string, ReturnType<typeof render>>();

/** The sample tank as the public page shows it, over this chart range; built once a day for each range. */
export function sampleTank(ranges: PublicRanges, now = new Date()) {
	const today = todayInZone(TZ, now);
	const key = `${today}:${ranges.chart}`;
	let hit = cache.get(key);
	if (!hit) {
		for (const k of cache.keys()) if (!k.startsWith(today)) cache.delete(k);
		hit = render(today, ranges);
		cache.set(key, hit);
	}
	return hit;
}
