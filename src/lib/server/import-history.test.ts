import { describe, expect, it } from 'vitest';
import { HISTORY_FILES, HISTORY_IMPORTS, type HistoryFile } from '$lib/imports';
import { displayValue, paramDecimals, paramUnit } from '$lib/params';
import { formatNumber, toStored } from '$lib/units';
import { historyTemplate, parseTime, readHistory, type HistoryContext, type HistoryParam, type HistoryValue, type MixedValue, type TestValue } from './import-history';
import type { CheckedRow } from './import-rows';

const us = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
const eu = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;

const param = (p: Partial<HistoryParam> & Pick<HistoryParam, 'id' | 'key' | 'name' | 'unit'>): HistoryParam => ({
	decimals: 1,
	min: null,
	max: null,
	isCustom: false,
	tracked: true,
	...p
});
const PARAMS = [
	param({ id: 'ph', key: 'ph', name: 'pH', unit: '', min: 6.5, max: 7.5 }),
	param({ id: 'nh3', key: 'nh3', name: 'Ammonia', unit: 'ppm', decimals: 2, min: 0, max: 0.25 }),
	param({ id: 'no3', key: 'no3', name: 'Nitrate', unit: 'ppm', decimals: 0, min: 5, max: 20 }),
	param({ id: 'gh', key: 'gh', name: 'GH', unit: 'dGH', decimals: 0, min: 4, max: 8 }),
	param({ id: 'temp', key: 'temp', name: 'Temperature', unit: '°C', decimals: 0, min: 23.3, max: 26.7 }),
	param({ id: 'po4', key: 'po4', name: 'Phosphate', unit: 'ppm', decimals: 2, max: 1, tracked: false }),
	param({ id: 'tds', key: 'custom', name: 'TDS', unit: 'ppm', decimals: 0, isCustom: true })
];
const ctx: HistoryContext = {
	prefs: us,
	timeZone: 'America/Los_Angeles',
	now: Date.parse('2026-09-26T20:00:00Z'),
	tankName: 'Beta',
	params: PARAMS,
	tankVolumeL: 100
};

function rows(kind: HistoryFile, csv: string, c: HistoryContext = ctx): CheckedRow<HistoryValue>[] {
	const r = readHistory(kind, csv, c);
	if ('error' in r) throw new Error(r.error);
	return r.rows;
}
const value = <V extends HistoryValue>(r: CheckedRow<HistoryValue>) => r.value as V;

describe('parseTime', () => {
	it('reads the ways spreadsheets write a time', () => {
		expect(parseTime('9:00')).toBe('09:00');
		expect(parseTime('09:00:00')).toBe('09:00');
		expect(parseTime('9:05 AM')).toBe('09:05');
		expect(parseTime('9 a.m.')).toBe('09:00');
		expect(parseTime('9pm')).toBe('21:00');
		expect(parseTime('12am')).toBe('00:00');
		expect(parseTime('12:30 PM')).toBe('12:30');
		expect(parseTime('21.30')).toBe('21:30');
	});

	it('refuses what is not a time', () => {
		expect(parseTime('9')).toBeNull(); // too easy to misread
		expect(parseTime('25:00')).toBeNull();
		expect(parseTime('9:75')).toBeNull();
		expect(parseTime('13 pm')).toBeNull();
		expect(parseTime('noon')).toBeNull();
	});
});

