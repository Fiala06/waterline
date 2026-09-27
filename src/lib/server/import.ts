// Bulk import, the database side: which checked rows the tank already has,
// then adding the ones the keeper ticked as if each were added by hand, so
// History has an entry for each, on its Added date.
import { SUGGESTED_TASK, equipmentName } from '$lib/equipment';
import { addDays, todayInZone, zonedToUtc } from '$lib/time';
import { db } from './db';
import type { Tank, User } from './db/schema';
import {
	readImport,
	type CheckedRow,
	type EquipmentValue,
	type ImportList,
	type ImportValue,
	type LivestockValue,
	type PlantValue
} from './import-rows';
import { addEquipment, addLivestock, addPlant, listEquipment, listLivestock, listPlants } from './specs';
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
export function previewImport(list: ImportList, text: string, user: User, tank: Tank) {
	const read = readImport(list, text, { prefs: user, water: water(tank), today: todayInZone(user.timeZone) });
	if ('error' in read) return read;
	const has = existingIn(list, user, tank.id);
	const rows: PreviewRow[] = read.rows.map((r) => ({
		...r,
		existing: r.value && !r.example ? has(r.value) : null,
		reminder: list === 'equipment' && r.value ? reminderFor(r.value as EquipmentValue) : null
	}));
	return { rows, ignored: read.ignored };
}

function existingIn(list: ImportList, user: User, tankId: string): (v: ImportValue) => string | null {
	if (list === 'livestock') {
		const rows = listLivestock(user.id, tankId);
		return (v) => {
			const l = v as LivestockValue;
			const same = rows.find(
				(r) =>
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
export function applyImport(list: ImportList, values: ImportValue[], user: User, tankId: string, opts: { reminders: boolean }) {
	const today = todayInZone(user.timeZone);
	let reminders = 0;
	db.transaction(() => {
		for (const v of values) {
			if (list === 'livestock') {
				const l = v as LivestockValue;
				addLivestock(
					user.id,
					tankId,
					{ kind: l.kind, commonName: l.name, scientificName: l.scientific, count: l.count, status: l.status, addedAt: l.added ?? today, source: l.source },
					{ at: noon(l.added, user.timeZone) }
				);
			} else if (list === 'plants') {
				const p = v as PlantValue;
				addPlant(user.id, tankId, { name: p.name, scientificName: p.scientific, position: p.position, status: p.status }, { at: noon(p.added, user.timeZone) });
			} else {
				const e = v as EquipmentValue;
				const row = addEquipment(
					user.id,
					tankId,
					{ type: e.type, brand: e.brand, model: e.model, specs: e.specs, installedAt: e.installed, notes: e.notes },
					user.timeZone
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
	});
	return { reminders };
}
