// Demo data for local development: `npm run seed` (needs the dev server with
// AUTH_DEV_LOGIN=true). Creates demo@example.com with four tanks and six
// months of history. Re-running replaces the demo account.
import { eq, inArray } from 'drizzle-orm';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { fToC } from '$lib/units';
import { addDays, todayInZone, zonedToUtc } from '$lib/time';
import { db } from './db';
import { events, notificationPrefs, tanks, taskCompletions, tasks, users, type Tank, type User } from './db/schema';
import { createEvent, createTest } from './logs';
import { addExpense } from './expenses';
import { preparePhotos, setCover, storePhotos } from './photos';
import { createShare, getPublicPage, updatePublicPage } from './public';
import { addEquipment, addLivestock, addPlant, changeCount, logTrim, markServiced, nameLivestock, tagPhoto, updateLivestockDetails } from './specs';
import { createTank, listParams, setArchived, updateTank } from './tanks';
import { createTask } from './tasks';
import { upsertUser, updateUser } from './users';

export const DEMO_EMAIL = 'demo@example.com';
const TZ = 'America/Los_Angeles';
const DAYS = 180;

// Deterministic randomness so every seed looks the same.
function rng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = rng(42);
const between = (a: number, b: number) => a + rand() * (b - a);
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

let today = '';
const day = (offset: number) => addDays(today, offset);
const at = (offset: number, time: string) => zonedToUtc(day(offset), time, TZ).toISOString();

/** A simple generated "tank photo": water gradient, sand, plants, fish. */
async function fakePhoto(i: number, hue: 'green' | 'blue' | 'teal') {
	const top = { green: '#2f6b4f', blue: '#1d4f7a', teal: '#1f6a6a' }[hue];
	const bottom = { green: '#0f2a22', blue: '#0b2238', teal: '#0c2a2c' }[hue];
	const r = rng(1000 + i);
	const stems = Array.from({ length: 14 }, () => {
		const x = Math.round(r() * 1600);
		const h = 300 + r() * 600;
		const g = ['#3f9a4a', '#5bb85e', '#2e7d3a', '#8bc34a', '#c0504d'][Math.floor(r() * 5)];
		return `<path d="M${x} 1100 C ${x + (r() - 0.5) * 120} ${1100 - h / 2}, ${x + (r() - 0.5) * 160} ${1100 - h}, ${x + (r() - 0.5) * 80} ${1100 - h}" stroke="${g}" stroke-width="${10 + r() * 16}" fill="none" stroke-linecap="round"/>`;
	}).join('');
	const fish = Array.from({ length: 6 }, () => {
		const x = 200 + r() * 1200;
		const y = 250 + r() * 500;
		const c = ['#f4a261', '#e76f51', '#e9c46a', '#8ecae6'][Math.floor(r() * 4)];
		const s = 0.6 + r() * 0.8;
		return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="46" ry="18" fill="${c}"/><path d="M40 0 L70 -18 L70 18 Z" fill="${c}"/></g>`;
	}).join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="1600" height="1200" fill="url(#w)"/><rect y="0" width="1600" height="60" fill="#ffffff" opacity="0.08"/>
${stems}${fish}<path d="M0 1080 Q 400 1030 800 1070 T 1600 1060 V1200 H0 Z" fill="#c2a878"/><path d="M0 1120 Q 500 1090 1000 1120 T 1600 1110 V1200 H0 Z" fill="#a88f63"/></svg>`;
	const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
	return new File([new Uint8Array(buf)], `demo-${i}.jpg`, { type: 'image/jpeg' });
}

async function photoFor(tankId: string, i: number, hue: 'green' | 'blue' | 'teal', link: { eventId?: string; testId?: string; takenAt: string }) {
	const prepared = await preparePhotos([await fakePhoto(i, hue)]);
	if ('error' in prepared) throw new Error(prepared.error);
	return storePhotos(tankId, prepared, link)[0];
}

function removeDemo() {
	const u = db.select().from(users).where(eq(users.email, DEMO_EMAIL)).get();
	if (!u) return;
	const ids = db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, u.id)).all().map((t) => t.id);
	for (const id of ids) rmSync(join(env.DATA_DIR ?? './data', 'photos', id), { recursive: true, force: true });
	db.delete(users).where(eq(users.id, u.id)).run(); // cascades to everything else
}

