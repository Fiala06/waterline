// Bulk import, the database side: which checked rows the tank already has,
// then adding the ones the keeper ticked as if each were added by hand, so
// History has an entry for each, on its Added date. Each import is recorded,
// and everything it added carries its id, so the whole import can be undone.
import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { SUGGESTED_TASK, equipmentName } from '$lib/equipment';
import { countOf, type HistoryFile, type HistoryKind } from '$lib/imports';
import { addDays, todayInZone, utcToZoned, zonedToUtc } from '$lib/time';
import type { EventCategory, ImportKind } from '$lib/types';
import { db } from './db';
import { equipment, events, imports, livestock, photos, plants, tasks, tests, type Tank, type User } from './db/schema';
import {
	readHistory,
	type DosingValue,
	type HistoryContext,
	type HistoryValue,
	type MaintenanceValue,
	type MixedValue,
	type NoteValue,
	type ObservationValue,
	type TestValue,
	type WaterChangeValue
} from './import-history';
import {
	readImport,
	type CheckedRow,
	type ColumnMap,
	type EquipmentValue,
	type ImportList,
	type ImportValue,
	type LivestockValue,
	type PlantValue
} from './import-rows';
import { createEvent, createTest } from './logs';
import { removeEntryPhotoFiles } from './photos';
import { addEquipment, addLivestock, addPlant, listEquipment, listLivestock, listPlants } from './specs';
import { listParams } from './tanks';
import { createTask } from './tasks';

export interface PreviewRow extends CheckedRow {
	/** "Already in the tank (12)": not ticked unless the keeper ticks it */
	existing: string | null;
	/** filters, skimmers and CO₂ come with a maintenance reminder (T3) */
	reminder: string | null;
}

const water = (t: Tank) => (t.type === 'reef' ? 'marine' : t.type === 'brackish' ? null : 'fresh');
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** A file's rows, checked and compared with what the tank has. */
export function previewImport(list: ImportList, text: string, user: User, tank: Tank, map?: ColumnMap) {
	const read = readImport(list, text, { prefs: user, water: water(tank), today: todayInZone(user.timeZone) }, map);
	if ('error' in read) return read;
	const has = existingIn(list, user, tank.id);
	const rows: PreviewRow[] = read.rows.map((r) => ({
		...r,
		existing: r.value && !r.example ? has(r.value) : null,
		reminder: list === 'equipment' && r.value ? reminderFor(r.value as EquipmentValue) : null
	}));
	return { rows, ignored: read.ignored, fileColumns: read.fileColumns };
}

function existingIn(list: ImportList, user: User, tankId: string): (v: ImportValue) => string | null {
	if (list === 'livestock') {
		const rows = listLivestock(user.id, tankId);
		return (v) => {
			const l = v as LivestockValue;
			const same = rows.find(
				(r) =>
					!r.nickname &&
					r.status === l.status && (l.scientific && r.scientificName ? r.scientificName === l.scientific : lower(r.commonName) === lower(l.name))
			);
			return same ? `Already in the tank (${same.count}); tick it to add ${l.count} more` : null;
		};
	}
	if (list === 'plants') {
		const rows = listPlants(user.id, tankId);
		return (v) => {
			const p = v as PlantValue;
			const same = rows.some((r) => lower(r.name) === lower(p.name) || (!!p.scientific && r.scientificName === p.scientific));
			return same ? 'Already in the tank; tick it to add another' : null;
		};
	}
	const rows = listEquipment(user.id, tankId);
	return (v) => {
		const e = v as EquipmentValue;
		const same = rows.some((r) => r.type === e.type && lower(r.brand) === lower(e.brand) && lower(r.model) === lower(e.model));
		return same ? 'Already in the tank; tick it to add another' : null;
	};
}

function reminderFor(e: EquipmentValue) {
	const s = SUGGESTED_TASK[e.type];
	return s ? `${s.verb} ${equipmentName(e)} every ${s.days % 7 ? `${s.days} days` : `${s.days / 7} weeks`}` : null;
}

/** When a dated row's History entry goes: noon that day, in the keeper's time zone. */
const noon = (date: string | null, timeZone: string) => (date ? zonedToUtc(date, '12:00', timeZone).toISOString() : undefined);

