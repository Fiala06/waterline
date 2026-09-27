// Event categories: labels, form options and one-line titles for feeds.
import type { EventCategory } from './types';
import { formatNumber, toDisplay, unitLabel, type UnitPrefs } from './units';

export const CATEGORY_LABEL: Record<EventCategory, string> = {
	water_change: 'Water change',
	dosing: 'Dosing',
	maintenance: 'Maintenance',
	livestock: 'Livestock / plants',
	equipment: 'Equipment',
	observation: 'Observation',
	note: 'Note'
};

/** Category tabs on the log event form, in design order. */
export const LOG_CATEGORIES: EventCategory[] = [
	'water_change',
	'dosing',
	'maintenance',
	'livestock',
	'equipment',
	'observation'
];

export const WATER_SOURCES = [
	{ value: 'tap', label: 'Tap' },
	{ value: 'rodi', label: 'RODI' },
	{ value: 'mix', label: 'Mix' }
] as const;

export const MAINTENANCE_ACTIONS = [
	'Cleaned filter',
	'Trimmed plants',
	'Scraped glass',
	'Replaced media',
	'Vacuumed substrate',
	'Cleaned lines'
];

export const LIVESTOCK_ACTIONS = [
	{ value: 'added', label: 'Added' },
	{ value: 'removed', label: 'Removed' },
	{ value: 'moved', label: 'Moved' }
] as const;

export const LIVESTOCK_STATUS = [
	{ value: 'in_tank', label: 'In tank' },
	{ value: 'quarantine', label: 'Quarantine' }
] as const;

export const EQUIPMENT_ACTIONS = [
	{ value: 'installed', label: 'Installed' },
	{ value: 'replaced', label: 'Replaced' },
	{ value: 'adjusted', label: 'Adjusted' },
	{ value: 'removed', label: 'Removed' }
] as const;

export const EQUIPMENT_REASONS = ['Algae', 'New plants', 'Heat', 'Schedule'];

export const OBSERVATION_TAGS = [
	'Cloudy water',
	'Algae',
	'Fish behavior',
	'Plant melt',
	'Pest snails',
	'Smell',
	'Sick fish'
];

export const RECHECK_OPTIONS = [
	{ value: '', label: 'No reminder' },
	{ value: '1', label: 'Tomorrow' },
	{ value: '3', label: 'In 3 days' },
	{ value: '7', label: 'In 1 week' }
];

export const DOSING_UNITS = ['mL', 'drops', 'g', 'tsp', 'pumps'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

interface EventLike {
	category: EventCategory;
	note: string | null;
	data: Record<string, unknown>;
}

/** One-line title for feeds and history, e.g. "Water change · 30% · RODI". */
export function eventTitle(e: EventLike, prefs: UnitPrefs): string {
	const d = e.data;
	switch (e.category) {
		case 'water_change': {
			const parts = ['Water change'];
			if (typeof d.percent === 'number') parts.push(`${formatNumber(d.percent, 0)}%`);
			else if (typeof d.volume_l === 'number')
				parts.push(`${formatNumber(toDisplay(d.volume_l, 'volume', prefs), 1)} ${unitLabel('volume', prefs)}`);
			const src = WATER_SOURCES.find((s) => s.value === d.source);
			if (src) parts.push(src.label);
			return parts.join(' · ');
		}
		case 'dosing': {
			const product = str(d.product) || 'product';
			const amount = typeof d.amount === 'number' ? ` · ${formatNumber(d.amount, 2)} ${str(d.unit)}`.trimEnd() : '';
			return `Dosed ${product}${amount}`;
		}
		case 'maintenance': {
			const actions = Array.isArray(d.actions) ? (d.actions as string[]) : [];
			const plants = Array.isArray(d.plants) ? (d.plants as string[]) : [];
			if (plants.length && actions.length === 1 && actions[0] === 'Trimmed plants') return `Trimmed ${plants.join(', ')}`;
			return actions.length ? actions.join(', ') : 'Maintenance';
		}
		case 'livestock': {
			const name = str(d.name) || (d.kind === 'plant' ? 'plant' : 'livestock');
			const n = typeof d.count === 'number' && d.count > 0 ? d.count : null;
			if (d.kind === 'plant') return d.action === 'removed' ? `Removed ${name}` : `Planted ${name}`;
			if (d.action === 'recount') return `Recount · ${name} ${d.from} → ${d.to}`;
			if (d.action === 'status') return `${name} ${d.status === 'quarantine' ? 'to quarantine' : 'moved into the tank'}`;
			if (d.action === 'added') return `+${n ?? 1} ${name}${d.status === 'quarantine' ? ' · quarantine' : ''}`;
			if (d.action === 'removed') return `−${n ?? 1} ${name}${d.reason ? ` · ${d.reason}` : ''}`;
			const action = LIVESTOCK_ACTIONS.find((a) => a.value === d.action)?.label ?? 'Changed';
			return `${action} ${n ? `${n} ` : ''}${name}`;
		}
		case 'equipment': {
			const action = EQUIPMENT_ACTIONS.find((a) => a.value === d.action)?.label ?? 'Changed';
			return `${action} ${str(d.item) || 'equipment'}`;
		}
		case 'observation': {
			const tags = Array.isArray(d.tags) ? (d.tags as string[]) : [];
			return tags.length ? tags.join(', ') : firstLine(e.note) || 'Observation';
		}
		case 'note': {
			if (d.system === 'tank_created') return `Tank created${d.type ? ` · ${cap(str(d.type))}` : ''}`;
			if (d.system === 'tank_archived') return 'Tank archived';
			if (d.system === 'tank_restored') return 'Tank restored';
			return firstLine(e.note) || 'Note';
		}
	}
}

function firstLine(s: string | null) {
	const line = (s ?? '').split('\n')[0].trim();
	return line.length > 60 ? line.slice(0, 57) + '…' : line;
}

/** The category icon for an entry: plant changes are logged as livestock, but show a plant. */
export function eventIcon(e: EventLike) {
	return e.category === 'livestock' && e.data.kind === 'plant' ? ('plant' as const) : e.category;
}

/** Category word shown under a feed title ("Sep 17 · Water change"). */
export function eventKindLabel(e: EventLike): string {
	if (e.category === 'livestock') return e.data.kind === 'plant' ? 'Plant change' : 'Livestock change';
	if (e.category === 'note' && e.data.system) return 'Tank';
	return CATEGORY_LABEL[e.category];
}

/** Which task kind an event category can complete. */
export function taskKindFor(category: EventCategory): 'water_change' | 'maintenance' | null {
	if (category === 'water_change') return 'water_change';
	if (category === 'maintenance') return 'maintenance';
	return null;
}