function paramsByKey(tankId: string) {
	return new Map(listParams(tankId, { all: true }).map((p) => [p.key, p.id]));
}

function test(user: User, tank: Tank, offset: number, time: string, values: Record<string, number>, note: string | null = null) {
	const ids = paramsByKey(tank.id);
	const readings = new Map<string, number>();
	for (const [k, v] of Object.entries(values)) if (ids.has(k)) readings.set(ids.get(k)!, v);
	return createTest(user.id, tank.id, { takenAt: at(offset, time), note, readings }, { timeZone: TZ }).test;
}

/** createTank logs "Tank created" now; move it to the tank's start. */
function backdateCreated(tank: Tank, when: string) {
	const e = db.select().from(events).where(eq(events.tankId, tank.id)).all().find((x) => x.data.system === 'tank_created');
	if (e) db.update(events).set({ occurredAt: when }).where(eq(events.id, e.id)).run();
	db.update(tanks).set({ createdAt: when }).where(eq(tanks.id, tank.id)).run();
}

const event = (user: User, tank: Tank, offset: number, time: string, category: Parameters<typeof createEvent>[2]['category'], data: Record<string, unknown>, note: string | null = null) =>
	createEvent(user.id, tank.id, { category, occurredAt: at(offset, time), note, data }, { timeZone: TZ }).event;

// ── Riverbed 40: planted ────────────────────────────────────────────────────