/**
 * Add the rows, all or none. Livestock of a species the tank has (same status)
 * adds to its count, as adding by hand does.
 */
export function applyImport(
	list: ImportList,
	values: ImportValue[],
	user: User,
	tankId: string,
	opts: { reminders: boolean; fileName: string | null }
) {
	const today = todayInZone(user.timeZone);
	let reminders = 0;
	const animals = list === 'livestock' ? (values as LivestockValue[]).reduce((n, l) => n + l.count, 0) : 0;
	const summary =
		list === 'livestock' ? `${countOf('livestock', animals)} · ${values.length} species` : countOf(list, values.length);
	const imp = db.transaction(() => {
		const imp = record(user, tankId, list, opts.fileName, summary);
		for (const v of values) {
			if (list === 'livestock') {
				const l = v as LivestockValue;
				addLivestock(
					user.id,
					tankId,
					{ kind: l.kind, commonName: l.name, scientificName: l.scientific, count: l.count, status: l.status, addedAt: l.added ?? today, source: l.source },
					{ at: noon(l.added, user.timeZone), importId: imp.id }
				);
			} else if (list === 'plants') {
				const p = v as PlantValue;
				addPlant(
					user.id,
					tankId,
					{ name: p.name, scientificName: p.scientific, position: p.position, status: p.status },
					{ at: noon(p.added, user.timeZone), importId: imp.id }
				);
			} else {
				const e = v as EquipmentValue;
				const row = addEquipment(
					user.id,
					tankId,
					{ type: e.type, brand: e.brand, model: e.model, specs: e.specs, installedAt: e.installed, notes: e.notes },
					user.timeZone,
					imp.id
				);
				const s = SUGGESTED_TASK[e.type];
				if (s && opts.reminders) {
					createTask(user.id, tankId, {
						name: `${s.verb} ${equipmentName(row)}`,
						kind: 'maintenance',
						recurring: true,
						intervalDays: s.days,
						scheduleMode: 'completion',
						nextDue: addDays(today, s.days),
						openFormOnDone: false,
						equipmentId: row.id
					});
					reminders++;
				}
			}
		}
		return imp;
	});
	return { reminders, importId: imp.id, summary };
}

const record = (user: User, tankId: string, kind: ImportKind, fileName: string | null, summary: string) =>
	db.insert(imports).values({ userId: user.id, tankId, kind, fileName: fileName?.slice(0, 200) || null, summary }).returning().get();

// ── History ─────────────────────────────────────────────────────────────────

const CATEGORY: Record<Exclude<HistoryKind, 'tests'>, EventCategory> = {
	water_changes: 'water_change',
	dosing: 'dosing',
	maintenance: 'maintenance',
	observations: 'observation',
	notes: 'note'
};

/** What a History file is read against: the keeper's units, zone and the tank's parameters. */
export function historyContext(user: User, tank: Tank): HistoryContext {
	return {
		prefs: user,
		timeZone: user.timeZone,
		now: Date.now(),
		tankName: tank.name,
		params: listParams(tank.id, { all: true }),
		tankVolumeL: tank.actualVolumeL ?? tank.nominalVolumeL ?? null
	};
}

export interface HistoryPreviewRow extends CheckedRow<HistoryValue> {
	/** "Already in History": not ticked unless the keeper ticks it */
	existing: string | null;
	reminder: null;
}

/** A History file's rows, checked and compared with what History has. */
export function previewHistory(kind: HistoryFile, text: string, user: User, tank: Tank, map?: ColumnMap) {
	const read = readHistory(kind, text, historyContext(user, tank), map);
	if ('error' in read) return read;
	// a file of several kinds compares each row with its own kind's entries
	const checks = new Map<HistoryKind, (v: HistoryValue) => string | null>();
	const has = (v: HistoryValue) => {
		const k = kind === 'history' ? (v as MixedValue).kind : kind;
		if (!checks.has(k)) checks.set(k, existingHistory(k, tank.id, user.timeZone));
		return checks.get(k)!(v);
	};
	const rows: HistoryPreviewRow[] = read.rows.map((r) => ({
		...r,
		existing: r.value && !r.example && !r.other ? has(r.value) : null,
		reminder: null
	}));
	return { rows, ignored: read.ignored, fileColumns: read.fileColumns };
}

