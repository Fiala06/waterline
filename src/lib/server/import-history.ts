// Importing History from a spreadsheet (CSV): water tests, water changes,
// dosing, maintenance, observations and notes. A template per kind; columns
// found by name in any order; every row checked before anything is saved.
// The export's water-tests.csv reads back as it is (its Tank column picks
// this tank's rows). No database here; import.ts compares and saves.
import { toCsv } from '$lib/csv';
import type { HistoryKind } from '$lib/imports';
import { DOSING_UNITS, MAINTENANCE_ACTIONS, OBSERVATION_TAGS, WATER_SOURCES } from '$lib/events';
import { displayValue, fmtValue, paramDecimals, paramUnit, quantityOf, storedValue, type ParamLike } from '$lib/params';
import { fmtDateLong, utcToZoned, zonedToUtc } from '$lib/time';
import { formatNumber, toDisplay, toStored, unitLabel, type UnitPrefs } from '$lib/units';
import { headerSystem, parseAmount, parseDate, pick, quoted, readColumns, type Cells, type CheckedRow, type Column } from './import-rows';

/** Years of weekly tests fit; a file this long can be split. */
export const MAX_HISTORY_ROWS = 2000;

export interface HistoryParam extends ParamLike {
	id: string;
	isCustom: boolean;
	/** templates have a column for each tracked parameter; files can have any */
	tracked: boolean;
}

export interface HistoryContext {
	prefs: UnitPrefs;
	timeZone: string;
	/** now (ms), to refuse the future */
	now: number;
	tankName: string;
	/** the tank's parameters, tracked or not */
	params: HistoryParam[];
	/** actual (or nominal) volume in liters, for % ↔ volume */
	tankVolumeL: number | null;
}

interface When {
	date: string;
	time: string;
}
export type TestValue = When & { readings: Record<string, number>; note: string | null };
export type WaterChangeValue = When & { percent: number | null; volumeL: number | null; source: 'tap' | 'rodi' | 'mix' | null; note: string | null };
export type DosingValue = When & { product: string; amount: number | null; unit: string; note: string | null };
export type MaintenanceValue = When & { actions: string[]; note: string | null };
export type ObservationValue = When & { tags: string[]; note: string | null };
export type NoteValue = When & { note: string };
export type HistoryValue = TestValue | WaterChangeValue | DosingValue | MaintenanceValue | ObservationValue | NoteValue;

// ── Columns ─────────────────────────────────────────────────────────────────

const DATE: Column = { key: 'date', header: 'Date', help: 'Required. E.g. 2026-09-20 or 9/20/2026', aliases: ['day', 'when', 'test date', 'date tested'] };
const TIME: Column = { key: 'time', header: 'Time', help: 'E.g. 9:00 or 9:00 AM. Noon when empty', aliases: ['hour'] };
const TANK: Column = { key: 'tank', header: 'Tank', help: "Optional. Another tank's rows are left out", aliases: ['aquarium'] };
const NOTE: Column = { key: 'note', header: 'Note', help: 'Optional', aliases: ['notes', 'comment', 'comments'] };

/** The names a parameter goes by in other logs and apps. */
const PARAM_ALIASES: Record<string, string[]> = {
	ph: ['ph'],
	nh3: ['ammonia', 'nh3', 'nh4', 'ammonium'],
	no2: ['nitrite', 'no2'],
	no3: ['nitrate', 'no3'],
	gh: ['gh', 'general hardness'],
	kh: ['kh', 'carbonate hardness', 'alkalinity', 'alk', 'dkh'],
	temp: ['temperature', 'temp', 'water temperature', 'water temp'],
	po4: ['phosphate', 'po4'],
	k: ['potassium', 'k'],
	fe: ['iron', 'fe'],
	co2: ['co2', 'carbon dioxide'],
	sal: ['salinity', 'sal'],
	ca: ['calcium', 'ca'],
	mg: ['magnesium', 'mg']
};

const paramKey = (p: HistoryParam) => `p:${p.id}`;