async function seedPlanted(user: User) {
	const tank = createTank(user, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 151.4, actualVolumeL: 128.7, lengthCm: 91.4, widthCm: 45.7, heightCm: 40.6, startDate: day(-DAYS - 20), notes: 'Aquasoil, CO₂ 1 bps on a timer. Canister filter, 8 h photoperiod.' });
	updateTank(user.id, tank.id, { specBrand: 'Aqualine', specModel: '90P', glass: 'Low-iron, rimless', substrate: 'Aquasoil, 3 in', waterSource: 'rodi', photoperiodH: 8 });
	backdateCreated(tank, at(-DAYS - 20, '10:00'));

	const filter = addEquipment(user.id, tank.id, { type: 'filter', brand: 'Tidewell', model: 'C-400', specs: { filterType: 'Canister', flowLh: 1200, media: 'Ceramic + sponge' }, installedAt: day(-DAYS - 20), notes: 'Bought at the local fish store.' }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'light', brand: 'Lumora', model: 'Pro 90', specs: { photoperiodH: 8, intensity: 70, spectrum: 'Full spectrum' }, installedAt: day(-DAYS - 20), notes: null }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'heater', brand: 'Tidewell', model: '200 W', specs: { watts: 200, setC: fToC(77) }, installedAt: day(-DAYS - 20), notes: null }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'co2', brand: 'Dual-stage regulator', model: '+ inline diffuser', specs: { bps: 1, cylinder: '5 lb' }, installedAt: day(-DAYS + 10), notes: null }, user.timeZone);

	// Livestock arrives over time; one loss along the way.
	const rasbora = addLivestock(user.id, tank.id, { kind: 'fish', commonName: 'Harlequin rasbora', scientificName: 'Trigonostigma heteromorpha', count: 15, status: 'in_tank', addedAt: day(-DAYS + 5), source: null }, { at: at(-DAYS + 5, '17:30') }).row;
	addLivestock(user.id, tank.id, { kind: 'invert', commonName: 'Amano shrimp', scientificName: 'Caridina multidentata', count: 8, status: 'in_tank', addedAt: day(-DAYS + 5), source: null }, { at: at(-DAYS + 5, '17:40') });
	const otos = addLivestock(user.id, tank.id, { kind: 'fish', commonName: 'Otocinclus', scientificName: 'Otocinclus vittatus', count: 5, status: 'in_tank', addedAt: day(-110), source: null }, { at: at(-110, '18:00') }).row;
	// a pet: one of the otos, named
	const zippy = nameLivestock(user.id, otos.id, 'Zippy', { at: at(-100, '19:10') });
	updateLivestockDetails(user.id, zippy.id, { notes: 'The boldest of the group. Always first to the algae wafer.' });
	addLivestock(user.id, tank.id, { kind: 'invert', commonName: 'Nerite snail', scientificName: 'Neritina natalensis', count: 3, status: 'in_tank', addedAt: day(-150), source: null }, { at: at(-150, '18:00') });
	addLivestock(user.id, tank.id, { kind: 'fish', commonName: 'Honey gourami', scientificName: 'Trichogaster chuna', count: 1, status: 'quarantine', addedAt: day(-5), source: null }, { at: at(-5, '16:20') });
	changeCount(user.id, rasbora.id, 14, 'loss', { at: at(-45, '08:05') });

	const plantList = [
		['Rotala rotundifolia', 'Rotala rotundifolia', 'background', 'thriving'],
		['Ludwigia repens', 'Ludwigia repens', 'background', 'thriving'],
		['Java fern', 'Microsorum pteropus', 'epiphyte', 'thriving'],
		['Cryptocoryne wendtii', 'Cryptocoryne wendtii', 'midground', 'thriving'],
		['Anubias nana', 'Anubias barteri var. nana', 'epiphyte', 'algae'],
		['Monte Carlo', 'Micranthemum tweediei', 'foreground', 'melting']
	] as const;
	const plantIds: string[] = [];
	for (const [i, [name, sci, position, status]] of plantList.entries()) {
		const p = addPlant(user.id, tank.id, { name, scientificName: sci, position, status });
		db.update(events).set({ occurredAt: at(-DAYS + 2 + i, '15:00') }).where(eq(events.id, p.event.id)).run();
		plantIds.push(p.id);
	}

	// Six months of logs.
	let nitrate = 10;
	let kh = 3.5;
	let photoN = 0;
	let lastWc = -DAYS;
	const wcEvents: { id: string; at: string }[] = [];
	for (let d = -DAYS; d <= 0; d++) {
		nitrate += between(0.7, 1.3);
		kh -= between(0.02, 0.08);
		// weekly, the last one 8 days ago (so the reminder is a day overdue)
		if ((d + 8) % 7 === 0 && d <= -8) {
			const pct = rand() > 0.3 ? 30 : 25;
			const wc = event(user, tank, d, '19:15', 'water_change', { percent: pct, volume_l: 128.7 * (pct / 100), source: 'rodi' });
			nitrate *= 1 - pct / 100 - 0.05;
			kh = Math.min(4.5, kh + 1.2);
			lastWc = d;
			wcEvents.push({ id: wc.id, at: wc.occurredAt });
		}
		const dow = new Date(day(d) + 'T12:00:00Z').getUTCDay();
		if ([1, 3, 5].includes(dow) && rand() > 0.15) {
			event(user, tank, d, '09:00', 'dosing', { product: 'All-in-one fertilizer', amount: 5, unit: 'mL' });
		}
		if (d % 3 === 0 || d === 0) {
			const full = d % 9 === 0 || d === 0;
			const values: Record<string, number> = {
				ph: round(between(6.6, 7.0)),
				no3: d === 0 ? 35 : round(nitrate, 0),
				temp: round(fToC(between(76, 78)), 2)
			};
			if (full) {
				Object.assign(values, {
					nh3: rand() > 0.92 ? 0.25 : 0,
					no2: 0,
					gh: round(between(5, 7), 0),
					kh: d === 0 ? 2 : Math.max(1.5, round(kh, 0)),
					po4: round(between(0.4, 1.6)),
					k: round(between(8, 18), 0),
					fe: round(between(0.04, 0.18), 2),
					co2: round(between(20, 32), 0)
				});
			}
			const notes = ['before water change', 'after dosing', null, null, null, 'lights just came on'];
			const t = test(user, tank, d, d === 0 ? '08:12' : '08:05', values, notes[Math.floor(rand() * notes.length)]);
			if (d === 0 || d === -30) await photoFor(tank.id, photoN++, 'green', { testId: t.id, takenAt: t.takenAt });
		}
		if (d % 28 === -2) {
			const m = event(user, tank, d, '18:40', 'maintenance', { actions: ['Cleaned filter', 'Replaced media'], equipment_id: filter.id }, 'Swapped the fine sponge, kept the ceramic.');
			markServiced(user.id, filter.id, m.occurredAt);
		}
		if (d % 14 === -4) {
			const e = logTrim(user.id, tank.id, plantIds.slice(0, 2), d === -4 ? 'Replanted the tops in the back left.' : null);
			db.update(events).set({ occurredAt: at(d, '18:10') }).where(eq(events.id, e.id)).run();
		}
		if ([-120, -64, -3].includes(d)) {
			const obs = event(user, tank, d, '20:30', 'observation', { tags: d === -3 ? ['Algae', 'Plant melt'] : ['Algae'] }, d === -3 ? 'Green spot algae on the front glass and some melt on the Monte Carlo.' : 'Some hair algae on the Java fern.');
			await photoFor(tank.id, photoN++, 'green', { eventId: obs.id, takenAt: obs.occurredAt });
		}
		if (d % 21 === 0 && d > -DAYS) {
			const n = event(user, tank, d, '20:00', 'note', {}, ['Looking lush after the trim.', 'New angle for the tank shot.', 'Shrimp are out grazing today.', 'Full tank shot.'][Math.abs(d / 21) % 4]);
			await photoFor(tank.id, photoN++, 'green', { eventId: n.id, takenAt: n.occurredAt });
		}
	}
	const cover = await photoFor(tank.id, photoN++, 'green', { takenAt: at(-1, '12:00') });
	setCover(user.id, cover.id);
	// what the tank has cost
	for (const [d, cents, category, what] of [
		[-DAYS + 2, 23900, 'equipment', 'Aqualine 90P and canister filter'],
		[-DAYS + 3, 4499, 'plants', 'Stem plants and a Java fern'],
		[-DAYS + 5, 5250, 'livestock', '15 Harlequin rasboras, 8 Amano shrimp'],
		[-110, 1500, 'livestock', '5 Otocinclus'],
		[-60, 1850, 'consumables', 'All-in-one fertilizer'],
		[-30, 3999, 'equipment', 'Tidewell 200 W heater'],
		[-12, 1850, 'consumables', 'All-in-one fertilizer'],
		[-5, 1299, 'livestock', 'Honey gourami']
	] as const) {
		addExpense(user.id, tank.id, { date: day(d), amountCents: cents, category, what, note: null });
	}

	// Zippy's photos: a profile photo, and one more tagged with it
	const zippyShot = await photoFor(tank.id, photoN++, 'green', { takenAt: at(-40, '19:30') });
	updateLivestockDetails(user.id, zippy.id, { photoId: zippyShot.id });
	tagPhoto(user.id, (await photoFor(tank.id, photoN++, 'green', { takenAt: at(-12, '20:15') })).id, zippy.id, true);
	event(user, tank, -22, '18:00', 'equipment', { action: 'adjusted', item: 'Lumora Pro 90', changes: { photoperiodH: [8.5, 8] }, reasons: ['Algae'] }, 'Cut the photoperiod by half an hour.');

	// Tasks: the water change is a day overdue, a few are due soon, some later.
	const wcTask = db.select().from(tasks).where(eq(tasks.tankId, tank.id)).get()!;
	db.update(tasks).set({ nextDue: day(Math.min(lastWc + 7, -1)) }).where(eq(tasks.id, wcTask.id)).run();
	for (const w of wcEvents) db.insert(taskCompletions).values({ taskId: wcTask.id, completedAt: w.at, eventId: w.id }).run();
	createTask(user.id, tank.id, { name: 'Test water', kind: 'test', recurring: true, intervalDays: 3, scheduleMode: 'completion', nextDue: day(0), openFormOnDone: true });
	createTask(user.id, tank.id, { name: 'Trim stem plants', kind: 'maintenance', recurring: true, intervalDays: 14, scheduleMode: 'fixed', nextDue: day(2), openFormOnDone: false });
	createTask(user.id, tank.id, { name: 'Clean Tidewell C-400 canister', kind: 'maintenance', recurring: true, intervalDays: 28, scheduleMode: 'completion', nextDue: day(8), openFormOnDone: false, equipmentId: filter.id });
	createTask(user.id, tank.id, { name: 'Refill CO₂ cylinder', kind: 'other', recurring: false, intervalDays: null, scheduleMode: 'completion', nextDue: day(20), openFormOnDone: false });

	// Public page + one shared photo.
	getPublicPage(user.id, tank.id);
	updatePublicPage(user.id, tank.id, {
		enabled: true,
		indexable: true,
		slug: 'riverbed-40-demo',
		description: 'Dutch-style planted tank with Rotala, Ludwigia and a carpet of Monte Carlo. CO₂ injected, lean dosing, weekly 30% water changes with RODI.',
		seoTitle: 'Riverbed 40: 40 gal Dutch planted tank log'
	});
	createShare(user.id, cover.id);
	return tank;
}