describe('water tests', () => {
	it('finds the parameters by name in any order, in the units the columns name', () => {
		const [r] = rows(
			'tests',
			'Note,NO3,Ammonia,pH,Temp (°C),GH (ppm),Phosphate,TDS,Date,Time\nFirst,10,0.25,7.2,25,143,0.5,180,9/20/2026,8:15 AM\n'
		);
		expect(r.problems).toEqual([]);
		const v = value<TestValue>(r);
		expect(v).toMatchObject({ date: '2026-09-20', time: '08:15', note: 'First' });
		expect(v.readings).toMatchObject({ no3: 10, nh3: 0.25, ph: 7.2, temp: 25, po4: 0.5, tds: 180 });
		expect(v.readings.gh).toBeCloseTo(toStored(143, 'hardness', { ...us, hardnessUnit: 'ppm' }), 6);
		expect(r.title).toBe('Sep 20, 2026 · 8:15 AM');
	});

	it("reads a column without a unit in the keeper's units", () => {
		const [r] = rows('tests', 'Date,Temperature\n2026-09-20,77\n');
		expect(value<TestValue>(r).readings.temp).toBeCloseTo(25, 6);
		const [m] = rows('tests', 'Date,Temperature\n2026-09-20,25\n', { ...ctx, prefs: eu });
		expect(value<TestValue>(m).readings.temp).toBe(25);
	});

	it('takes the time from its column, the date cell, or noon', () => {
		const at = (date: string, time = '') => {
			const v = value<TestValue>(rows('tests', `Date,Time,pH\n${date},${time},7\n`)[0]);
			return `${v.date} ${v.time}`;
		};
		expect(at('2026-09-20', '18:30')).toBe('2026-09-20 18:30');
		expect(at('2026-09-20 18:30')).toBe('2026-09-20 18:30');
		expect(at('9/20/2026 6:30 p.m.')).toBe('2026-09-20 18:30');
		expect(at('2026-09-20')).toBe('2026-09-20 12:00');
		// an instant in UTC is the keeper's local time
		expect(at('2026-09-20T16:00:00Z')).toBe('2026-09-20 09:00');
	});

	it('reads 9/1 month first with US units and day first with metric', () => {
		expect(value<TestValue>(rows('tests', 'Date,pH\n9/1/2026,7\n')[0]).date).toBe('2026-09-01');
		expect(value<TestValue>(rows('tests', 'Date,pH\n1/9/2026,7\n', { ...ctx, prefs: eu })[0]).date).toBe('2026-09-01');
	});

	it('flags rows with a problem', () => {
		const r = rows(
			'tests',
			[
				'Date,Time,pH,Nitrate',
				'2026-09-20,,abc,',
				'2026-09-20,,,-2',
				'2026-09-20,,,',
				',,7,',
				'last week,,7,',
				'2026-09-20,25:99,7,',
				'2027-01-01,,7,'
			].join('\n')
		);
		expect(r.map((x) => x.problems)).toEqual([
			['pH “abc” isn\'t a number'],
			['Nitrate is below 0'],
			['No readings'],
			['No date'],
			['Date “last week” isn\'t a date'],
			['Time “25:99” isn\'t a time'],
			["That's in the future"]
		]);
		expect(r.every((x) => x.value === null)).toBe(true);
		// the future row still shows when it was
		expect(r[6].title).toBe('Jan 1, 2027 · 12:00 PM');
	});

	it("leaves out another tank's rows (the export's Tank column)", () => {
		const r = rows('tests', 'Date,Tank,pH\n2026-09-20,Beta,7\n2026-09-20,Reef 40,8.2\n2026-09-20,beta ,7.1\n');
		expect(r.map((x) => x.other)).toEqual([null, 'Reef 40', null]);
	});

	it("needs a date column and one of the tank's parameters", () => {
		expect(readHistory('tests', 'When,Foo\n2026-09-20,1\n', ctx)).toEqual({
			error: "None of the columns is one of this tank's parameters. Choose which they are below, or name them as Waterline does, like Nitrate (ppm).",
			fileColumns: [
				{ index: 0, header: 'When', key: 'date' },
				{ index: 1, header: 'Foo', key: null }
			]
		});
		expect(readHistory('tests', 'Day tested?,pH\n2026-09-20,7\n', ctx)).toMatchObject({ error: expect.stringContaining('no Date column') });
	});

	it("reads the export's water-tests.csv back unchanged", () => {
		// the export writes each reading in the keeper's units with one more decimal than the app shows
		const stored: Record<string, number> = { ph: 7.24, nh3: 0.25, no3: 12.5, gh: 6.3, temp: 25.3, po4: 0.46, tds: 182 };
		for (const prefs of [us, eu, { unitSystem: 'imperial', hardnessUnit: 'ppm' } as const]) {
			const c = { ...ctx, prefs };
			const cell = (p: HistoryParam, v: number) => formatNumber(displayValue(p, v, prefs), paramDecimals(p, prefs) + 1);
			const header = (p: HistoryParam) => `${p.name}${paramUnit(p, prefs) ? ` (${paramUnit(p, prefs)})` : ''}`;
			const csv = [
				['Date', 'Time', 'Tank', ...PARAMS.map(header), 'Note'].join(','),
				['2026-09-20', '08:15', 'Beta', ...PARAMS.map((p) => cell(p, stored[p.id])), '"Before, the water change"'].join(','),
				['2026-09-19', '08:15', 'Reef 40', ...PARAMS.map(() => ''), ''].join(',')
			].join('\n');
			const [r, other] = rows('tests', csv, c);
			expect(other.other).toBe('Reef 40');
			const v = value<TestValue>(r);
			expect(v).toMatchObject({ date: '2026-09-20', time: '08:15', note: 'Before, the water change' });
			for (const p of PARAMS) expect(cell(p, v.readings[p.id])).toBe(cell(p, stored[p.id]));
		}
	});
});

