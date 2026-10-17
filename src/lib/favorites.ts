// Quick log favorites (#93): the keeper's usual entries, pinned on Quick add
// and in ⌘K. Each opens its log form filled in; nothing is saved until they
// save. Pure helpers: the labels, the link each opens and the fields it keeps.
import { MAINTENANCE_ACTIONS, WATER_SOURCES } from './events';
import type { When } from './time';

export type FavoriteKind = 'test' | 'water_change' | 'dosing' | 'feeding' | 'maintenance' | 'note';

/** What a favorite's form opens with, as typed into that form. */
export type FavoriteFields = Record<string, string | string[]>;

export interface FavoriteLike {
	kind: FavoriteKind;
	fields: FavoriteFields;
}

export const FAVORITE_KIND_LABEL: Record<FavoriteKind, string> = {
	test: 'Water test',
	water_change: 'Water change',
	dosing: 'Dose',
	feeding: 'Feeding',
	maintenance: 'Maintenance',
	note: 'Note or photo'
};

export const FAVORITE_KINDS = Object.keys(FAVORITE_KIND_LABEL) as FavoriteKind[];

export const isFavoriteKind = (s: string): s is FavoriteKind => (FAVORITE_KINDS as string[]).includes(s);

/** The form fields each kind can open with; anything else is dropped. */
const FIELDS: Record<FavoriteKind, string[]> = {
	test: [],
	water_change: ['amountMode', 'amount', 'source'],
	dosing: ['product', 'amount', 'unit'],
	feeding: ['food', 'amount', 'unit'],
	maintenance: ['actions'],
	note: []
};

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * The fields a favorite keeps, from a form or a saved row: only the ones its
 * kind takes, trimmed, with a water change's mode and source kept to their
 * choices and maintenance actions to the known ones. Empty ones are left out.
 */
export function cleanFields(kind: FavoriteKind, raw: Record<string, unknown>): FavoriteFields {
	const out: FavoriteFields = {};
	for (const k of FIELDS[kind]) {
		if (k === 'actions') {
			const list = Array.isArray(raw.actions) ? raw.actions : typeof raw.actions === 'string' ? [raw.actions] : [];
			const picked = list.filter((a): a is string => typeof a === 'string' && MAINTENANCE_ACTIONS.includes(a));
			if (picked.length) out.actions = picked;
			continue;
		}
		let v = text(raw[k], k === 'unit' ? 20 : 80);
		if (k === 'amountMode') v = v === 'volume' ? 'volume' : v === 'percent' ? 'percent' : '';
		if (k === 'source' && !WATER_SOURCES.some((s) => s.value === v)) v = '';
		if (k === 'amount') {
			const n = Number(v.replace(',', '.'));
			v = v && Number.isFinite(n) && n > 0 ? String(n) : '';
		}
		if (v) out[k] = v;
	}
	return out;
}

const field = (f: FavoriteFields, k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '');

/** "40%" or "10 gal" for a water change, "5 mL" for a dose or a feeding; null without an amount. */
function amountText(f: FavoriteFields, volUnit: string): string | null {
	const amount = field(f, 'amount');
	if (!amount) return null;
	if (field(f, 'amountMode') === 'volume') return `${amount} ${volUnit}`;
	if ('amountMode' in f || !('unit' in f || 'product' in f || 'food' in f)) return `${amount}%`;
	return `${amount} ${field(f, 'unit') || 'mL'}`.trim();
}

/**
 * The name a favorite gets when none is typed: "40% water change", "Dose Thrive
 * 5 mL", "Feed frozen food", "Trimmed plants", "Water test".
 */
export function favoriteDefaultLabel(kind: FavoriteKind, fields: FavoriteFields, volUnit: string): string {
	const amount = amountText(fields, volUnit);
	switch (kind) {
		case 'water_change':
			return amount ? `${amount} water change` : 'Water change';
		case 'dosing': {
			const product = field(fields, 'product');
			return ['Dose', product, amount].filter(Boolean).join(' ');
		}
		case 'feeding': {
			const food = field(fields, 'food');
			return food ? `Feed ${food}` : 'Feeding';
		}
		case 'maintenance': {
			const actions = Array.isArray(fields.actions) ? fields.actions : [];
			return actions.length ? actions.join(', ') : 'Maintenance';
		}
		default:
			return FAVORITE_KIND_LABEL[kind];
	}
}

/** The line under a favorite's name: what the form opens with ("40% · Tap", "Thrive · 5 mL"); null when nothing is filled in. */
export function favoriteSub(kind: FavoriteKind, fields: FavoriteFields, volUnit: string): string | null {
	const amount = amountText(fields, volUnit);
	const parts: string[] = [];
	switch (kind) {
		case 'water_change': {
			if (amount) parts.push(amount);
			const source = WATER_SOURCES.find((s) => s.value === field(fields, 'source'));
			if (source) parts.push(source.label);
			break;
		}
		case 'dosing':
		case 'feeding': {
			const what = field(fields, kind === 'dosing' ? 'product' : 'food');
			if (what) parts.push(what);
			if (amount) parts.push(amount);
			break;
		}
		case 'maintenance':
			if (Array.isArray(fields.actions)) parts.push(...fields.actions);
			break;
	}
	return parts.length ? parts.join(' · ') : null;
}

/** The log form a favorite opens, for a tank and (from Quick add) a chosen time, with its fields in the address. */
export function favoriteHref(f: FavoriteLike, tankId: string | null, when: When | null = null): string {
	const q = new URLSearchParams();
	if (tankId) q.set('tank', tankId);
	if (f.kind !== 'test' && f.kind !== 'note') q.set('category', f.kind);
	else if (f.kind === 'note') q.set('category', 'note');
	for (const [k, v] of Object.entries(cleanFields(f.kind, f.fields))) {
		if (Array.isArray(v)) for (const a of v) q.append(k, a);
		else q.set(k, v);
	}
	if (when) {
		q.set('date', when.date);
		q.set('time', when.time);
	}
	return `${f.kind === 'test' ? '/entries/test/new' : '/entries/event/new'}?${q}`;
}