// ── Reef 24 ─────────────────────────────────────────────────────────────────

async function seedReef(user: User) {
	const tank = createTank(user, { name: 'Reef 24', type: 'reef', nominalVolumeL: 90.8, actualVolumeL: 79.5, lengthCm: 61, widthCm: 45.7, heightCm: 45.7, startDate: day(-DAYS + 30) });
	backdateCreated(tank, at(-DAYS + 30, '10:00'));
	updateTank(user.id, tank.id, { specBrand: 'Tidewell', specModel: 'Nano 24', glass: 'Starphire', substrate: 'Aragonite sand, 1 in', waterSource: 'rodi', photoperiodH: 9 });
	addEquipment(user.id, tank.id, { type: 'pump', brand: 'Tidewell', model: 'DC 1500', specs: { flowLh: 1500 }, installedAt: day(-DAYS + 30), notes: null }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'skimmer', brand: 'Tideline', model: 'S-60', specs: { ratedL: 230 }, installedAt: day(-DAYS + 30), notes: null }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'heater', brand: 'Tidewell', model: '100 W', specs: { watts: 100, setC: 25.5 }, installedAt: day(-DAYS + 30), notes: null }, user.timeZone);
	addEquipment(user.id, tank.id, { type: 'light', brand: 'Coralux', model: 'Blue 30', specs: { photoperiodH: 9, intensity: 55 }, installedAt: day(-DAYS + 30), notes: null }, user.timeZone);

	for (const [name, sci, kind, count, d] of [
		['Ocellaris clownfish', 'Amphiprion ocellaris', 'fish', 2, -140],
		['Yellow watchman goby', 'Cryptocentrus cinctus', 'fish', 1, -120],
		['Cleaner shrimp', 'Lysmata amboinensis', 'invert', 1, -100],
		['Torch coral', 'Euphyllia glabrescens', 'coral', 1, -80],
		['Green star polyps', 'Pachyclavularia violacea', 'coral', 1, -60],
		['Trochus snail', 'Trochus histrio', 'invert', 6, -130]
	] as const) {
		addLivestock(user.id, tank.id, { kind, commonName: name, scientificName: sci, count, status: 'in_tank', addedAt: day(d), source: null }, { at: at(d, '17:00') });
	}

	let alk = 8.5;
	let no3 = 5;
	for (let d = -DAYS + 30; d <= 0; d++) {
		alk -= between(0.05, 0.12);
		no3 += between(0.1, 0.35);
		if (d % 3 === 0) {
			event(user, tank, d, '07:30', 'dosing', { product: 'Alkalinity part B', amount: 8, unit: 'mL' });
			alk += between(0.2, 0.35);
		}
		if ((d + 3) % 7 === 0 && d < -2) {
			event(user, tank, d, '18:00', 'water_change', { percent: 10, volume_l: 7.9, source: 'rodi' });
			no3 *= 0.85;
		}
		if (d % 2 === 0 || d === -1) {
			test(user, tank, d, '07:45', {
				sal: round(between(34.4, 35.3)),
				kh: round(Math.min(11, Math.max(7, alk)), 1),
				ca: round(between(405, 445), 0),
				mg: round(between(1270, 1380), 0),
				po4: round(between(0.03, 0.09), 2),
				no3: round(no3, 0),
				ph: round(between(8.0, 8.3)),
				temp: round(between(25.3, 25.9), 1),
				...(d % 10 === 0 ? { nh3: 0, no2: 0 } : {})
			});
		}
		if (d % 30 === 0) {
			const n = event(user, tank, d, '21:00', 'note', {}, 'Torch coral extension looking great under the new schedule.');
			await photoFor(tank.id, 200 + d, 'blue', { eventId: n.id, takenAt: n.occurredAt });
		}
	}
	const cover = await photoFor(tank.id, 250, 'blue', { takenAt: at(-2, '12:00') });
	setCover(user.id, cover.id);

	db.update(tasks).set({ name: 'Water change 10%', nextDue: day(2) }).where(eq(tasks.tankId, tank.id)).run();
	createTask(user.id, tank.id, { name: 'Top off ATO reservoir', kind: 'maintenance', recurring: true, intervalDays: 5, scheduleMode: 'completion', nextDue: day(0), openFormOnDone: false });
	createTask(user.id, tank.id, { name: 'Empty skimmer cup', kind: 'maintenance', recurring: true, intervalDays: 7, scheduleMode: 'fixed', nextDue: day(3), openFormOnDone: false });
	createTask(user.id, tank.id, { name: 'Replace carbon', kind: 'maintenance', recurring: true, intervalDays: 30, scheduleMode: 'completion', nextDue: day(17), openFormOnDone: false });
	createTask(user.id, tank.id, { name: 'Calibrate refractometer', kind: 'other', recurring: false, intervalDays: null, scheduleMode: 'completion', nextDue: day(37), openFormOnDone: false });
	return tank;
}

