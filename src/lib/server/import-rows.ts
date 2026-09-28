// Bulk import from a spreadsheet (CSV): each list's template, reading its
// columns by name in any order, and checking every row before anything is
// saved. No database here; import.ts compares with the tank and saves.
import { parseCsv, toCsv } from '$lib/csv';
import {
	EQUIPMENT_TYPE_LABEL,
	EQUIPMENT_TYPES,
	SPEC_FIELDS,
	equipmentName,
	specSummary,
	specToStored,
	specUnit,
	type EquipmentType,
	type SpecField
} from '$lib/equipment';
import { fmtMoney, parseMoney } from '$lib/money';
import { fmtDateLong, isDate } from '$lib/time';
import type { UnitPrefs, UnitSystem } from '$lib/units';
import { exactSpecies } from './species';

export const IMPORT_LISTS = ['livestock', 'plants', 'equipment', 'expenses'] as const;
export type ImportList = (typeof IMPORT_LISTS)[number];
export const MAX_ROWS = 500;

export interface Column {
	key: string;
	header: string;
	/** what the import page says it takes */
	help: string;
	aliases?: string[];
	/** a number whose unit the header can name: "Flow rate (L/h)" */
	quantity?: SpecField['quantity'];
}

const LIVESTOCK_KINDS = ['fish', 'invert', 'coral'] as const;
const POSITIONS = ['background', 'midground', 'foreground', 'epiphyte'] as const;
const PLANT_STATUSES = ['thriving', 'melting', 'algae', 'other'] as const;
type Kind = (typeof LIVESTOCK_KINDS)[number];
type Position = (typeof POSITIONS)[number];
type PlantStatus = (typeof PLANT_STATUSES)[number];

export interface LivestockValue {
	kind: Kind;
	name: string;
	scientific: string | null;
	count: number;
	added: string | null;
	status: 'in_tank' | 'quarantine';
	source: string | null;
}
export interface PlantValue {
	name: string;
	scientific: string | null;
	position: Position;
	status: PlantStatus;
	added: string | null;
}
export interface EquipmentValue {
	type: EquipmentType;
	brand: string | null;
	model: string | null;
	specs: Record<string, number | string>;
	installed: string | null;
	notes: string | null;
}
/** A purchase for the tank's Spending tab. */
export interface ExpenseValue {
	date: string;
	what: string;
	amountCents: number;
	category: ExpenseCategory;
	note: string | null;
}
export type ImportValue = LivestockValue | PlantValue | EquipmentValue | ExpenseValue;
const EXPENSE_CATEGORIES = ['livestock', 'plants', 'equipment', 'consumables', 'other'] as const;
type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
const EXPENSE_LABEL: Record<ExpenseCategory, string> = { livestock: 'Livestock', plants: 'Plants', equipment: 'Equipment', consumables: 'Consumables', other: 'Other' };

export interface ImportContext {
	prefs: UnitPrefs;
	/** the tank's water, to pick between species that share a name */
	water: 'fresh' | 'marine' | null;
	today: string;
	/** for amounts spent: "$24.99" */
	currency?: string;
}

/** One row as the preview shows it. `value` is null when the row has a problem. */
export interface CheckedRow<V = ImportValue> {
	line: number;
	title: string;
	sub: string | null;
	detail: string;
	problems: string[];
	value: V | null;
	/** an example row from the template, left as it was */
	example: boolean;
	/** another tank's row (the export's Tank column), left out */
	other: string | null;
}

const TYPE_PLURAL: Record<EquipmentType, string> = {
	filter: 'filters',
	heater: 'heaters',
	light: 'lights',
	co2: 'CO₂',
	pump: 'pumps',
	skimmer: 'skimmers',
	other: 'other equipment'
};

