// Restore a Waterline backup (#306): the ZIP from Settings › Import & export,
// put back as new, private tanks of the keeper's own. Never touches what's
// already there: every row gets a new id (old ids are swapped for new ones
// wherever they appear, links inside History entries included), all of it
// goes in one transaction, and the photo and receipt files written for it go
// again if that fails. A tank restored before is flagged, so it isn't added
// twice by accident; overdue tasks don't send an alert for what was overdue
// at the time of the backup.
import { error } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { RESTORABLE_VERSIONS } from '$lib/backup';
import { TANK_TYPES } from '$lib/types';
import { todayInZone } from '$lib/time';
import { db } from './db';
import {
	autoDoses,
	emailLog,
	equipment,
	events,
	expenses,
	livestock,
	maintenanceRoutines,
	parReadings,
	sourceTests,
	waterSources,
	photoLivestock,
	photos,
	planRuns,
	plants,
	tankParameters,
	tanks,
	taskCompletions,
	tasks,
	testReadings,
	tests,
	users,
	wishes,
	type User
} from './db/schema';
import { removeFiles, writeAll } from './files';
import { dataDir } from './instance';
import { logger } from './log';
import { photoFromBackup, photoPaths } from './photos';
import { receiptFilePath } from './expenses';
import { ZipError, zipEntries, zipRead, type ZipEntry } from './zip-read';

export class RestoreError extends Error {}

type Row = Record<string, unknown>;
interface BackupTank extends Row {
	id: string;
	name: string;
	type: string;
	createdAt?: string;
}
interface Backup {
	version: number;
	exportedAt: string | null;
	tanks: BackupTank[];
}

const arr = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** waterline.json, checked: the format, a version Restore reads, and tanks that look like tanks. */
export function readBackupJson(text: string): Backup {
	let json: Row;
	try {
		json = JSON.parse(text);
	} catch {
		throw new RestoreError("The backup's waterline.json can't be read.");
	}
	if (json?.format !== 'waterline-backup') throw new RestoreError("That isn't a Waterline backup.");
	const version = Number(json.version);
	if (!RESTORABLE_VERSIONS.includes(version)) throw new RestoreError(`That backup is format ${json.version}, from a newer Waterline. Update this server first.`);
	const list = arr(json.tanks);
	if (!list.length) throw new RestoreError('That backup has no tanks in it.');
	for (const t of list) {
		if (!isId(t.id) || typeof t.name !== 'string' || !t.name.trim() || !TANK_TYPES.includes(t.type as never)) throw new RestoreError('That backup is damaged: a tank in it is missing its name or type.');
	}
	return { version, exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : null, tanks: list as BackupTank[] };
}

/** The backup's tank, in counts: what Restore would add. */
function counts(t: BackupTank) {
	const n = (k: string) => arr(t[k]).length;
	return {
		tests: n('tests'),
		entries: n('events'),
		photos: n('photos'),
		tasks: n('tasks'),
		livestock: n('livestock'),
		plants: n('plants'),
		equipment: n('equipment'),
		expenses: n('expenses')
	};
}

// ── The uploaded file, kept until it's restored or a day has passed ─────────

const UUID = /^[0-9a-f-]{36}$/;
const dir = (userId: string) => join(dataDir(), 'restores', userId);
const fileOf = (userId: string, token: string) => {
	if (!UUID.test(token)) error(400, 'Unknown upload');
	return join(dir(userId), `${token}.zip`);
};
const DAY_MS = 86_400_000;
/** Previews a keeper can have waiting at once (#322): older ones go when another is uploaded. */
const MAX_PENDING = 3;

const ageOf = (p: string) => Date.now() - statSync(p).mtimeMs;

/** A keeper's waiting uploads, newest first; any older than a day are removed on the way. */
function pending(userId: string): string[] {
	let names: string[];
	try {
		names = readdirSync(dir(userId));
	} catch {
		return []; // no folder yet
	}
	const kept: { p: string; at: number }[] = [];
	for (const f of names) {
		const p = join(dir(userId), f);
		try {
			const age = ageOf(p);
			if (age > DAY_MS || !/^[0-9a-f-]{36}\.zip$/.test(f)) rmSync(p, { force: true, recursive: true });
			else kept.push({ p, at: age });
		} catch {
			/* gone already */
		}
	}
	return kept.sort((a, b) => a.at - b.at).map((k) => k.p);
}

/** Make room for one more upload: the oldest beyond the limit go. */
function makeRoom(userId: string) {
	for (const p of pending(userId).slice(MAX_PENDING - 1)) rmSync(p, { force: true });
}

/**
 * The scheduler's sweep (#322): uploads older than a day go even when their
 * keeper never comes back, and so do the folders of accounts that are gone.
 */