function paramColumns(ctx: Pick<HistoryContext, 'params' | 'prefs'>): Column[] {
	return ctx.params.map((p) => {
		const unit = paramUnit(p, ctx.prefs);
		const q = quantityOf(p.key);
		return {
			key: paramKey(p),
			header: unit ? `${p.name} (${unit})` : p.name,
			help:
				q === 'temp'
					? `In ${unit}, or name the other in the column: Temperature (${unit === '°F' ? '°C' : '°F'})`
					: q === 'hardness'
						? `In ${unit}, or name the other in the column: ${p.name} (${unit === 'ppm' ? (p.key === 'kh' ? 'dKH' : 'dGH') : 'ppm'})`
						: unit
							? `In ${unit}`
							: 'A number',
			aliases: p.isCustom ? [] : (PARAM_ALIASES[p.key] ?? [])
		};
	});
}

const ACTIONS_HELP = `${MAINTENANCE_ACTIONS.slice(0, -1).join(', ')} or ${MAINTENANCE_ACTIONS.at(-1)}; several with commas. Anything else goes in the note`;
const TAGS_HELP = `${OBSERVATION_TAGS.slice(0, -1).join(', ')} or ${OBSERVATION_TAGS.at(-1)}; several with commas. Anything else goes in the note`;

export function historyColumns(kind: HistoryKind, ctx: Pick<HistoryContext, 'params' | 'prefs'>): Column[] {
	const vol = unitLabel('volume', ctx.prefs);
	switch (kind) {
		case 'tests':
			return [DATE, TIME, TANK, ...paramColumns(ctx), NOTE];
		case 'water_changes':
			return [
				DATE,
				TIME,
				{ key: 'percent', header: 'Amount (%)', help: 'How much, as a percentage of the tank', aliases: ['amount', 'percent', 'percentage', 'change', 'water change'] },
				{ key: 'volume', header: `Volume (${vol})`, help: `Or how much in ${vol}`, aliases: ['volume', 'gallons', 'liters', 'litres', 'water changed'] },
				{ key: 'source', header: 'Source', help: 'Tap, RODI or Mix', aliases: ['water', 'source water', 'water source'] },
				NOTE
			];
		case 'dosing':
			return [
				DATE,
				TIME,
				{ key: 'product', header: 'Product', help: 'Required. E.g. Water conditioner', aliases: ['name', 'what', 'additive', 'fertilizer', 'supplement', 'dose'] },
				{ key: 'amount', header: 'Amount', help: 'Optional. A number', aliases: ['qty', 'quantity', 'dose amount'] },
				{ key: 'unit', header: 'Unit', help: `${DOSING_UNITS.slice(0, -1).join(', ')} or ${DOSING_UNITS.at(-1)}. mL when empty`, aliases: ['units'] },
				NOTE
			];
		case 'maintenance':
			return [DATE, TIME, { key: 'done', header: 'Done', help: ACTIONS_HELP, aliases: ['what', 'did', 'actions', 'maintenance', 'task', 'tasks', 'work'] }, NOTE];
		case 'observations':
			return [DATE, TIME, { key: 'noticed', header: 'Noticed', help: TAGS_HELP, aliases: ['what', 'observed', 'observation', 'issue', 'tags', 'seen'] }, NOTE];
		case 'notes':
			return [DATE, TIME, { ...NOTE, help: 'Required' }];
	}
}

// ── Reading values ──────────────────────────────────────────────────────────