/** Each spec column once ("Flow rate" is for filters and pumps), with the types it's for. */
function specColumns(prefs: UnitPrefs): Column[] {
	const cols = new Map<string, { f: SpecField; types: EquipmentType[] }>();
	for (const t of EQUIPMENT_TYPES) {
		for (const f of SPEC_FIELDS[t]) {
			const c = cols.get(f.key);
			if (c) c.types.push(t);
			else cols.set(f.key, { f, types: [t] });
		}
	}
	return [...cols.values()].map(({ f, types }) => {
		const unit = specUnit(f, prefs);
		const those = `For ${types.map((t) => TYPE_PLURAL[t]).join(' and ')}`;
		return {
			key: f.key,
			header: unit ? `${f.label} (${unit})` : f.label,
			help: f.options ? `${those}: ${f.options.slice(0, -1).join(', ')} or ${f.options.at(-1)}` : those,
			quantity: f.quantity
		};
	});
}

export function importColumns(list: ImportList, prefs: UnitPrefs): Column[] {
	if (list === 'livestock') {
		return [
			{ key: 'name', header: 'Name', help: 'Required. The name you use, e.g. Neon tetra', aliases: ['common name', 'species', 'animal', 'fish'] },
			{ key: 'scientific', header: 'Scientific name', help: 'Filled in when the name is in the species list', aliases: ['scientific', 'latin name', 'latin'] },
			{ key: 'type', header: 'Type', help: 'Fish, Invert or Coral. The species list knows most', aliases: ['kind', 'category', 'group'] },
			{ key: 'count', header: 'Count', help: 'How many. 1 when empty', aliases: ['qty', 'quantity', 'number', 'how many'] },
			{ key: 'added', header: 'Added', help: 'The date they went in. Today when empty', aliases: ['date added', 'added on', 'date'] },
			{ key: 'status', header: 'Status', help: 'In tank or Quarantine. In tank when empty' },
			{ key: 'source', header: 'Source', help: 'Store, breeder, price', aliases: ['from', 'store', 'bought from', 'where from'] }
		];
	}
	if (list === 'plants') {
		return [
			{ key: 'name', header: 'Name', help: 'Required. The name you use, e.g. Java fern', aliases: ['plant', 'common name', 'species'] },
			{ key: 'scientific', header: 'Scientific name', help: 'Filled in when the name is in the species list', aliases: ['scientific', 'latin name', 'latin'] },
			{ key: 'position', header: 'Position', help: 'Background, Midground, Foreground or Epiphyte. Midground when empty', aliases: ['placement', 'zone', 'where'] },
			{ key: 'status', header: 'Status', help: 'Thriving, Melting, Algae or Other. Thriving when empty', aliases: ['health', 'condition'] },
			{ key: 'added', header: 'Added', help: 'The date it went in, for History. Today when empty', aliases: ['date added', 'added on', 'date'] }
		];
	}
	if (list === 'expenses') {
		return [
			{ key: 'date', header: 'Date', help: 'The day you bought it. Today when empty', aliases: ['purchased', 'bought', 'bought on', 'day', 'purchase date'] },
			{ key: 'what', header: 'What', help: 'Required. What you bought, e.g. 12 Neon tetras', aliases: ['item', 'description', 'name', 'product', 'purchase'] },
			{ key: 'amount', header: 'Amount', help: 'Required. What it cost, e.g. 24.99', aliases: ['price', 'cost', 'total', 'paid', 'spent'] },
			{ key: 'category', header: 'Category', help: 'Livestock, Plants, Equipment, Consumables or Other. Other when empty', aliases: ['type', 'kind', 'group'] },
			{ key: 'note', header: 'Note', help: 'Where from, or anything else', aliases: ['notes', 'comment', 'comments', 'store', 'where'] }
		];
	}
	return [
		{ key: 'type', header: 'Type', help: 'Filter, Heater, Light, CO2, Pump, Skimmer or Other', aliases: ['kind', 'category', 'equipment'] },
		{ key: 'brand', header: 'Brand', help: 'A brand or a model is needed', aliases: ['make', 'manufacturer'] },
		{ key: 'model', header: 'Model', help: 'A brand or a model is needed', aliases: ['name', 'product'] },
		...specColumns(prefs),
		{ key: 'installed', header: 'Installed', help: 'The date it went in, for History', aliases: ['date installed', 'installed on', 'date', 'since'] },
		{ key: 'notes', header: 'Notes', help: 'Anything else', aliases: ['note', 'comments', 'comment'] }
	];
}

