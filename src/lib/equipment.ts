// Equipment types and their type-specific fields (T3: "Fields adapt to type:
// heaters get wattage, lights get photoperiod"). Stored metric in `specs`.
import { formatNumber, toDisplay, toStored, unitLabel, type UnitPrefs } from './units';

export type EquipmentType = 'filter' | 'heater' | 'light' | 'co2' | 'pump' | 'skimmer' | 'other';

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
	filter: 'Filter',
	heater: 'Heater',
	light: 'Light',
	co2: 'CO₂',
	pump: 'Pump',
	skimmer: 'Skimmer',
	other: 'Other'
};
export const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_TYPE_LABEL) as EquipmentType[];

type Quantity = 'flow' | 'temp' | 'volume' | 'none';
export interface SpecField {
	key: string;
	label: string;
	kind: 'number' | 'text' | 'select';
	quantity?: Quantity;
	unit?: string; // fixed unit when quantity is none
	options?: string[];
	placeholder?: string;
}

export const SPEC_FIELDS: Record<EquipmentType, SpecField[]> = {
	filter: [
		{ key: 'filterType', label: 'Filter type', kind: 'select', options: ['Canister', 'Hang-on-back', 'Sponge', 'Internal', 'Sump', 'Undergravel'] },
		{ key: 'flowLh', label: 'Flow rate', kind: 'number', quantity: 'flow' },
		{ key: 'media', label: 'Media', kind: 'text', placeholder: 'Ceramic + sponge' }
	],
	heater: [
		{ key: 'watts', label: 'Wattage', kind: 'number', unit: 'W' },
		{ key: 'setC', label: 'Set to', kind: 'number', quantity: 'temp' }
	],
	light: [
		{ key: 'photoperiodH', label: 'Photoperiod', kind: 'number', unit: 'h' },
		{ key: 'intensity', label: 'Intensity', kind: 'number', unit: '%' },
		{ key: 'spectrum', label: 'Spectrum', kind: 'text', placeholder: 'Full spectrum' }
	],
	co2: [
		{ key: 'bps', label: 'Bubble rate', kind: 'number', unit: 'bps' },
		{ key: 'cylinder', label: 'Cylinder', kind: 'text', placeholder: '5 lb' }
	],
	pump: [{ key: 'flowLh', label: 'Flow rate', kind: 'number', quantity: 'flow' }],
	skimmer: [{ key: 'ratedL', label: 'Rated for', kind: 'number', quantity: 'volume' }],
	other: []
};

/** Suggested maintenance task when adding equipment (T3). */
export const SUGGESTED_TASK: Partial<Record<EquipmentType, { verb: string; days: number }>> = {
	filter: { verb: 'Clean', days: 28 },
	skimmer: { verb: 'Empty', days: 7 },
	co2: { verb: 'Check', days: 30 }
};

const LPH_PER_GPH = 3.785411784;

export function specUnit(f: SpecField, prefs: UnitPrefs): string {
	if (f.quantity === 'flow') return prefs.unitSystem === 'imperial' ? 'gph' : 'L/h';
	if (f.quantity === 'temp') return unitLabel('temp', prefs);
	if (f.quantity === 'volume') return unitLabel('volume', prefs);
	return f.unit ?? '';
}

export function specToDisplay(f: SpecField, stored: number, prefs: UnitPrefs): number {
	if (f.quantity === 'flow') return prefs.unitSystem === 'imperial' ? stored / LPH_PER_GPH : stored;
	if (f.quantity === 'temp') return toDisplay(stored, 'temp', prefs);
	if (f.quantity === 'volume') return toDisplay(stored, 'volume', prefs);
	return stored;
}

export function specToStored(f: SpecField, display: number, prefs: UnitPrefs): number {
	if (f.quantity === 'flow') return prefs.unitSystem === 'imperial' ? display * LPH_PER_GPH : display;
	if (f.quantity === 'temp') return toStored(display, 'temp', prefs);
	if (f.quantity === 'volume') return toStored(display, 'volume', prefs);
	return display;
}

/** "Tidewell C-400 canister" style name. */
export function equipmentName(e: { brand: string | null; model: string | null; type: EquipmentType; specs: Record<string, unknown> }) {
	const base = [e.brand, e.model].filter(Boolean).join(' ') || EQUIPMENT_TYPE_LABEL[e.type];
	const ft = typeof e.specs.filterType === 'string' ? e.specs.filterType.toLowerCase() : '';
	return e.type === 'filter' && ft && !base.toLowerCase().includes(ft) ? `${base} ${ft}` : base;
}

/** One-line spec summary: "1,200 L/h · Ceramic + sponge", "200 W · Set 77 °F", "8 h · 70%". */
export function specSummary(type: EquipmentType, specs: Record<string, unknown>, prefs: UnitPrefs): string[] {
	const out: string[] = [];
	for (const f of SPEC_FIELDS[type]) {
		const v = specs[f.key];
		if (v == null || v === '') continue;
		if (f.key === 'filterType') continue; // part of the name
		if (typeof v === 'number') {
			const shown = specToDisplay(f, v, prefs);
			const n = Number(formatNumber(shown, f.quantity === 'temp' ? 0 : 1)).toLocaleString('en-US');
			const u = specUnit(f, prefs);
			out.push(f.key === 'setC' ? `Set ${n} ${u}` : f.key === 'ratedL' ? `Up to ${n} ${u}` : u === '%' ? `${n}%` : `${n} ${u}`);
		} else out.push(String(v));
	}
	return out;
}