export function cleanupRestores() {
	const root = join(dataDir(), 'restores');
	let folders: string[];
	try {
		folders = readdirSync(root);
	} catch {
		return; // nothing was ever uploaded
	}
	const people = new Set(db.select({ id: users.id }).from(users).all().map((u) => u.id));
	let removed = 0;
	for (const name of folders) {
		const p = join(root, name);
		try {
			if (!people.has(name) || !statSync(p).isDirectory()) {
				rmSync(p, { force: true, recursive: true });
				removed++;
				continue;
			}
			const before = readdirSync(p).length;
			const left = pending(name).length;
			removed += before - left;
			if (!left) rmSync(p, { force: true, recursive: true });
		} catch {
			/* gone already */
		}
	}
	if (removed) logger.info('settings', `Removed ${removed} backup upload${removed === 1 ? '' : 's'} that ${removed === 1 ? 'was' : 'were'} never restored`);
}

/** Every upload a keeper has waiting (#322), for when their account goes. */
export function removeRestoreUploads(userId: string) {
	if (!userId || userId.includes('/') || userId.includes('\\') || userId === '.' || userId === '..') return;
	rmSync(dir(userId), { force: true, recursive: true });
}

function openBackup(buf: Buffer) {
	let entries: Map<string, ZipEntry>;
	try {
		entries = zipEntries(buf);
		const json = entries.get('waterline.json');
		if (!json) throw new RestoreError("That ZIP isn't a Waterline backup: it has no waterline.json.");
		return { entries, backup: readBackupJson(zipRead(buf, json, 256 * 1024 * 1024).toString('utf8')) };
	} catch (e) {
		if (e instanceof ZipError) throw new RestoreError(e.message);
		throw e;
	}
}

export interface RestorePreview {
	token: string;
	version: number;
	exportedAt: string | null;
	tanks: { id: string; name: string; type: string; archived: boolean; counts: ReturnType<typeof counts>; already: boolean; missingFiles: number }[];
}

/** An uploaded backup, kept for the preview and checked: what it holds, and which of its tanks were restored before. */
export function previewRestore(user: User, buf: Buffer): RestorePreview {
	const { entries, backup } = openBackup(buf);
	makeRoom(user.id);
	const mine = db.select({ name: tanks.name, createdAt: tanks.createdAt }).from(tanks).where(eq(tanks.userId, user.id)).all();
	const token = crypto.randomUUID();
	mkdirSync(dir(user.id), { recursive: true });
	writeFileSync(fileOf(user.id, token), buf);
	return {
		token,
		version: backup.version,
		exportedAt: backup.exportedAt,
		tanks: backup.tanks.map((t) => ({
			id: t.id,
			name: t.name,
			type: t.type,
			archived: !!t.archivedAt,
			counts: counts(t),
			// the same tank, by its name and when it was made, is already one of theirs
			already: mine.some((m) => m.name === t.name && !!t.createdAt && m.createdAt === t.createdAt),
			missingFiles:
				arr(t.photos).filter((p) => typeof p.file !== 'string' || !entries.has(p.file)).length +
				arr(t.expenses).filter((e) => typeof e.receipt === 'string' && !entries.has(e.receipt)).length
		}))
	};
}

/** The upload is no longer wanted. */
export function discardRestore(user: User, token: string) {
	rmSync(fileOf(user.id, token), { force: true });
}

// ── Putting it back ─────────────────────────────────────────────────────────

/** Each table's foreign keys, by field name, with the table each points at. */
function foreignKeys(table: SQLiteTable) {
	const cols = getTableColumns(table);
	const byColumn = new Map(Object.entries(cols).map(([k, c]) => [c, k]));
	const out = new Map<string, SQLiteTable>();
	for (const fk of getTableConfig(table).foreignKeys) {
		const ref = fk.reference();
		const key = byColumn.get(ref.columns[0] as never);
		if (key) out.set(key, ref.foreignTable);
	}
	return out;
}

/**
 * Restore these tanks of an uploaded backup. Returns the new tanks' ids.
 * Throws RestoreError for a backup that can't go in; nothing is left behind then.
 */