// ── Reading values ──────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date as spreadsheets write it: 2026-09-01, 9/1/2026, 1.9.2026, Sep 1 2026,
 * 1 September 2026, or a day number. 3/4/2026 reads month first with US units,
 * day first with metric ones; 25/12 and 12/25 are clear either way.
 */
export function parseDate(v: string, prefs: UnitPrefs): string | null {
	const s = v.trim().toLowerCase();
	let y: number;
	let m: number;
	let d: number;
	let x: RegExpExecArray | null;
	if ((x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/.exec(s))) [y, m, d] = [+x[1], +x[2], +x[3]];
	else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?: .*)?$/.exec(s))) {
		const [a, b] = [+x[1], +x[2]];
		y = x[3].length === 2 ? 2000 + +x[3] : +x[3];
		const dayFirst = a > 12 || (b <= 12 && prefs.unitSystem === 'metric');
		[d, m] = dayFirst ? [a, b] : [b, a];
	} else if ((x = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s))) {
		[m, d, y] = [MONTHS.indexOf(x[1]) + 1, +x[2], +x[3]];
	} else if ((x = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(s))) {
		[d, m, y] = [+x[1], MONTHS.indexOf(x[2]) + 1, +x[3]];
	} else if (/^\d{5}$/.test(s)) {
		// a spreadsheet's day number: days since 1899-12-30
		return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000).toISOString().slice(0, 10);
	} else return null;
	const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	return m >= 1 && isDate(iso) ? iso : null;
}

/** The number a cell starts with: "300", "300 gph", "1,200", "25,5". */
export function parseAmount(v: string): number | null {
	const x = /^\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?)(?![\d,.])/.exec(v);
	if (!x) return null;
	const n = Number(/^-?\d{1,3}(?:,\d{3})+/.test(x[1]) ? x[1].replace(/,/g, '') : x[1].replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}

/** A word from a list, or one of its synonyms; `undefined` when empty, null when unknown. */
export function pick<T extends string>(v: string, words: Record<string, T>): T | null | undefined {
	const k = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	if (!k) return undefined;
	return words[k] ?? null;
}

const KIND_WORDS: Record<string, Kind> = {
	fish: 'fish',
	fishes: 'fish',
	invert: 'invert',
	inverts: 'invert',
	invertebrate: 'invert',
	invertebrates: 'invert',
	shrimp: 'invert',
	snail: 'invert',
	snails: 'invert',
	crab: 'invert',
	crabs: 'invert',
	crayfish: 'invert',
	clam: 'invert',
	clams: 'invert',
	coral: 'coral',
	corals: 'coral',
	anemone: 'coral',
	anemones: 'coral'
};
const LIVESTOCK_STATUS_WORDS: Record<string, LivestockValue['status']> = {
	'in tank': 'in_tank',
	in_tank: 'in_tank',
	tank: 'in_tank',
	quarantine: 'quarantine',
	quarantined: 'quarantine',
	qt: 'quarantine'
};
const POSITION_WORDS: Record<string, Position> = {
	background: 'background',
	back: 'background',
	rear: 'background',
	midground: 'midground',
	mid: 'midground',
	middle: 'midground',
	foreground: 'foreground',
	front: 'foreground',
	carpet: 'foreground',
	epiphyte: 'epiphyte',
	epiphytes: 'epiphyte',
	attached: 'epiphyte'
};
const PLANT_STATUS_WORDS: Record<string, PlantStatus> = {
	thriving: 'thriving',
	healthy: 'thriving',
	good: 'thriving',
	ok: 'thriving',
	melting: 'melting',
	melt: 'melting',
	algae: 'algae',
	other: 'other'
};
const EQUIPMENT_WORDS: Record<string, EquipmentType> = {
	filter: 'filter',
	filters: 'filter',
	heater: 'heater',
	heaters: 'heater',
	light: 'light',
	lights: 'light',
	lighting: 'light',
	co2: 'co2',
	'co 2': 'co2',
	'co2 system': 'co2',
	pump: 'pump',
	pumps: 'pump',
	powerhead: 'pump',
	wavemaker: 'pump',
	'return pump': 'pump',
	skimmer: 'skimmer',
	'protein skimmer': 'skimmer',
	other: 'other'
};
const FILTER_WORDS: Record<string, string> = {
	canister: 'Canister',
	'hang on back': 'Hang-on-back',
	hob: 'Hang-on-back',
	sponge: 'Sponge',
	internal: 'Internal',
	sump: 'Sump',
	undergravel: 'Undergravel',
	ugf: 'Undergravel'
};

