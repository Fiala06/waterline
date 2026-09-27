// Enums shared by the database schema and the UI (kept out of $lib/server).
export const TANK_TYPES = ['freshwater', 'planted', 'brackish', 'reef'] as const;
export type TankType = (typeof TANK_TYPES)[number];

/** "Freshwater", "Planted"… for any tank type string. */
export const tankTypeLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

export const EVENT_CATEGORIES = [
	'water_change',
	'dosing',
	'maintenance',
	'livestock',
	'equipment',
	'observation',
	'note'
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const TASK_KINDS = ['water_change', 'test', 'maintenance', 'other'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** What a spreadsheet can be imported as: a tank's lists, or kinds of History entry. */
export const IMPORT_KINDS = ['livestock', 'plants', 'equipment', 'tests', 'water_changes', 'dosing', 'maintenance', 'observations', 'notes'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