describe('water changes, dosing, maintenance, observations, notes', () => {
	it('reads a water change as a percentage or a volume, and works out the other', () => {
		const r = rows(
			'water_changes',
			[
				'Date,Amount (%),Volume (gal),Source,Note',
				'2026-09-01,25%,,Tap,',
				'2026-09-08,,10,RO/DI,With a vacuum',
				'2026-09-15,10 L,,mixed,',
				'2026-09-22,120,,,',
				'2026-09-23,,,,',
				'2026-09-24,20,,well,'
			].join('\n')
		);
		expect(r[0].value).toMatchObject({ percent: 25, volumeL: 25, source: 'tap', note: null });
		expect(r[1].value).toMatchObject({ volumeL: toStored(10, 'volume', us), percent: 37.9, source: 'rodi', note: 'With a vacuum' });
		expect(r[2].value).toMatchObject({ volumeL: 10, percent: 10, source: 'mix' });
		expect(r.slice(3).map((x) => x.problems)).toEqual([
			['Amount is not between 0 and 100%'],
			['No amount'],
			['Source “well” isn\'t Tap, RODI or Mix']
		]);
	});

	it('reads a dose with its unit in its own column or after the amount', () => {
		const r = rows(
			'dosing',
			['Date,Product,Amount,Unit', '2026-09-01,Seachem Prime,5 mL,', '2026-09-02,Easy Green,2,pumps', '2026-09-03,Iron,,', '2026-09-04,Excel,1,capfuls', '2026-09-05,,3,mL'].join('\n')
		);
		expect(r[0].value).toMatchObject({ product: 'Seachem Prime', amount: 5, unit: 'mL' });
		expect(r[1].value).toMatchObject({ product: 'Easy Green', amount: 2, unit: 'pumps' });
		expect(r[2].value).toMatchObject({ product: 'Iron', amount: null, unit: 'mL' });
		expect(r[3].problems).toEqual(['Unit “capfuls” isn\'t mL, drops, g, tsp or pumps']);
		expect(r[4].problems).toEqual(['No product']);
	});

	it("picks maintenance and observations from Waterline's lists and keeps the rest in the note", () => {
		const [m, empty] = rows('maintenance', 'Date,Done,Note\n2026-09-01,"Cleaned filter, gravel vac and fed the fish",Monthly\n2026-09-02,,\n');
		expect(m.value).toMatchObject({ actions: ['Cleaned filter', 'Vacuumed substrate'], note: 'fed the fish · Monthly' });
		expect(empty.problems).toEqual(['Nothing done or noted']);
		const [o] = rows('observations', 'Date,Noticed\n2026-09-01,cloudy; snails\n');
		expect(o.value).toMatchObject({ tags: ['Cloudy water', 'Pest snails'], note: null });
	});

	it('needs a note for a note', () => {
		const r = rows('notes', 'Date,Note\n2026-09-01,Moved the tank\n2026-09-02,\n');
		expect(r[0].value).toMatchObject({ date: '2026-09-01', time: '12:00', note: 'Moved the tank' });
		expect(r[1].problems).toEqual(['No note']);
	});
});

describe('templates', () => {
	it.each(HISTORY_FILES)('%s: the example rows read back as examples, so they are left out', (kind) => {
		for (const prefs of [us, eu]) {
			const c = { ...ctx, prefs };
			const r = rows(kind, historyTemplate(kind, c), c);
			// one of each kind in a file of several
			expect(r.length).toBe(kind === 'history' ? HISTORY_IMPORTS.length : 2);
			expect(r.every((x) => x.example && x.value && !x.problems.length)).toBe(true);
		}
	});

	it("has a column for each tracked parameter, in the keeper's units", () => {
		const header = historyTemplate('tests', ctx).replace(/^\uFEFF/, '').split('\r\n')[0];
		expect(header).toBe('Date,Time,pH,Ammonia (ppm),Nitrate (ppm),GH (dGH),Temperature (°F),TDS (ppm),Note');
	});
});