const EXPENSE_WORDS: Record<string, ExpenseCategory> = {
	livestock: 'livestock',
	fish: 'livestock',
	animals: 'livestock',
	shrimp: 'livestock',
	inverts: 'livestock',
	corals: 'livestock',
	plants: 'plants',
	plant: 'plants',
	equipment: 'equipment',
	gear: 'equipment',
	hardware: 'equipment',
	consumables: 'consumables',
	consumable: 'consumables',
	supplies: 'consumables',
	food: 'consumables',
	fertilizer: 'consumables',
	fertiliser: 'consumables',
	medication: 'consumables',
	medicine: 'consumables',
	salt: 'consumables',
	'test kit': 'consumables',
	'test kits': 'consumables',
	other: 'other',
	misc: 'other'
};

const KIND_LABEL: Record<Kind, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const quoted = (v: string) => `“${v.length > 40 ? v.slice(0, 40) + '…' : v}”`;

/** The name as typed (the one the keeper uses), and the scientific name from the species list when the row leaves it out. */
function species(name: string, scientific: string, water: ImportContext['water']) {
	const m = exactSpecies(name, water);
	return { name, scientific: scientific || m?.species?.s || null, kind: m?.kind ?? null };
}

function dateCell(v: string, what: string, ctx: ImportContext, problems: string[]) {
	if (!v) return null;
	const d = parseDate(v, ctx.prefs);
	if (!d) problems.push(`${what} ${quoted(v)} isn't a date`);
	else if (d > ctx.today) problems.push(`${what} ${fmtDateLong(d)} is in the future`);
	else return d;
	return null;
}

export type Cells = Record<string, string>;

function checkLivestock(c: Cells, ctx: ImportContext): Omit<CheckedRow, 'line' | 'example' | 'other'> {
	const problems: string[] = [];
	const typed = pick(c.type ?? '', KIND_WORDS);
	const plantWord = /^(plant|plants|moss|stem|stems)$/i.test((c.type ?? '').trim());
	const sp = species((c.name ?? '').slice(0, 80), (c.scientific ?? '').slice(0, 120), ctx.water);
	if (!sp.name) problems.push('No name');
	if (plantWord || (typed === undefined && sp.kind === 'plant')) problems.push(`${sp.name || 'This'} is a plant: import it on the Plants tab`);
	else if (typed === null) problems.push(`Type ${quoted(c.type)} isn't Fish, Invert or Coral`);
	const kind: Kind = typed ?? (sp.kind && sp.kind !== 'plant' ? sp.kind : 'fish');
	const rawCount = (c.count ?? '').trim();
	const whole = /^(\d+)(?:\.0+)?(?:\s+[a-z].*)?$/i.exec(rawCount);
	const count = rawCount === '' ? 1 : whole ? Number(whole[1]) : NaN;
	if (Number.isNaN(count)) problems.push(`Count ${quoted(rawCount)} isn't a whole number`);
	else if (count < 1) problems.push('Count is 0');
	else if (count > 10_000) problems.push('Count is over 10,000');
	const added = dateCell(c.added ?? '', 'Added', ctx, problems);
	const status = pick(c.status ?? '', LIVESTOCK_STATUS_WORDS);
	if (status === null) problems.push(`Status ${quoted(c.status)} isn't In tank or Quarantine`);
	const source = (c.source ?? '').slice(0, 120) || null;
	const value: LivestockValue = { kind, name: sp.name, scientific: sp.scientific, count, added, status: status ?? 'in_tank', source };
	return {
		title: sp.name || 'No name',
		sub: sp.scientific && sp.scientific !== sp.name ? sp.scientific : null,
		detail: [
			`${Number.isNaN(count) ? '?' : count} · ${KIND_LABEL[kind]}`,
			value.status === 'quarantine' ? 'Quarantine' : null,
			added ? `added ${fmtDateLong(added)}` : 'added today',
			source
		]
			.filter(Boolean)
			.join(' · '),
		problems,
		value: problems.length ? null : value
	};
}

