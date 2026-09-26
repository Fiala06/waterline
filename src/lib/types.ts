// Enums shared by the database schema and the UI (kept out of $lib/server).
export const TANK_TYPES = ['freshwater', 'planted', 'brackish', 'reef'] as const;
export type TankType = (typeof TANK_TYPES)[number];

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