const SAME_DAY: Record<HistoryKind, string> = {
	tests: 'History has a water test that day',
	water_changes: 'History has a water change that day',
	dosing: 'History has this dose that day',
	maintenance: 'History has maintenance that day',
	observations: 'History has an observation that day',
	notes: 'History has this note that day'
};

/**
 * Entries History already has: the same minute (the file was imported
 * before, or it's the export of this tank), or the same day, as a time left
 * empty reads as noon. Doses and notes also need the same product or words.
 */
function existingHistory(kind: HistoryKind, tankId: string, timeZone: string): (v: HistoryValue) => string | null {
	const minutes = new Set<string>();
	const days = new Set<string>();
	const add = (at: string, what = '') => {
		const z = utcToZoned(at, timeZone);
		minutes.add(`${z.date} ${z.time} ${what}`);
		days.add(`${z.date} ${what}`);
	};
	const what = (v: HistoryValue) =>
		kind === 'dosing' ? (v as DosingValue).product.trim().toLowerCase() : kind === 'notes' ? (v as NoteValue).note.trim() : '';
	if (kind === 'tests') {
		for (const t of db.select({ at: tests.takenAt }).from(tests).where(eq(tests.tankId, tankId)).all()) add(t.at);
	} else {
		const rows = db
			.select({ at: events.occurredAt, data: events.data, note: events.note })
			.from(events)
			.where(and(eq(events.tankId, tankId), eq(events.category, CATEGORY[kind])))
			.all();
		for (const e of rows) add(e.at, kind === 'dosing' ? String(e.data.product ?? '').trim().toLowerCase() : kind === 'notes' ? (e.note ?? '').trim() : '');
	}
	return (v) => {
		const w = what(v);
		if (minutes.has(`${v.date} ${v.time} ${w}`)) return 'Already in History; tick it to add it again';
		return days.has(`${v.date} ${w}`) ? `${SAME_DAY[kind]}; tick it to add this one too` : null;
	};
}

/** Add the rows as History entries, all or none, each as if logged by hand at its date and time. */
export function applyHistory(file: HistoryFile, values: HistoryValue[], user: User, tank: Tank, fileName: string | null) {
	const summary = countOf(file, values.length);
	const imp = db.transaction(() => {
		const imp = record(user, tank.id, file, fileName, summary);
		const opts = { timeZone: user.timeZone };
		for (const v of values) {
			const at = zonedToUtc(v.date, v.time, user.timeZone).toISOString();
			const kind = file === 'history' ? (v as MixedValue).kind : file;
			if (kind === 'tests') {
				const t = v as TestValue;
				createTest(user.id, tank.id, { takenAt: at, note: t.note, readings: new Map(Object.entries(t.readings)), importId: imp.id }, opts);
				continue;
			}
			const { note, data } = eventOf(kind, v);
			createEvent(user.id, tank.id, { category: CATEGORY[kind], occurredAt: at, note, data, importId: imp.id }, opts);
		}
		return imp;
	});
	return { importId: imp.id, summary };
}

/** An event's note and data, shaped as the log form makes them. */
function eventOf(kind: Exclude<HistoryKind, 'tests'>, v: HistoryValue): { note: string | null; data: Record<string, unknown> } {
	switch (kind) {
		case 'water_changes': {
			const w = v as WaterChangeValue;
			return {
				note: w.note,
				data: {
					...(w.percent != null ? { percent: w.percent } : {}),
					...(w.volumeL != null ? { volume_l: w.volumeL } : {}),
					...(w.source ? { source: w.source } : {})
				}
			};
		}
		case 'dosing': {
			const d = v as DosingValue;
			return { note: d.note, data: { product: d.product, ...(d.amount != null ? { amount: d.amount } : {}), unit: d.unit } };
		}
		case 'maintenance': {
			const m = v as MaintenanceValue;
			return { note: m.note, data: { actions: m.actions } };
		}
		case 'observations': {
			const o = v as ObservationValue;
			return { note: o.note, data: { tags: o.tags } };
		}
		case 'notes':
			return { note: (v as NoteValue).note, data: {} };
	}
}