function checkPlant(c: Cells, ctx: ImportContext): Omit<CheckedRow, 'line' | 'example' | 'other'> {
	const problems: string[] = [];
	const sp = species((c.name ?? '').slice(0, 80), (c.scientific ?? '').slice(0, 120), ctx.water);
	if (!sp.name) problems.push('No name');
	else if (sp.kind && sp.kind !== 'plant') problems.push(`${sp.name} is an animal: import it on the Livestock tab`);
	const position = pick(c.position ?? '', POSITION_WORDS);
	if (position === null) problems.push(`Position ${quoted(c.position)} isn't Background, Midground, Foreground or Epiphyte`);
	const status = pick(c.status ?? '', PLANT_STATUS_WORDS);
	if (status === null) problems.push(`Status ${quoted(c.status)} isn't Thriving, Melting, Algae or Other`);
	const added = dateCell(c.added ?? '', 'Added', ctx, problems);
	const value: PlantValue = { name: sp.name, scientific: sp.scientific, position: position ?? 'midground', status: status ?? 'thriving', added };
	return {
		title: sp.name || 'No name',
		sub: sp.scientific && sp.scientific !== sp.name ? sp.scientific : null,
		detail: [cap(value.position), cap(value.status), added ? `added ${fmtDateLong(added)}` : 'added today'].join(' · '),
		problems,
		value: problems.length ? null : value
	};
}

function checkExpense(c: Cells, ctx: ImportContext): Omit<CheckedRow, 'line' | 'example' | 'other'> {
	const problems: string[] = [];
	const what = (c.what ?? '').trim().slice(0, 80);
	if (!what) problems.push('No What');
	const rawAmount = (c.amount ?? '').trim();
	const amountCents = rawAmount ? parseMoney(rawAmount) : null;
	if (!rawAmount) problems.push('No amount');
	else if (amountCents == null) problems.push(`Amount ${quoted(rawAmount)} isn't an amount`);
	const category = pick(c.category ?? '', EXPENSE_WORDS);
	if (category === null) problems.push(`Category ${quoted(c.category)} isn't Livestock, Plants, Equipment, Consumables or Other`);
	const date = dateCell(c.date ?? '', 'Date', ctx, problems) ?? ctx.today;
	const note = (c.note ?? '').trim().slice(0, 500) || null;
	const value: ExpenseValue = { date, what, amountCents: amountCents ?? 0, category: category ?? 'other', note };
	return {
		title: what || 'No What',
		sub: note,
		detail: [amountCents != null ? fmtMoney(amountCents, ctx.currency) : '?', EXPENSE_LABEL[value.category], fmtDateLong(date)].join(' · '),
		problems,
		value: problems.length ? null : value
	};
}

/** The unit a header names, "(L/h)", "(°C)", "(gal)", when it differs from the keeper's. */
export function headerSystem(q: SpecField['quantity'], header: string): UnitSystem | null {
	const u = /\(([^)]*)\)/.exec(header)?.[1].toLowerCase() ?? '';
	if (!u || !q || q === 'none') return null;
	if (q === 'flow') return /gph|gal/.test(u) ? 'imperial' : /l\s*\/\s*h|lph|litre|liter/.test(u) ? 'metric' : null;
	if (q === 'temp') return /f/.test(u) ? 'imperial' : /c/.test(u) ? 'metric' : null;
	return /gal/.test(u) ? 'imperial' : /^l$|litre|liter/.test(u) ? 'metric' : null;
}

