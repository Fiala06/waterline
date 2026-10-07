// Data export (17 / D10 / G10): a full backup ZIP (JSON + photos) or a CSV of
// water tests, for one tank or the whole account. Built in the background;
// files are kept in DATA_DIR/exports for 24 hours.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yazl from 'yazl';
import { env } from '$env/dynamic/private';
import { displayValue, paramDecimals, paramUnit } from '$lib/params';
import { formatNumber } from '$lib/units';
import { utcToZoned } from '$lib/time';
import { db } from './db';
import {
	equipment,
	expenses,
	events,
	exports,
	livestock,
	plants,
	notificationPrefs,
	photoLivestock,
	photos,
	products,
	quickFavorites,
	tankParameters,
	tanks,
	taskCompletions,
	tasks,
	testReadings,
	tests,
	type Tank,
	type User
} from './db/schema';
import { photoFilePath } from './photos';
import { receiptFilePath } from './expenses';
import { getTank, listTanks } from './tanks';
import { logger } from './log';

export const EXPORT_TTL_HOURS = 24;
const dir = () => join(env.DATA_DIR ?? './data', 'exports');

export type ExportRow = typeof exports.$inferSelect;

export function listExports(userId: string) {
	return db.select().from(exports).where(eq(exports.userId, userId)).orderBy(desc(exports.createdAt)).limit(10).all();
}

export function getExport(userId: string, id: string): ExportRow {
	const row = db.select().from(exports).where(and(eq(exports.id, id), eq(exports.userId, userId))).get();
	if (!row) error(404, 'Export not found');
	return row;
}

function tanksFor(user: User, scope: 'tank' | 'account', tankId: string | null): Tank[] {
	if (scope === 'tank') return [getTank(user.id, tankId ?? '', 'owner')];
	return [...listTanks(user.id, { own: true }), ...listTanks(user.id, { archived: true, own: true })];
}

/** Rough size of a full backup, for "about 48 MB". */
export function estimateBackupBytes(user: User, scope: 'tank' | 'account', tankId: string | null) {
	const ids = tanksFor(user, scope, tankId).map((t) => t.id);
	if (!ids.length) return 0;
	let bytes = 50_000;
	for (const p of db.select().from(photos).where(inArray(photos.tankId, ids)).all()) {
		try {
			bytes += statSync(photoFilePath(p, 'full')).size;
		} catch {
			/* missing file */
		}
	}
	for (const e of db.select({ path: expenses.receiptPath }).from(expenses).where(inArray(expenses.tankId, ids)).all()) {
		try {
			if (e.path) bytes += statSync(receiptFilePath(e.path)).size;
		} catch {
			/* missing file */
		}
	}
	return bytes;
}

export function startExport(user: User, scope: 'tank' | 'account', tankId: string | null, format: 'zip' | 'csv') {
	const list = tanksFor(user, scope, tankId); // validates ownership
	// one at a time per person: a backup copies every photo
	const running = db.select().from(exports).where(and(eq(exports.userId, user.id), eq(exports.status, 'building'))).get();
	if (running) return running;
	const row = db
		.insert(exports)
		.values({ userId: user.id, scope, tankId: scope === 'tank' ? list[0].id : null, format, progressText: 'Starting…' })
		.returning()
		.get();
	// Runs in the background; the page polls for progress.
	build(row.id, user, list, format)
		.then(() => logger.info('export', `Built a ${format === 'zip' ? 'backup' : 'CSV'} export`, { userId: user.id, scope }))
		.catch((e) => {
		logger.error('export', `A ${format === 'zip' ? 'backup' : 'CSV'} export failed`, { userId: user.id, scope, error: e });
		db.update(exports).set({ status: 'failed', error: 'The export failed. Try again.' }).where(eq(exports.id, row.id)).run();
	});
	return row;
}

const progress = (id: string, pct: number, text: string) =>
	db.update(exports).set({ progress: Math.round(pct), progressText: text }).where(eq(exports.id, id)).run();