export async function restoreBackup(user: User, token: string, tankIds: string[]): Promise<{ id: string; name: string }[]> {
	const expired = new RestoreError('That upload has expired. Choose the backup again.');
	const file = fileOf(user.id, token);
	let buf: Buffer;
	try {
		// kept for a day (#322): an older one isn't restored, whether or not the sweep has been by yet
		if (ageOf(file) > DAY_MS) {
			rmSync(file, { force: true });
			throw expired;
		}
		buf = readFileSync(file);
	} catch {
		throw expired;
	}
	const { entries, backup } = openBackup(buf);
	const chosen = backup.tanks.filter((t) => tankIds.includes(t.id));
	if (!chosen.length) throw new RestoreError('Choose at least one tank to restore.');

	// every id in the chosen tanks, old to new
	const ids = new Map<string, string>();
	const give = (v: unknown) => {
		if (isId(v) && !ids.has(v)) ids.set(v, crypto.randomUUID());
	};
	for (const t of chosen) {
		give(t.id);
		for (const k of ['parameters', 'tests', 'events', 'equipment', 'autoDoses', 'livestock', 'plants', 'tasks', 'photos', 'expenses', 'wishes', 'routines', 'plans', 'parReadings', 'waterSources', 'sourceTests'])
			for (const r of arr(t[k])) give(r.id);
	}
	const restored = new Set(ids.values());
	const remap = (v: unknown): unknown => {
		if (typeof v === 'string') return ids.get(v) ?? v;
		if (Array.isArray(v)) return v.map(remap);
		if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
		return v;
	};

	// rows ready for each table, in an order where everything a row points at goes in first
	const plan: { table: SQLiteTable; rows: Row[] }[] = [];
	// links to photos, set once the photos are in
	const photoLinks: { table: SQLiteTable; id: string; key: string; photoId: string }[] = [];
	// each photo and receipt is written as soon as it's decoded (#359), so only one is held at a time;
	// should anything after fail, the ones written go again
	const written: string[] = [];
	const put = async (files: [string, Uint8Array][]) => {
		await writeAll(files);
		written.push(...files.map(([p]) => p));
	};
	const add = (table: SQLiteTable, rows: Row[]) => {
		const cols = getTableColumns(table);
		const fks = foreignKeys(table);
		const ready = rows.map((row) => {
			const out: Row = {};
			for (const k of Object.keys(cols)) if (k in row) out[k] = remap(row[k]);
			if ('importId' in cols) out.importId = null;
			if ('loggedBy' in cols) out.loggedBy = user.id;
			for (const [k, target] of fks) {
				if (target === users) {
					out[k] = user.id;
					continue;
				}
				const v = out[k];
				if (v == null) continue;
				if (target === photos && typeof v === 'string' && restored.has(v) && table !== photoLivestock) {
					photoLinks.push({ table, id: out.id as string, key: k, photoId: v });
					out[k] = null;
				} else if (typeof v !== 'string' || !restored.has(v)) {
					// a link to something not in the backup (a product, a sensor token): dropped, or the row can't go in
					if ((cols[k] as { notNull: boolean }).notNull) throw new RestoreError('That backup is damaged: an entry in it points at something missing.');
					out[k] = null;
				}
			}
			return out;
		});
		plan.push({ table, rows: ready });
	};

	const today = todayInZone(user.timeZone);
	const overdue: { id: string; due: string }[] = [];
	try {
		for (const t of chosen) {
			const { parameters: _p, tests: ts, events: _e, equipment: _q, autoDoses: _a, livestock: _l, plants: _pl, tasks: tk, photos: ph, expenses: ex, wishes: _w, routines: _r, plans: _pn, parReadings: _par, waterSources: _ws, sourceTests: _st, ...tank } = t;
			const newTank = ids.get(t.id)!;
			// a restored tank is private and its own: no cover until its photos are in
			add(tanks, [{ ...tank, userId: user.id, coverPhotoId: null }]);
			if (isId(t.coverPhotoId) && ids.has(t.coverPhotoId)) photoLinks.push({ table: tanks, id: newTank, key: 'coverPhotoId', photoId: ids.get(t.coverPhotoId)! });
			add(tankParameters, arr(t.parameters).map((r) => ({ ...r, tankId: t.id })));
			add(equipment, arr(t.equipment).map((r) => ({ ...r, tankId: t.id })));
			add(autoDoses, arr(t.autoDoses).map((r) => ({ ...r, tankId: t.id })));
			add(livestock, arr(t.livestock).map((r) => ({ ...r, tankId: t.id })));
			add(plants, arr(t.plants).map((r) => ({ ...r, tankId: t.id })));
			const testRows = arr(ts);
			add(tests, testRows.map(({ readings: _, ...r }) => ({ ...r, tankId: t.id })));
			add(
				testReadings,
				testRows.flatMap((x) => arr(x.readings).map((r) => ({ testId: x.id, parameterId: r.parameterId, value: r.value })))
			);
			add(events, arr(t.events).map((r) => ({ ...r, tankId: t.id })));
			// a plan pauses tasks, and a task can say which plan set it: plans first
			add(planRuns, arr(t.plans).map((r) => ({ ...r, tankId: t.id })));
			const taskRows = arr(tk);
			add(tasks, taskRows.map(({ completions: _, ...r }) => ({ ...r, tankId: t.id })));
			// completions have their own numbering: a new one each
			add(taskCompletions, taskRows.flatMap((x) => arr(x.completions).map(({ id: _, ...c }) => ({ ...c, taskId: x.id }))));
			for (const x of taskRows) {
				const due = (typeof x.snoozedUntil === 'string' && x.snoozedUntil) || (typeof x.nextDue === 'string' && x.nextDue) || null;
				if (due && due < today) overdue.push({ id: ids.get(x.id as string)!, due });
			}

			// photos: each file decoded and saved again, with a new thumbnail; one missing from the ZIP is left out
			const photoRows: Row[] = [];
			const tags: Row[] = [];
			for (const p of arr(ph)) {
				const entry = typeof p.file === 'string' ? entries.get(p.file) : undefined;
				if (!entry || !isId(p.id)) continue;
				let img: Awaited<ReturnType<typeof photoFromBackup>>;
				try {
					img = await photoFromBackup(zipRead(buf, entry, 64 * 1024 * 1024));
				} catch {
					throw new RestoreError(`That backup is damaged: ${p.file} isn't a photo.`);
				}
				const at = photoPaths(newTank, ids.get(p.id)!);
				await put([[join(at.dir, at.path), img.full], [join(at.dir, at.thumbPath), img.thumb]]);
				photoRows.push({ id: p.id, tankId: t.id, eventId: p.eventId ?? null, testId: p.testId ?? null, takenAt: p.takenAt, width: img.width, height: img.height, path: at.path, thumbPath: at.thumbPath });
				for (const l of Array.isArray(p.livestock) ? p.livestock : []) if (isId(l)) tags.push({ photoId: p.id, livestockId: l });
			}
			add(photos, photoRows);
			add(photoLivestock, tags);

			// spending, with each receipt: a PDF as it is, a photo saved again
			const expenseRows: Row[] = [];
			for (const e of arr(ex)) {
				const { receipt, ...row } = e;
				const entry = typeof receipt === 'string' ? entries.get(receipt) : undefined;
				let receiptPath: string | null = null;
				let receiptType: string | null = null;
				if (entry && isId(e.id)) {
					const data = zipRead(buf, entry, 32 * 1024 * 1024);
					const pdf = data.subarray(0, 5).toString('latin1') === '%PDF-';
					let body: Buffer = data;
					if (!pdf) {
						try {
							body = await sharp(data, { failOn: 'error', limitInputPixels: 100_000_000 }).rotate().jpeg({ quality: 82 }).toBuffer();
						} catch {
							throw new RestoreError(`That backup is damaged: ${receipt} isn't a photo or a PDF.`);
						}
					}
					receiptPath = join(newTank, `${ids.get(e.id)}-restored.${pdf ? 'pdf' : 'jpg'}`);
					receiptType = pdf ? 'application/pdf' : 'image/jpeg';
					await put([[receiptFilePath(receiptPath), body]]);
				}
				expenseRows.push({ ...row, tankId: t.id, receiptPath, receiptType });
			}
			add(expenses, expenseRows);
			add(wishes, arr(t.wishes).map((r) => ({ ...r, tankId: t.id })));
			add(maintenanceRoutines, arr(t.routines).map((r) => ({ ...r, tankId: t.id })));
			add(parReadings, arr(t.parReadings).map((r) => ({ ...r, tankId: t.id })));
			// source water and its tests (#315): readings point at the tank's parameters, by their new ids
			add(waterSources, arr(t.waterSources).map((r) => ({ ...r, tankId: t.id })));
			add(sourceTests, arr(t.sourceTests).map((r) => ({ ...r, tankId: t.id })));
		}

		db.transaction((tx) => {
			for (const { table, rows } of plan) for (const r of rows) tx.insert(table).values(r as never).run();
			for (const l of photoLinks) {
				const idCol = (getTableColumns(l.table) as Record<string, never>).id;
				tx.update(l.table).set({ [l.key]: l.photoId } as never).where(eq(idCol, l.id)).run();
			}
			// what was overdue when the backup was made: no alert for it now (the task still shows as overdue)
			for (const o of overdue)
				for (const key of [`overdue:${o.id}:${o.due}`, `push:overdue:${o.id}:${o.due}`]) tx.insert(emailLog).values({ userId: user.id, key }).onConflictDoNothing().run();
		});
	} catch (e) {
		await removeFiles(written, 'export');
		if (e instanceof RestoreError) throw e;
		logger.error('export', "A backup couldn't be restored", { userId: user.id, error: e });
		throw new RestoreError("That backup couldn't be restored: some of it is damaged or from another version. Nothing was added.");
	}
	discardRestore(user, token);
	const out = chosen.map((t) => ({ id: ids.get(t.id)!, name: t.name }));
	logger.info('export', `Restored ${out.length} tank${out.length === 1 ? '' : 's'} from a backup`, { userId: user.id });
	return out;
}