function checkEquipment(c: Cells, ctx: ImportContext, headers: Record<string, string>): Omit<CheckedRow, 'line' | 'example' | 'other'> {
	const problems: string[] = [];
	const rawType = (c.type ?? '').trim();
	const typed = pick(rawType, EQUIPMENT_WORDS);
	if (typed === undefined) problems.push('No type');
	// anything else is Other, named by what the row calls it when it has no brand or model
	const type: EquipmentType = typed ?? 'other';
	const brand = (c.brand ?? '').slice(0, 60) || null;
	const model = (c.model ?? '').slice(0, 60) || (typed === null && !brand ? rawType.slice(0, 60) : null);
	if (typed !== undefined && !brand && !model) problems.push('No brand or model');
	const specs: Record<string, number | string> = {};
	for (const f of SPEC_FIELDS[type]) {
		const v = (c[f.key] ?? '').trim();
		if (!v) continue;
		if (f.kind === 'number') {
			const n = parseAmount(v);
			if (n == null) problems.push(`${f.label} ${quoted(v)} isn't a number`);
			else if (n < 0) problems.push(`${f.label} is below 0`);
			else {
				const system = headerSystem(f.quantity, headers[f.key] ?? '');
				specs[f.key] = specToStored(f, n, system ? { ...ctx.prefs, unitSystem: system } : ctx.prefs);
			}
		} else if (f.kind === 'select') {
			const o = pick(v, FILTER_WORDS);
			if (!o) problems.push(`${f.label} ${quoted(v)} isn't ${f.options!.slice(0, -1).join(', ')} or ${f.options!.at(-1)}`);
			else specs[f.key] = o;
		} else specs[f.key] = v.slice(0, 80);
	}
	const installed = dateCell(c.installed ?? '', 'Installed', ctx, problems);
	const notes = (c.notes ?? '').slice(0, 2000) || null;
	const value: EquipmentValue = { type, brand, model, specs, installed, notes };
	return {
		title: brand || model ? equipmentName({ brand, model, type, specs }) : cap(rawType) || 'No type',
		sub: null,
		detail: [EQUIPMENT_TYPE_LABEL[type], ...specSummary(type, specs, ctx.prefs), installed ? `since ${fmtDateLong(installed)}` : null]
			.filter(Boolean)
			.join(' · '),
		problems,
		value: problems.length ? null : value
	};
}

// ── Templates ───────────────────────────────────────────────────────────────

/** The template's example rows, in the keeper's units. */
function examples(list: ImportList, prefs: UnitPrefs): Cells[] {
	const imperial = prefs.unitSystem === 'imperial';
	if (list === 'livestock') {
		return [
			{ name: 'Neon tetra', scientific: 'Paracheirodon innesi', type: 'Fish', count: '12', added: '2026-01-15', status: 'In tank', source: 'Local fish store' },
			{ name: 'Amano shrimp', type: 'Invert', count: '6', status: 'Quarantine' }
		];
	}
	if (list === 'plants') {
		return [
			{ name: 'Java fern', scientific: 'Microsorum pteropus', position: 'Epiphyte', status: 'Thriving', added: '2026-01-15' },
			{ name: 'Amazon sword', position: 'Background' }
		];
	}
	if (list === 'expenses') {
		return [
			{ date: '2026-09-01', what: '12 Neon tetras', amount: '23.88', category: 'Livestock', note: 'Local fish store' },
			{ what: 'Fertilizer refill', amount: '19.99', category: 'Consumables' }
		];
	}
	return [
		{ type: 'Filter', brand: 'Tidewell', model: 'C-400', filterType: 'Canister', flowLh: imperial ? '300' : '1135', media: 'Ceramic + sponge', installed: '2026-01-15', notes: 'Rinse the sponge monthly' },
		{ type: 'Heater', brand: 'Tidewell', watts: '200', setC: imperial ? '77' : '25' },
		{ type: 'Light', model: 'Lumen 60', photoperiodH: '8', intensity: '70', spectrum: 'Full spectrum' }
	];
}

