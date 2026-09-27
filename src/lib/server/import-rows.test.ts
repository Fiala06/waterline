import { describe, expect, it } from 'vitest';
import { IMPORT_LISTS, importTemplate, parseAmount, parseDate, readImport, validValue, type CheckedRow, type EquipmentValue } from './import-rows';

const us = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
const eu = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
const ctx = { prefs: us, water: 'fresh', today: '2026-09-26' } as const;

function rows(list: (typeof IMPORT_LISTS)[number], csv: string, c: Parameters<typeof readImport>[2] = ctx): CheckedRow[] {
	const r = readImport(list, csv, c);
	if ('error' in r) throw new Error(r.error);
	return r.rows;
}

describe('parseDate', () => {
	it('reads the ways spreadsheets write dates', () => {
		expect(parseDate('2026-09-01', us)).toBe('2026-09-01');
		expect(parseDate('2026/9/1 14:30', us)).toBe('2026-09-01');
		expect(parseDate('Sep 1, 2026', us)).toBe('2026-09-01');
		expect(parseDate('1 September 2026', eu)).toBe('2026-09-01');
		expect(parseDate('46266', us)).toBe('2026-09-01'); // a spreadsheet's day number
	});

	it('reads 9/1 month first with US units and day first with metric', () => {
		expect(parseDate('9/1/2026', us)).toBe('2026-09-01');
		expect(parseDate('9/1/26', us)).toBe('2026-09-01');
		expect(parseDate('9/1/2026', eu)).toBe('2026-01-09');
		expect(parseDate('1.9.2026', eu)).toBe('2026-09-01');
		// a day over 12 is clear either way
		expect(parseDate('25/12/2026', us)).toBe('2026-12-25');
		expect(parseDate('12/25/2026', eu)).toBe('2026-12-25');
	});

	it('refuses what is not a real date', () => {
		expect(parseDate('2026-02-30', us)).toBeNull();
		expect(parseDate('13/13/2026', us)).toBeNull();
		expect(parseDate('last spring', us)).toBeNull();
	});
});

describe('parseAmount', () => {
	it('takes the number a cell starts with', () => {
		expect(parseAmount('300')).toBe(300);
		expect(parseAmount('300 gph')).toBe(300);
		expect(parseAmount('150W')).toBe(150);
		expect(parseAmount('1,200')).toBe(1200);
		expect(parseAmount('25,5')).toBe(25.5);
		expect(parseAmount('about 300')).toBeNull();
	});
});

describe('templates', () => {
	it('read back as their own examples, left out, in both unit systems', () => {
		for (const prefs of [us, eu]) {
			for (const list of IMPORT_LISTS) {
				const r = rows(list, importTemplate(list, prefs), { ...ctx, prefs });
				expect(r.length).toBeGreaterThan(1);
				for (const row of r) {
					expect(row.problems).toEqual([]);
					expect(row.example).toBe(true);
				}
			}
		}
	});

	it('name the keeper’s units in the column names', () => {
		expect(importTemplate('equipment', us)).toContain('Flow rate (gph)');
		expect(importTemplate('equipment', us)).toContain('Set to (°F)');
		expect(importTemplate('equipment', eu)).toContain('Flow rate (L/h)');
		expect(importTemplate('equipment', eu)).toContain('Rated for (L)');
	});

	it('are no longer examples once a cell changes', () => {
		const csv = importTemplate('livestock', us).replace(',12,', ',14,');
		const [neon, amano] = rows('livestock', csv);
		expect(neon.example).toBe(false);
		expect(neon.value).toMatchObject({ name: 'Neon tetra', count: 14 });
		expect(amano.example).toBe(true);
	});
});

describe('reading columns', () => {
	it('finds columns by name or a common synonym, in any order, and lists the rest', () => {
		const r = readImport('livestock', 'Qty,Common name,Price\n4,Otocinclus,$3', ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.ignored).toEqual(['Price']);
		expect(r.rows[0].value).toMatchObject({ name: 'Otocinclus', count: 4 });
	});

	it('needs a Name column, or Type for equipment', () => {
		expect(readImport('plants', 'Plant name here\nJava fern', ctx)).toHaveProperty('error');
		expect(readImport('equipment', 'Brand\nTidewell', ctx)).toMatchObject({ error: expect.stringContaining('no Type column') });
		expect(readImport('plants', '', ctx)).toMatchObject({ error: 'This file is empty.' });
		expect(readImport('plants', 'Name\n\n', ctx)).toMatchObject({ error: 'There are no rows under the column names.' });
	});

	it('numbers rows as the spreadsheet does, blank lines included', () => {
		expect(rows('plants', 'Name\nJava fern\n\nAnubias').map((r) => r.line)).toEqual([2, 4]);
	});
});