function dataFor(user: User, list: Tank[]) {
	const ids = list.map((t) => t.id);
	// child rows grouped once, so a tank (or a test, or a task) finds its own in one step
	const grouped = <T, K>(rows: T[], key: (r: T) => K) => {
		const m = Map.groupBy(rows, key);
		return (k: K) => m.get(k) ?? [];
	};
	const byTank = <T extends { tankId: string }>(rows: T[]) => grouped(rows, (r) => r.tankId);
	const params = byTank(db.select().from(tankParameters).where(inArray(tankParameters.tankId, ids)).orderBy(asc(tankParameters.sort)).all());
	const allTests = db.select().from(tests).where(inArray(tests.tankId, ids)).orderBy(asc(tests.takenAt)).all();
	const testIds = allTests.map((t) => t.id);
	const readings = testIds.length ? db.select().from(testReadings).where(inArray(testReadings.testId, testIds)).all() : [];
	const allEvents = byTank(db.select().from(events).where(inArray(events.tankId, ids)).orderBy(asc(events.occurredAt)).all());
	const allTasks = db.select().from(tasks).where(inArray(tasks.tankId, ids)).all();
	const completions = allTasks.length
		? db.select().from(taskCompletions).where(inArray(taskCompletions.taskId, allTasks.map((t) => t.id))).all()
		: [];
	const allPhotos = db.select().from(photos).where(inArray(photos.tankId, ids)).orderBy(asc(photos.takenAt)).all();
	const allEquipment = byTank(db.select().from(equipment).where(inArray(equipment.tankId, ids)).all());
	const allLivestock = byTank(db.select().from(livestock).where(inArray(livestock.tankId, ids)).all());
	const allPlants = byTank(db.select().from(plants).where(inArray(plants.tankId, ids)).all());
	// the pets tagged in each photo
	const petsIn = new Map<string, string[]>();
	for (const t of allPhotos.length ? db.select().from(photoLivestock).where(inArray(photoLivestock.photoId, allPhotos.map((p) => p.id))).all() : []) {
		petsIn.set(t.photoId, [...(petsIn.get(t.photoId) ?? []), t.livestockId]);
	}
	const allExpenses = db.select().from(expenses).where(inArray(expenses.tankId, ids)).orderBy(asc(expenses.date)).all();
	return {
		params,
		allTests,
		testsIn: byTank(allTests),
		readingsOf: grouped(readings, (r) => r.testId),
		allEvents,
		tasksIn: byTank(allTasks),
		completionsOf: grouped(completions, (c) => c.taskId),
		allPhotos,
		photosIn: byTank(allPhotos),
		petsIn,
		allEquipment,
		allLivestock,
		allPlants,
		expensesIn: byTank(allExpenses),
		allExpenses
	};
}

async function build(id: string, user: User, list: Tank[], format: 'zip' | 'csv') {
	mkdirSync(dir(), { recursive: true });
	const stamp = utcToZoned(new Date(), user.timeZone).date;
	const d = dataFor(user, list);
	const entries = d.allTests.length + list.reduce((n, t) => n + d.allEvents(t.id).length, 0);

	if (format === 'csv') {
		const name = `waterline-tests-${list.length === 1 ? slug(list[0].name) + '-' : ''}${stamp}.csv`;
		const path = join(dir(), `${id}.csv`);
		const csv = testsCsv(user, list, d);
		await new Promise<void>((resolve, reject) => {
			const ws = createWriteStream(path);
			ws.on('error', reject).on('finish', resolve);
			ws.end(csv);
		});
		finish(id, path, name, `${d.allTests.length} test${d.allTests.length === 1 ? '' : 's'}`);
		return;
	}

	const name = `waterline-backup-${list.length === 1 ? slug(list[0].name) + '-' : ''}${stamp}.zip`;
	const path = join(dir(), `${id}.zip`);
	const zip = new yazl.ZipFile();
	const out = createWriteStream(path);
	const done = new Promise<void>((resolve, reject) => {
		out.on('close', resolve).on('error', reject);
		zip.outputStream.on('error', reject);
	});
	zip.outputStream.pipe(out);

	progress(id, 5, 'Writing entries…');
	const prefs = db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, user.id)).get();
	const json = {
		format: 'waterline-backup',
		version: 1,
		exportedAt: new Date().toISOString(),
		note: 'Measurements are stored metric: volume in liters, temperature in °C, lengths in cm, hardness in dGH. Times are UTC.',
		account: {
			email: user.email,
			displayName: user.displayName,
			unitSystem: user.unitSystem,
			hardnessUnit: user.hardnessUnit,
			timeZone: user.timeZone,
			notifications: prefs ? { ...prefs, userId: undefined } : null,
			products: db
				.select()
				.from(products)
				.where(eq(products.userId, user.id))
				.all()
				.map((p) => ({ ...p, userId: undefined })),
			favorites: db
				.select()
				.from(quickFavorites)
				.where(eq(quickFavorites.userId, user.id))
				.all()
				.map((f) => ({ ...f, userId: undefined }))
		},
		tanks: list.map((t) => ({
			...t,
			userId: undefined,
			parameters: d.params(t.id).map((p) => ({ ...p, tankId: undefined })),
			tests: d.testsIn(t.id).map((x) => ({
				...x,
				tankId: undefined,
				readings: d.readingsOf(x.id).map((r) => ({ parameterId: r.parameterId, value: r.value }))
			})),
			events: d.allEvents(t.id).map((e) => ({ ...e, tankId: undefined })),
			equipment: d.allEquipment(t.id).map((e) => ({ ...e, tankId: undefined })),
			livestock: d.allLivestock(t.id).map((l) => ({ ...l, tankId: undefined })),
			plants: d.allPlants(t.id).map((p) => ({ ...p, tankId: undefined })),
			tasks: d.tasksIn(t.id).map((k) => ({ ...k, tankId: undefined, completions: d.completionsOf(k.id) })),
			photos: d.photosIn(t.id).map((p) => ({
				id: p.id,
				eventId: p.eventId,
				testId: p.testId,
				takenAt: p.takenAt,
				width: p.width,
				height: p.height,
				file: `photos/${p.path}`,
				livestock: d.petsIn.get(p.id) ?? []
			})),
			// in hundredths of the currency the keeper chose
			expenses: d.expensesIn(t.id).map(({ receiptPath, tankId: _, ...e }) => ({ ...e, currency: user.currency, receipt: receiptPath ? `receipts/${receiptPath}` : null }))
		}))
	};
	zip.addBuffer(Buffer.from(JSON.stringify(json, null, 2)), 'waterline.json');
	zip.addBuffer(Buffer.from(testsCsv(user, list, d)), 'water-tests.csv');
	zip.addBuffer(
		Buffer.from(
			`Waterline backup — ${stamp}\n\nwaterline.json   everything: tanks, parameters, tests, events, tasks, spending, photo list\nwater-tests.csv  one row per water test, in your units\nphotos/          full-size photos, by tank\nreceipts/        receipts for spending, by tank\n`
		),
		'README.txt'
	);

	const total = d.allPhotos.length;
	for (let i = 0; i < total; i++) {
		const p = d.allPhotos[i];
		try {
			statSync(photoFilePath(p, 'full'));
			// JPEGs are already compressed
			zip.addFile(photoFilePath(p, 'full'), `photos/${p.path}`, { compress: false });
		} catch {
			/* skip missing file */
		}
		if (i % 5 === 0 || i === total - 1) progress(id, 10 + (80 * (i + 1)) / total, `Packing photos · ${i + 1} of ${total}`);
	}
	for (const e of d.allExpenses) {
		if (!e.receiptPath) continue;
		try {
			statSync(receiptFilePath(e.receiptPath));
			zip.addFile(receiptFilePath(e.receiptPath), `receipts/${e.receiptPath}`);
		} catch {
			/* skip missing file */
		}
	}
	progress(id, 95, 'Finishing…');
	zip.end();
	await done;
	finish(id, path, name, `${total} photo${total === 1 ? '' : 's'}, ${entries} entr${entries === 1 ? 'y' : 'ies'}`);
}