/** A CSV to fill in: the columns Waterline reads, with example rows to replace. */
export function importTemplate(list: ImportList, prefs: UnitPrefs): string {
	const cols = importColumns(list, prefs);
	return toCsv([cols.map((c) => c.header), ...examples(list, prefs).map((e) => cols.map((c) => e[c.key] ?? ''))]);
}

// ── Reading a file ──────────────────────────────────────────────────────────

/** A column name as compared: "Flow rate (gph)" is "flowrate". */
export const headerKey = (s: string) =>
	s
		.toLowerCase()
		.replace(/\(.*?\)/g, '')
		.replace(/[^a-z0-9]+/g, '');

/** A column of the file as the preview lists it: its name, and what it's read as (null: not read). */
export interface FileColumn {
	index: number;
	header: string;
	key: string | null;
}

/**
 * What the keeper picked for each of the file's columns, by position: a
 * column's key, or '' for "not read". Columns left out are matched by name.
 */
export type ColumnMap = Record<number, string>;

/** The picks from the preview's form: map.0=date, map.3=p:…, map.5= (not read). */
export function columnMapOf(form: FormData): ColumnMap | undefined {
	const map: ColumnMap = {};
	let any = false;
	for (const [k, v] of form) {
		const m = /^map\.(\d{1,3})$/.exec(k);
		if (m && typeof v === 'string') {
			map[Number(m[1])] = v;
			any = true;
		}
	}
	return any ? map : undefined;
}

/**
 * A file's header row matched to `columns` by name or synonym, in any order,
 * or as the keeper picked (`map`), and the rows under it (numbered as the
 * spreadsheet numbers them, blank ones skipped). `need` is the one column a
 * file can't do without. `fileColumns` lists the file's columns for the
 * preview, errors included, so any of them can be picked by hand.
 */
export function readColumns(text: string, columns: Column[], need: { key: string; label: string }, maxRows = MAX_ROWS, map?: ColumnMap) {
	const all = parseCsv(text);
	const h = all.findIndex((r) => r.some((c) => c.trim()));
	if (h < 0) return { error: 'This file is empty.' };
	const found = new Map<number, Column>();
	const headers: Record<string, string> = {};
	const ignored: string[] = [];
	const fileColumns: FileColumn[] = [];
	const byKey = new Map(columns.map((c) => [c.key, c]));
	let twice: string | null = null;
	all[h].forEach((raw, i) => {
		const k = headerKey(raw);
		const picked = map?.[i];
		const c =
			picked !== undefined
				? byKey.get(picked)
				: columns.find((c) => !(c.key in headers) && [c.header, ...(c.aliases ?? [])].some((a) => headerKey(a) === k));
		if (c && c.key in headers) twice ??= c.header;
		if (c && !(c.key in headers)) {
			found.set(i, c);
			headers[c.key] = picked !== undefined && headerKey(raw) !== headerKey(c.header) ? c.header : raw;
		} else if (raw.trim()) ignored.push(raw.trim());
		if (raw.trim() || c) fileColumns.push({ index: i, header: raw.trim() || `Column ${i + 1}`, key: c && found.get(i) === c ? c.key : null });
	});
	if (twice) return { error: `Two columns are set to ${twice}. Choose it for one of them.`, fileColumns };
	if (!(need.key in headers)) {
		return { error: `There's no ${need.label} column. Choose which of your columns it is below, or start from the template.`, fileColumns };
	}
	const lines = all.map((cells, i) => ({ line: i + 1, cells })).filter((r, i) => i > h && r.cells.some((c) => c.trim()));
	if (!lines.length) return { error: 'There are no rows under the column names.' };
	if (lines.length > maxRows) return { error: `That's more than ${maxRows} rows. Split it into smaller files.` };
	const cellsOf = (cells: string[]) => {
		const c: Cells = {};
		for (const [i, col] of found) c[col.key] = (cells[i] ?? '').trim();
		return c;
	};
	return { lines, headers, ignored, cellsOf, fileColumns };
}