describe('livestock rows', () => {
	it('fill the scientific name and type from the species list', () => {
		const [oto, amano, neon] = rows('livestock', 'Name,Type,Count\nOtocinclus,,5\nAmano shrimp,,\nParacheirodon innesi,,3');
		expect(oto.value).toMatchObject({ name: 'Otocinclus', scientific: 'Otocinclus vittatus', kind: 'fish', count: 5 });
		expect(amano.value).toMatchObject({ scientific: 'Caridina multidentata', kind: 'invert', count: 1 });
		// a scientific name in the Name column stays the name, and is the scientific one too
		expect(neon.value).toMatchObject({ name: 'Paracheirodon innesi', scientific: 'Paracheirodon innesi' });
		expect(neon.sub).toBeNull();
		expect(oto.detail).toBe('5 · Fish · added today');
	});

	it('read the words people use for type and status', () => {
		const [r] = rows('livestock', 'Name,Type,Status,Added\nBlue velvet shrimp,Shrimp,QT,9/20/2026');
		expect(r.value).toMatchObject({ kind: 'invert', status: 'quarantine', added: '2026-09-20' });
		expect(r.detail).toBe('1 · Invert · Quarantine · added Sep 20, 2026');
	});

	it('say what is wrong with a row', () => {
		const r = rows(
			'livestock',
			'Name,Type,Count,Added,Status\n,Fish,2,,\nCherry shrimp,Invert,a few,,\nJava fern,,,,\nGuppy,Mammal,2,,\nPlaty,,2,2027-01-01,\nMolly,,2,,Sick'
		);
		const problems = r.map((x) => x.problems);
		expect(problems[0]).toEqual(['No name']);
		expect(problems[1]).toEqual(['Count “a few” isn\'t a whole number']);
		expect(problems[2]).toEqual(['Java fern is a plant: import it on the Plants tab']);
		expect(problems[3]).toEqual(['Type “Mammal” isn\'t Fish, Invert or Coral']);
		expect(problems[4]).toEqual(['Added Jan 1, 2027 is in the future']);
		expect(problems[5]).toEqual(['Status “Sick” isn\'t In tank or Quarantine']);
		expect(r.every((x) => x.value === null)).toBe(true);
	});
});

describe('plant rows', () => {
	it('read position and status, with defaults', () => {
		const [fern, sword, carpet] = rows('plants', 'Name,Position,Status\nJava fern,Epiphyte,\nAmazon sword,back,healthy\nMonte Carlo,Carpet,Melting');
		expect(fern.value).toMatchObject({ scientific: 'Microsorum pteropus', position: 'epiphyte', status: 'thriving' });
		expect(sword.value).toMatchObject({ position: 'background', status: 'thriving' });
		expect(carpet.value).toMatchObject({ position: 'foreground', status: 'melting' });
		expect(fern.detail).toBe('Epiphyte · Thriving · added today');
	});

	it('send animals to the Livestock tab', () => {
		expect(rows('plants', 'Name\nNeon tetra')[0].problems).toEqual(['Neon tetra is an animal: import it on the Livestock tab']);
	});
});

describe('equipment rows', () => {
	it('store flow and temperature in metric, in the unit the column names', () => {
		const csv = 'Type,Brand,Model,Filter type,Flow rate (L/h),Wattage (W),Set to (°C)\nFilter,Tidewell,C-400,HOB,1135,,\nHeater,Tidewell,,,,200 W,25';
		const [filter, heater] = rows('equipment', csv);
		expect(filter.value).toMatchObject({ type: 'filter', specs: { filterType: 'Hang-on-back', flowLh: 1135 } });
		expect(heater.value).toMatchObject({ type: 'heater', specs: { watts: 200, setC: 25 } });
		expect(filter.title).toBe('Tidewell C-400 hang-on-back');
		expect(heater.detail).toBe('Heater · 200 W · Set 77 °F');
	});

	it('read the keeper’s units when the column names none', () => {
		const [r] = rows('equipment', 'Type,Model,Flow rate\nPump,Return 800,300');
		expect((r.value as EquipmentValue).specs.flowLh).toBeCloseTo(1135.6, 0);
	});

	it('keep unknown kinds as Other, named for what they are', () => {
		const [uv] = rows('equipment', 'Type,Brand\nUV sterilizer,');
		expect(uv.value).toMatchObject({ type: 'other', model: 'UV sterilizer' });
	});

	it('say what is wrong', () => {
		const r = rows('equipment', 'Type,Brand,Filter type,Wattage (W)\n,Tidewell,,\nFilter,,,\nFilter,Tidewell,Magic,\nHeater,Tidewell,,lots');
		expect(r.map((x) => x.problems)).toEqual([
			['No type'],
			['No brand or model'],
			['Filter type “Magic” isn\'t Canister, Hang-on-back, Sponge, Internal, Sump or Undergravel'],
			['Wattage “lots” isn\'t a number']
		]);
	});
});

describe('validValue', () => {
	const today = '2026-09-26';
	it('accepts rows as the preview sends them', () => {
		for (const r of rows('livestock', 'Name,Count\nOtocinclus,5')) expect(validValue('livestock', r.value, today)).toEqual(r.value);
		for (const r of rows('equipment', 'Type,Brand,Wattage (W)\nHeater,Tidewell,200')) expect(validValue('equipment', r.value, today)).toEqual(r.value);
	});

	it('refuses rows changed on the way', () => {
		const fish = { kind: 'fish', name: 'Oto', scientific: null, count: 5, added: null, status: 'in_tank', source: null };
		expect(validValue('livestock', fish, today)).not.toBeNull();
		expect(validValue('livestock', { ...fish, count: 0 }, today)).toBeNull();
		expect(validValue('livestock', { ...fish, count: 2.5 }, today)).toBeNull();
		expect(validValue('livestock', { ...fish, kind: 'plant' }, today)).toBeNull();
		expect(validValue('livestock', { ...fish, added: '2027-01-01' }, today)).toBeNull();
		expect(validValue('livestock', { ...fish, name: '' }, today)).toBeNull();
		const heater = { type: 'heater', brand: 'Tidewell', model: null, specs: { watts: 200 }, installed: null, notes: null };
		expect(validValue('equipment', heater, today)).not.toBeNull();
		expect(validValue('equipment', { ...heater, specs: { flowLh: 300 } }, today)).toBeNull();
		expect(validValue('equipment', { ...heater, specs: { watts: -1 } }, today)).toBeNull();
		expect(validValue('equipment', { ...heater, brand: null }, today)).toBeNull();
		expect(validValue('plants', 'Java fern', today)).toBeNull();
	});
});