// ── Shrimp 10 and an archived tank ──────────────────────────────────────────

async function seedSmall(user: User) {
	const shrimp = createTank(user, { name: 'Shrimp 10', type: 'freshwater', nominalVolumeL: 37.9, startDate: day(-60) });
	backdateCreated(shrimp, at(-60, '10:00'));
	addLivestock(user.id, shrimp.id, { kind: 'invert', commonName: 'Cherry shrimp', scientificName: 'Neocaridina davidi', count: 25, status: 'in_tank', addedAt: day(-55), source: null }, { at: at(-55, '17:00') });
	addEquipment(user.id, shrimp.id, { type: 'filter', brand: 'Spongey', model: 'Dual', specs: { filterType: 'Sponge' }, installedAt: day(-60), notes: null }, user.timeZone);
	for (let d = -56; d <= -2; d += 7) test(user, shrimp, d, '09:00', { ph: round(between(7.0, 7.4)), nh3: 0, no2: 0, no3: round(between(5, 15), 0), gh: round(between(6, 8), 0), kh: round(between(3, 4), 0), temp: round(fToC(between(72, 75)), 1) });
	db.update(tasks).set({ name: 'Water change 20%', nextDue: day(4) }).where(eq(tasks.tankId, shrimp.id)).run();

	const old = createTank(user, { name: 'Old 20 gallon', type: 'freshwater', nominalVolumeL: 75.7, startDate: day(-400) });
	backdateCreated(old, at(-400, '10:00'));
	test(user, old, -200, '09:00', { ph: 7.2, nh3: 0, no2: 0, no3: 20, temp: fToC(76) });
	setArchived(user.id, old.id, true);
}

export async function seedDemo() {
	today = todayInZone(TZ);
	removeDemo();
	const user = upsertUser({ email: DEMO_EMAIL, name: 'Jordan Reyes' });
	updateUser(user.id, { timeZone: TZ, unitSystem: 'imperial', hardnessUnit: 'dgh', setupDone: true });
	db.update(notificationPrefs).set({ delivery: 'individual' }).where(eq(notificationPrefs.userId, user.id)).run();
	const fresh = db.select().from(users).where(eq(users.id, user.id)).get()!;
	const planted = await seedPlanted(fresh);
	await seedReef(fresh);
	await seedSmall(fresh);
	const counts = {
		tanks: db.select().from(tanks).where(eq(tanks.userId, user.id)).all().length,
		events: db.select().from(events).where(inArray(events.tankId, db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, user.id)))).all().length
	};
	return { email: DEMO_EMAIL, plantedTank: planted.id, ...counts };
}