function check(list: ImportList, c: Cells, ctx: ImportContext, headers: Record<string, string>) {
	if (list === 'expenses') return checkExpense(c, ctx);
	return list === 'livestock' ? checkLivestock(c, ctx) : list === 'plants' ? checkPlant(c, ctx) : checkEquipment(c, ctx, headers);
}

/**
 * Every row of a file, checked. Columns are found by name (or a common
 * synonym) in any order; others are listed as ignored. The template's own
 * example rows, left as they were, are marked so they're not imported.
 */
export function readImport(
	list: ImportList,
	text: string,
	ctx: ImportContext,
	map?: ColumnMap
): { rows: CheckedRow[]; ignored: string[]; fileColumns: FileColumn[] } | { error: string; fileColumns?: FileColumn[] } {
	const need = list === 'equipment' ? { key: 'type', label: 'Type' } : list === 'expenses' ? { key: 'amount', label: 'Amount' } : { key: 'name', label: 'Name' };
	const t = readColumns(text, importColumns(list, ctx.prefs), need, MAX_ROWS, map);
	if ('error' in t) return { error: t.error!, fileColumns: t.fileColumns };
	const same = new Set(examples(list, ctx.prefs).map((e) => JSON.stringify(check(list, e, ctx, t.headers).value)));
	const rows = t.lines.map(({ line, cells }) => {
		const r = check(list, t.cellsOf(cells), ctx, t.headers);
		return { line, ...r, example: !!r.value && same.has(JSON.stringify(r.value)), other: null };
	});
	return { rows, ignored: t.ignored, fileColumns: t.fileColumns };
}

// ── What the import form posts back ─────────────────────────────────────────

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === null || text(v, max);
const date = (v: unknown, today: string) => v === null || (typeof v === 'string' && isDate(v) && v <= today);

/** A row posted back from the preview, checked again: it came from the browser. */
export function validValue(list: ImportList, v: unknown, today: string): ImportValue | null {
	if (!v || typeof v !== 'object') return null;
	const o = v as Record<string, unknown>;
	if (list === 'livestock') {
		const ok =
			LIVESTOCK_KINDS.includes(o.kind as Kind) &&
			text(o.name, 80) &&
			optText(o.scientific, 120) &&
			Number.isInteger(o.count) &&
			(o.count as number) >= 1 &&
			(o.count as number) <= 10_000 &&
			date(o.added, today) &&
			(o.status === 'in_tank' || o.status === 'quarantine') &&
			optText(o.source, 120);
		return ok ? (o as unknown as LivestockValue) : null;
	}
	if (list === 'plants') {
		const ok =
			text(o.name, 80) &&
			optText(o.scientific, 120) &&
			POSITIONS.includes(o.position as Position) &&
			PLANT_STATUSES.includes(o.status as PlantStatus) &&
			date(o.added, today);
		return ok ? (o as unknown as PlantValue) : null;
	}
	if (list === 'expenses') {
		const ok =
			typeof o.date === 'string' &&
			isDate(o.date) &&
			o.date <= today &&
			text(o.what, 80) &&
			Number.isInteger(o.amountCents) &&
			(o.amountCents as number) >= 0 &&
			(o.amountCents as number) <= 100_000_000 &&
			EXPENSE_CATEGORIES.includes(o.category as ExpenseCategory) &&
			optText(o.note, 500);
		return ok ? (o as unknown as ExpenseValue) : null;
	}
	const type = o.type as EquipmentType;
	if (!EQUIPMENT_TYPES.includes(type) || !optText(o.brand, 60) || !optText(o.model, 60) || (!o.brand && !o.model)) return null;
	if (!date(o.installed, today) || !optText(o.notes, 2000) || !o.specs || typeof o.specs !== 'object') return null;
	for (const [k, s] of Object.entries(o.specs as Record<string, unknown>)) {
		const f = SPEC_FIELDS[type].find((f) => f.key === k);
		if (!f) return null;
		if (f.kind === 'number' ? typeof s !== 'number' || !Number.isFinite(s) || s < 0 : f.kind === 'select' ? !f.options!.includes(s as string) : !text(s, 80)) {
			return null;
		}
	}
	return o as unknown as EquipmentValue;
}