// ── Undo ────────────────────────────────────────────────────────────────────

/** A tank's imports of one kind, newest first. */
export function listImports(userId: string, tankId: string, kind: ImportKind, limit = 5) {
	return db
		.select()
		.from(imports)
		.where(and(eq(imports.userId, userId), eq(imports.tankId, tankId), eq(imports.kind, kind)))
		.orderBy(desc(imports.createdAt))
		.limit(limit)
		.all();
}

/**
 * Take back everything an import added, entries edited since included, with
 * any photos added to them. Animals it added to a group already in the tank
 * come off that group's count; everything else it added is deleted.
 */
export function undoImport(userId: string, importId: string) {
	const imp = db
		.select()
		.from(imports)
		.where(and(eq(imports.id, importId), eq(imports.userId, userId)))
		.get();
	if (!imp) error(404, 'Import not found');
	if (imp.undoneAt) return { ...imp, removed: 0, already: true };
	const now = new Date().toISOString();
	let removed = 0;
	db.transaction(() => {
		const withPhotos = db
			.select({ eventId: photos.eventId, testId: photos.testId })
			.from(photos)
			.where(
				and(
					eq(photos.tankId, imp.tankId),
					imp.kind === 'history' ? undefined : isNotNull(imp.kind === 'tests' ? photos.testId : photos.eventId)
				)
			)
			.all();
		const mine = new Set([
			...db.select({ id: events.id }).from(events).where(eq(events.importId, imp.id)).all().map((r) => r.id),
			...db.select({ id: tests.id }).from(tests).where(eq(tests.importId, imp.id)).all().map((r) => r.id)
		]);
		for (const p of withPhotos) {
			if (p.eventId && mine.has(p.eventId)) removeEntryPhotoFiles({ eventId: p.eventId });
			else if (p.testId && mine.has(p.testId)) removeEntryPhotoFiles({ testId: p.testId });
		}

		if (imp.kind === 'livestock') {
			const added = db.select().from(events).where(and(eq(events.importId, imp.id), eq(events.category, 'livestock'))).all();
			for (const e of added) {
				const row = db.select().from(livestock).where(eq(livestock.id, String(e.data.livestock_id))).get();
				if (!row) continue;
				const left = row.count - Number(e.data.delta ?? e.data.count ?? 0);
				if (left > 0) db.update(livestock).set({ count: left }).where(eq(livestock.id, row.id)).run();
				else if (row.importId === imp.id) db.delete(livestock).where(eq(livestock.id, row.id)).run();
				else db.update(livestock).set({ count: 0, removedAt: row.removedAt ?? now }).where(eq(livestock.id, row.id)).run();
			}
			removed = added.length;
		} else if (imp.kind === 'plants') {
			removed = db.delete(plants).where(eq(plants.importId, imp.id)).run().changes;
		} else if (imp.kind === 'equipment') {
			const ids = db.select({ id: equipment.id }).from(equipment).where(eq(equipment.importId, imp.id)).all().map((r) => r.id);
			if (ids.length) db.delete(tasks).where(inArray(tasks.equipmentId, ids)).run();
			removed = db.delete(equipment).where(eq(equipment.importId, imp.id)).run().changes;
		}
		const t = db.delete(tests).where(eq(tests.importId, imp.id)).run().changes;
		const e = db.delete(events).where(eq(events.importId, imp.id)).run().changes;
		if (imp.kind === 'tests') removed = t;
		else if (imp.kind === 'history') removed = t + e;
		else if (imp.kind in CATEGORY) removed = e;
		db.update(imports).set({ undoneAt: now }).where(eq(imports.id, imp.id)).run();
	});
	return { ...imp, removed, already: false };
}

/** "Import undone · 24 water tests removed"; just "Import undone" when its entries were already gone. */
export function undoneText(imp: { kind: ImportKind; summary: string; removed: number; already: boolean }) {
	if (imp.already) return 'That import was already undone';
	if (imp.kind === 'livestock') return `Import undone · ${imp.summary} removed`;
	return imp.removed ? `Import undone · ${countOf(imp.kind, imp.removed)} removed` : 'Import undone';
}