describe('choosing columns by hand', () => {
	const csv = 'Tag,Uhrzeit,Nitrat,Temp C,Bemerkung\n2026-09-20,9:00,15,25,Nach dem Wechsel\n';

	it('lists the file’s columns, with what each was matched to', () => {
		const r = readHistory('tests', csv, ctx);
		expect(r).toMatchObject({ error: expect.stringContaining('no Date column') });
		expect('fileColumns' in r && r.fileColumns).toEqual([
			{ index: 0, header: 'Tag', key: null },
			{ index: 1, header: 'Uhrzeit', key: null },
			{ index: 2, header: 'Nitrat', key: null },
			{ index: 3, header: 'Temp C', key: null },
			{ index: 4, header: 'Bemerkung', key: null }
		]);
	});

	it('reads the columns as picked, in the units their Waterline names say', () => {
		const map = { 0: 'date', 1: 'time', 2: 'p:no3', 3: 'p:temp', 4: 'note' };
		const r = readHistory('tests', csv, { ...ctx, prefs: eu }, map);
		if ('error' in r) throw new Error(r.error);
		expect(r.ignored).toEqual([]);
		const v = r.rows[0].value as TestValue;
		expect(v).toMatchObject({ date: '2026-09-20', time: '09:00', note: 'Nach dem Wechsel' });
		expect(v.readings).toEqual({ no3: 15, temp: 25 });
	});

	it('leaves out a column picked as not read', () => {
		const r = readHistory('tests', csv, ctx, { 0: 'date', 1: '', 2: 'p:no3', 3: '', 4: '' });
		if ('error' in r) throw new Error(r.error);
		expect(r.ignored).toEqual(['Uhrzeit', 'Temp C', 'Bemerkung']);
		expect((r.rows[0].value as TestValue).readings).toEqual({ no3: 15 });
	});

	it('refuses two columns picked as the same one', () => {
		expect(readHistory('tests', csv, ctx, { 0: 'date', 1: 'date', 2: 'p:no3' })).toMatchObject({ error: 'Two columns are set to Date. Choose it for one of them.' });
	});
});

describe('a file with several kinds of entry', () => {
	const csv = [
		'Date,Time,Type,Nitrate,pH,Amount,Source,Product,Unit,Done,Noticed,Note',
		'2026-09-20,9:00,Water test,15,7,,,,,,,',
		'2026-09-20,10:00,Water change,,,25%,Tap,,,,,',
		'2026-09-20,10:30,Dose,,,5,,Water conditioner,mL,,,',
		'2026-09-21,11:00,Maintenance,,,,,,,Cleaned filter,,',
		'2026-09-21,20:00,Observation,,,,,,,,Cloudy water,',
		'2026-09-22,12:00,Note,,,,,,,,,Fed frozen food',
		'2026-09-22,12:00,Party,,,,,,,,,',
		'2026-09-22,12:00,,,,,,,,,,Something'
	].join('\n');

	it('reads each row as its Type says, with one Amount for a dose or a water change', () => {
		const r = rows('history', csv);
		const kinds = r.map((x) => (x.value as MixedValue | null)?.kind ?? null);
		expect(kinds).toEqual(['tests', 'water_changes', 'dosing', 'maintenance', 'observations', 'notes', null, null]);
		expect(r[0].value).toMatchObject({ readings: { no3: 15, ph: 7 } });
		expect(r[1].value).toMatchObject({ percent: 25, source: 'tap' });
		expect(r[1].detail).toBe('Water change · 25% · Tap');
		expect(r[2].value).toMatchObject({ product: 'Water conditioner', amount: 5, unit: 'mL' });
		expect(r[3].value).toMatchObject({ actions: ['Cleaned filter'] });
		expect(r[5].value).toMatchObject({ note: 'Fed frozen food' });
	});

	it('says what’s wrong with a row without a known Type', () => {
		const r = rows('history', csv);
		expect(r[6].problems).toEqual(["Type “Party” isn't Water test, Water change, Dosing, Maintenance, Observation or Note"]);
		expect(r[7].problems).toEqual(['No type']);
	});
});