/** A clock time as spreadsheets write it: 9:00, 09:00:00, 9:00 AM, 9 a.m., 9am, 21.30. */
export function parseTime(v: string): string | null {
	const x = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(?:([ap])\.?\s*m?\.?)?$/i.exec(v.trim());
	if (!x) return null;
	let h = Number(x[1]);
	const m = x[2] ? Number(x[2]) : 0;
	if (x[3]) {
		if (h < 1 || h > 12) return null;
		h = (h % 12) + (x[3].toLowerCase().startsWith('p') ? 12 : 0);
	} else if (!x[2]) return null; // a bare "9" is too easy to misread
	if (h > 23 || m > 59) return null;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "9:00 AM" for a 'HH:MM' time. */
const clock = (t: string) => {
	const [h, m] = t.split(':').map(Number);
	return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
};

/** An instant another app wrote in UTC or with an offset: 2026-09-20T16:00:00Z. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Date and time from a row: the Time column, or a time in the date cell ("9/20/2026 9:00 AM"). */
function whenOf(c: Cells, ctx: HistoryContext, problems: string[]): When | null {
	const raw = c.date ?? '';
	if (!raw) {
		problems.push('No date');
		return null;
	}
	const instant = INSTANT.test(raw) ? new Date(raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null;
	const zoned = instant && !Number.isNaN(instant.getTime()) ? utcToZoned(instant, ctx.timeZone) : null;
	const date = zoned?.date ?? parseDate(raw, ctx.prefs);
	if (!date) {
		problems.push(`Date ${quoted(raw)} isn't a date`);
		return null;
	}
	const rawTime = (c.time ?? '').trim() || /[ t](\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:[ap]\.?\s*m?\.?)?)\s*$/i.exec(raw)?.[1] || '';
	const time = zoned && !(c.time ?? '').trim() ? zoned.time : rawTime ? parseTime(rawTime) : '12:00';
	if (!time) {
		problems.push(`Time ${quoted(rawTime)} isn't a time`);
		return null;
	}
	// the row still shows its date; the problem keeps it from being added
	if (zonedToUtc(date, time, ctx.timeZone).getTime() > ctx.now + 120_000) problems.push("That's in the future");
	return { date, time };
}

/** The keeper's units, or the ones a column names: "Temperature (°C)", "GH (ppm)". */
function unitsFor(p: HistoryParam, header: string, prefs: UnitPrefs): UnitPrefs {
	const u = /\(([^)]*)\)/.exec(header)?.[1].toLowerCase() ?? '';
	if (!u) return prefs;
	const q = quantityOf(p.key);
	if (q === 'temp') return /f/.test(u) ? { ...prefs, unitSystem: 'imperial' } : /c/.test(u) ? { ...prefs, unitSystem: 'metric' } : prefs;
	if (q === 'hardness') return /ppm|mg/.test(u) ? { ...prefs, hardnessUnit: 'ppm' } : /d[gk]h|°d/.test(u) ? { ...prefs, hardnessUnit: 'dgh' } : prefs;
	return prefs;
}

/** Words from a list, with synonyms, split on commas; what doesn't match is kept for the note. */
function words(v: string, known: Record<string, string>) {
	const found: string[] = [];
	const rest: string[] = [];
	for (const part of v.split(/[,;/]|\band\b/i).map((s) => s.trim()).filter(Boolean)) {
		const w = pick(part, known);
		if (w && !found.includes(w)) found.push(w);
		else if (!w) rest.push(part);
	}
	return { found, rest };
}
const listWords = (list: string[], extra: Record<string, string>) => ({
	...Object.fromEntries(list.map((a) => [a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), a])),
	...extra
});
const ACTION_WORDS = listWords(MAINTENANCE_ACTIONS, {
	'clean filter': 'Cleaned filter',
	'filter cleaned': 'Cleaned filter',
	filter: 'Cleaned filter',
	'rinsed filter': 'Cleaned filter',
	'rinsed sponge': 'Cleaned filter',
	trim: 'Trimmed plants',
	trimmed: 'Trimmed plants',
	'trim plants': 'Trimmed plants',
	pruned: 'Trimmed plants',
	'cleaned glass': 'Scraped glass',
	glass: 'Scraped glass',
	'scraped algae': 'Scraped glass',
	media: 'Replaced media',
	'new media': 'Replaced media',
	'changed media': 'Replaced media',
	'gravel vac': 'Vacuumed substrate',
	'gravel vacuum': 'Vacuumed substrate',
	'vacuumed gravel': 'Vacuumed substrate',
	vacuumed: 'Vacuumed substrate',
	siphoned: 'Vacuumed substrate',
	'cleaned hoses': 'Cleaned lines',
	hoses: 'Cleaned lines',
	'cleaned tubing': 'Cleaned lines'
});
const TAG_WORDS = listWords(OBSERVATION_TAGS, {
	cloudy: 'Cloudy water',
	milky: 'Cloudy water',
	hazy: 'Cloudy water',
	'green water': 'Algae',
	'algae bloom': 'Algae',
	behavior: 'Fish behavior',
	behaviour: 'Fish behavior',
	'fish behaviour': 'Fish behavior',
	melt: 'Plant melt',
	melting: 'Plant melt',
	snails: 'Pest snails',
	odor: 'Smell',
	odour: 'Smell',
	sick: 'Sick fish',
	ich: 'Sick fish',
	disease: 'Sick fish'
});
const SOURCE_WORDS: Record<string, WaterChangeValue['source'] & string> = {
	tap: 'tap',
	'tap water': 'tap',
	rodi: 'rodi',
	'ro di': 'rodi',
	ro: 'rodi',
	di: 'rodi',
	'reverse osmosis': 'rodi',
	mix: 'mix',
	mixed: 'mix',
	both: 'mix'
};
const UNIT_WORDS: Record<string, string> = {
	ml: 'mL',
	milliliter: 'mL',
	milliliters: 'mL',
	millilitre: 'mL',
	millilitres: 'mL',
	drop: 'drops',
	drops: 'drops',
	g: 'g',
	gram: 'g',
	grams: 'g',
	tsp: 'tsp',
	teaspoon: 'tsp',
	teaspoons: 'tsp',
	pump: 'pumps',
	pumps: 'pumps'
};