function finish(id: string, path: string, fileName: string, summary: string) {
	db.update(exports)
		.set({
			status: 'ready',
			progress: 100,
			progressText: null,
			filePath: path,
			fileName,
			size: statSync(path).size,
			summary,
			expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3_600_000).toISOString()
		})
		.where(eq(exports.id, id))
		.run();
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40) || 'tank';

function csvCell(v: string) {
	return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One row per test, values in the user's units. Columns: date, time, tank, each parameter, note. */
export function testsCsv(user: User, list: Tank[], d: ReturnType<typeof dataFor>) {
	const cols: { key: string; header: string }[] = [];
	const seen = new Set<string>();
	for (const t of list) {
		for (const p of d.params(t.id)) {
			const key = p.isCustom ? `custom:${p.name.toLowerCase()}:${p.unit}` : p.key;
			if (seen.has(key)) continue;
			seen.add(key);
			const unit = paramUnit(p, user);
			cols.push({ key, header: `${p.name}${unit ? ` (${unit})` : ''}` });
		}
	}
	const lines = [['Date', 'Time', 'Tank', ...cols.map((c) => c.header), 'Note'].map(csvCell).join(',')];
	const tankName = new Map(list.map((t) => [t.id, t.name]));
	for (const t of d.allTests) {
		const byParam = new Map(d.params(t.tankId).map((p) => [p.id, p]));
		const values = new Map<string, string>();
		for (const r of d.readingsOf(t.id)) {
			const p = byParam.get(r.parameterId);
			if (!p) continue;
			const key = p.isCustom ? `custom:${p.name.toLowerCase()}:${p.unit}` : p.key;
			values.set(key, formatNumber(displayValue(p, r.value, user), paramDecimals(p, user) + 1));
		}
		const when = utcToZoned(t.takenAt, user.timeZone);
		lines.push(
			[when.date, when.time, tankName.get(t.tankId) ?? '', ...cols.map((c) => values.get(c.key) ?? ''), t.note ?? ''].map(csvCell).join(',')
		);
	}
	return lines.join('\n') + '\n';
}

/** Delete expired export files (run by the scheduler). Interrupted builds are marked failed on start. */
export function cleanupExports() {
	const now = new Date().toISOString();
	for (const r of db.select().from(exports).where(and(eq(exports.status, 'ready'), lt(exports.expiresAt, now))).all()) {
		if (r.filePath) rmSync(r.filePath, { force: true });
		db.update(exports).set({ status: 'expired', filePath: null }).where(eq(exports.id, r.id)).run();
	}
}

export function failInterruptedExports() {
	db.update(exports)
		.set({ status: 'failed', error: 'The server restarted while this was building. Try again.' })
		.where(eq(exports.status, 'building'))
		.run();
}