/** A note, with what didn't match a list in front of it. */
const noteWith = (rest: string[], note: string) => [rest.join(', '), note].filter(Boolean).join(' · ').slice(0, 2000) || null;

// ── Checking rows ───────────────────────────────────────────────────────────

type Checked = Omit<CheckedRow<HistoryValue>, 'line' | 'example' | 'other'>;

function row(when: When | null, detail: string, sub: string | null, problems: string[], value: HistoryValue): Checked {
	return {
		title: when ? `${fmtDateLong(when.date)} · ${clock(when.time)}` : 'No date',
		sub,
		detail,
		problems,
		value: problems.length ? null : value
	};
}

function checkTest(c: Cells, ctx: HistoryContext, headers: Record<string, string>): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	const readings: Record<string, number> = {};
	const shown: string[] = [];
	let unread = false;
	for (const p of ctx.params) {
		const raw = (c[paramKey(p)] ?? '').trim();
		if (!raw) continue;
		const n = parseAmount(raw.replace(/^[~≈]\s*/, ''));
		if (n == null) {
			problems.push(`${p.name} ${quoted(raw)} isn't a number`);
			unread = true;
		} else if (n < 0 && quantityOf(p.key) !== 'temp') {
			problems.push(`${p.name} is below 0`);
			unread = true;
		} else {
			readings[p.id] = storedValue(p, n, unitsFor(p, headers[paramKey(p)] ?? '', ctx.prefs));
			const unit = paramUnit(p, ctx.prefs);
			shown.push(`${p.name} ${fmtValue(p, readings[p.id], ctx.prefs)}${unit ? ` ${unit}` : ''}`);
		}
	}
	if (!shown.length && !unread) problems.push('No readings');
	const note = (c.note ?? '').slice(0, 2000) || null;
	return row(when, shown.join(' · '), note, problems, { ...when!, readings, note });
}

function checkWaterChange(c: Cells, ctx: HistoryContext, headers: Record<string, string>): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	let rawP = (c.percent ?? '').trim();
	let rawV = (c.volume ?? '').trim();
	// a volume written in the Amount column: "10 gal"
	if (rawP && !rawV && /gal|\bl\b|lit(er|re)/i.test(rawP)) [rawP, rawV] = ['', rawP];
	let percent: number | null = null;
	let volumeL: number | null = null;
	if (rawP) {
		const n = parseAmount(rawP);
		if (n == null) problems.push(`Amount ${quoted(rawP)} isn't a number`);
		else if (n <= 0 || n > 100) problems.push('Amount is not between 0 and 100%');
		else percent = n;
	}
	if (rawV) {
		const n = parseAmount(rawV);
		if (n == null) problems.push(`Volume ${quoted(rawV)} isn't a number`);
		else if (n <= 0) problems.push('Volume is 0');
		else {
			// the unit the cell or column names ("10 L", "Volume (gal)"), else the keeper's
			const cell = /gal/i.test(rawV) ? 'imperial' : /\bl\b|lit(er|re)/i.test(rawV) ? 'metric' : null;
			const system = cell ?? headerSystem('volume', headers.volume ?? '');
			volumeL = toStored(n, 'volume', system ? { ...ctx.prefs, unitSystem: system } : ctx.prefs);
		}
	}
	if (!rawP && !rawV) problems.push('No amount');
	// the other one from the tank's volume, as logging a change does
	if (percent != null && volumeL == null && ctx.tankVolumeL) volumeL = (ctx.tankVolumeL * percent) / 100;
	if (volumeL != null && percent == null && ctx.tankVolumeL) percent = Math.round((volumeL / ctx.tankVolumeL) * 1000) / 10;
	const source = pick(c.source ?? '', SOURCE_WORDS);
	if (source === null) problems.push(`Source ${quoted(c.source)} isn't Tap, RODI or Mix`);
	const note = (c.note ?? '').slice(0, 2000) || null;
	const amount =
		percent != null
			? `${formatNumber(percent, 0)}%`
			: volumeL != null
				? `${formatNumber(toDisplay(volumeL, 'volume', ctx.prefs), 1)} ${unitLabel('volume', ctx.prefs)}`
				: '';
	const label = WATER_SOURCES.find((s) => s.value === source)?.label;
	return row(when, [amount, label].filter(Boolean).join(' · '), note, problems, { ...when!, percent, volumeL, source: source ?? null, note });
}

function checkDosing(c: Cells, ctx: HistoryContext): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	const product = (c.product ?? '').slice(0, 80);
	if (!product) problems.push('No product');
	const rawA = (c.amount ?? '').trim();
	let amount: number | null = null;
	if (rawA) {
		const n = parseAmount(rawA);
		if (n == null) problems.push(`Amount ${quoted(rawA)} isn't a number`);
		else if (n < 0) problems.push('Amount is below 0');
		else amount = n;
	}
	// the unit in its column, or after the amount ("5 mL")
	const rawU = (c.unit ?? '').trim() || rawA.replace(/^[\d.,\s]+/, '');
	const unit = pick(rawU, UNIT_WORDS);
	if (unit === null) problems.push(`Unit ${quoted(rawU)} isn't ${DOSING_UNITS.slice(0, -1).join(', ')} or ${DOSING_UNITS.at(-1)}`);
	const note = (c.note ?? '').slice(0, 2000) || null;
	const u = unit ?? 'mL';
	return row(when, `${product}${amount != null ? ` · ${formatNumber(amount, 2)} ${u}` : ''}`, note, problems, { ...when!, product, amount, unit: u, note });
}

function checkMaintenance(c: Cells, ctx: HistoryContext): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	const { found: actions, rest } = words(c.done ?? '', ACTION_WORDS);
	const note = noteWith(rest, c.note ?? '');
	if (!actions.length && !note) problems.push('Nothing done or noted');
	return row(when, actions.join(', ') || 'Maintenance', note, problems, { ...when!, actions, note });
}

function checkObservation(c: Cells, ctx: HistoryContext): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	const { found: tags, rest } = words(c.noticed ?? '', TAG_WORDS);
	const note = noteWith(rest, c.note ?? '');
	if (!tags.length && !note) problems.push('Nothing noticed or noted');
	return row(when, tags.join(', ') || 'Observation', note, problems, { ...when!, tags, note });
}

function checkNote(c: Cells, ctx: HistoryContext): Checked {
	const problems: string[] = [];
	const when = whenOf(c, ctx, problems);
	const note = (c.note ?? '').slice(0, 2000);
	if (!note) problems.push('No note');
	return row(when, note.split('\n')[0].slice(0, 80), null, problems, { ...when!, note });
}

function check(kind: HistoryKind, c: Cells, ctx: HistoryContext, headers: Record<string, string>): Checked {
	switch (kind) {
		case 'tests':
			return checkTest(c, ctx, headers);
		case 'water_changes':
			return checkWaterChange(c, ctx, headers);
		case 'dosing':
			return checkDosing(c, ctx);
		case 'maintenance':
			return checkMaintenance(c, ctx);
		case 'observations':
			return checkObservation(c, ctx);
		case 'notes':
			return checkNote(c, ctx);
	}
}

// ── Templates ───────────────────────────────────────────────────────────────

/** A value in a parameter's usual range, for the template: the middle, or 0 where lower is better. */
function exampleValue(p: HistoryParam, prefs: UnitPrefs): string {
	const v = p.min === 0 ? 0 : p.min != null && p.max != null ? (p.min + p.max) / 2 : (p.min ?? p.max);
	return v == null ? '' : formatNumber(displayValue(p, v, prefs), paramDecimals(p, prefs));
}

function examples(kind: HistoryKind, ctx: Pick<HistoryContext, 'params' | 'prefs'>): Cells[] {
	const vol = ctx.prefs.unitSystem === 'imperial' ? '10' : '40';
	switch (kind) {
		case 'tests':
			return [
				{ date: '2026-01-15', time: '09:00', ...Object.fromEntries(ctx.params.map((p) => [paramKey(p), exampleValue(p, ctx.prefs)])) },
				{
					date: '2026-01-22',
					time: '09:00',
					...Object.fromEntries(ctx.params.filter((_, i) => i % 2 === 0).map((p) => [paramKey(p), exampleValue(p, ctx.prefs)])),
					note: 'Before the water change'
				}
			];
		case 'water_changes':
			return [
				{ date: '2026-01-15', time: '10:00', percent: '25', source: 'Tap' },
				{ date: '2026-01-22', time: '10:00', volume: vol, source: 'RODI', note: 'With a gravel vacuum' }
			];
		case 'dosing':
			return [
				{ date: '2026-01-15', time: '09:30', product: 'Water conditioner', amount: '5', unit: 'mL' },
				{ date: '2026-01-16', time: '09:30', product: 'All-in-one fertilizer', amount: '2', unit: 'pumps', note: 'After lights on' }
			];
		case 'maintenance':
			return [
				{ date: '2026-01-15', time: '11:00', done: 'Cleaned filter, Trimmed plants' },
				{ date: '2026-02-12', time: '11:00', done: 'Replaced media', note: 'Swapped the fine pad' }
			];
		case 'observations':
			return [
				{ date: '2026-01-15', time: '20:00', noticed: 'Cloudy water', note: 'Clear again the next day' },
				{ date: '2026-01-20', time: '08:00', noticed: 'Algae', note: 'Green spots on the glass' }
			];
		case 'notes':
			return [
				{ date: '2026-01-15', time: '12:00', note: 'Moved the tank to the living room' },
				{ date: '2026-01-20', time: '12:00', note: 'Started feeding frozen food twice a week' }
			];
	}
}

/** The tracked parameters only: what a template has columns for. */
export const trackedOnly = <C extends Pick<HistoryContext, 'params'>>(ctx: C): C => ({ ...ctx, params: ctx.params.filter((p) => p.tracked) });

/** A CSV to fill in: this kind's columns (a test's are the tank's tracked parameters), with example rows. */
export function historyTemplate(kind: HistoryKind, ctx: Pick<HistoryContext, 'params' | 'prefs'>): string {
	const t = trackedOnly(ctx);
	const cols = historyColumns(kind, t).filter((c) => c.key !== 'tank');
	return toCsv([cols.map((c) => c.header), ...examples(kind, t).map((e) => cols.map((c) => e[c.key] ?? ''))]);
}

// ── Reading a file ──────────────────────────────────────────────────────────

const nameKey = (s: string) => s.trim().toLowerCase();

/**
 * Every row of a file, checked. The template's example rows, left as they
 * were, and another tank's rows (the export's Tank column) are marked so
 * they're not imported.
 */
export function readHistory(kind: HistoryKind, text: string, ctx: HistoryContext): { rows: CheckedRow<HistoryValue>[]; ignored: string[] } | { error: string } {
	const t = readColumns(text, historyColumns(kind, ctx), { key: 'date', label: 'Date' }, MAX_HISTORY_ROWS);
	if ('error' in t) return { error: t.error! };
	if (kind === 'tests' && !Object.keys(t.headers).some((k) => k.startsWith('p:'))) {
		return { error: "None of the columns is one of this tank's parameters. Name them as Waterline does, like Nitrate (ppm)." };
	}
	const same = new Set(examples(kind, trackedOnly(ctx)).map((e) => JSON.stringify(check(kind, e, ctx, t.headers).value)));
	const rows = t.lines.map(({ line, cells }) => {
		const c = t.cellsOf(cells);
		const other = c.tank && nameKey(c.tank) !== nameKey(ctx.tankName) ? c.tank : null;
		const r = check(kind, c, ctx, t.headers);
		return { line, ...r, example: !other && !!r.value && same.has(JSON.stringify(r.value)), other };
	});
	return { rows, ignored: t.ignored };
}
