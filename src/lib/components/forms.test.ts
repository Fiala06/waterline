import { describe, expect, it } from 'vitest';
import { entryHref, joinNames, photoOtherDay, splitTask } from './entry-form';
import { attentionSummary, cleanReading, readingRow, shortStatus, statusWord, testSaveLabel, waterChangeSummary, type TestParam } from './test-form';
import { doseHint, eventSaveLabel, eventTitle, lastDoseOf, livestockPreview, productChoices, stepCount } from './event-form';

// The log forms' logic, apart from their markup (#120).

describe('what the log forms share', () => {
	it('offers a photo’s date only when it was taken on another day', () => {
		const when = { date: '2026-10-07', time: '09:00' };
		expect(photoOtherDay([], when, 'UTC')).toBeNull();
		expect(photoOtherDay([null, { date: '2026-10-07', time: '08:00:00', offset: null }], when, 'UTC')).toBeNull();
		expect(photoOtherDay([null, { date: '2026-10-05', time: '15:20:30', offset: null }], when, 'UTC')).toEqual({ date: '2026-10-05', time: '15:20' });
		// with an offset: the moment in the keeper's zone (late on the 6th in UTC is the 7th in Auckland)
		expect(photoOtherDay([{ date: '2026-10-06', time: '23:30:00', offset: '+00:00' }], when, 'Pacific/Auckland')).toBeNull();
	});

	it('keeps the tank and time when moving to another log type', () => {
		const q = new URLSearchParams('tank=t1&date=2026-10-07&time=09:00&category=note&x=1');
		expect(entryHref(q, '/entries/event/new', 'dosing')).toBe('/entries/event/new?tank=t1&date=2026-10-07&time=09%3A00&category=dosing');
		expect(entryHref(new URLSearchParams('tank=t1'), '/entries/test/new')).toBe('/entries/test/new?tank=t1');
		expect(splitTask(null)).toBeNull();
		expect(splitTask({ label: 'Water test', sub: 'due today' })).toEqual({ main: 'Water test', next: 'due today' });
		expect(joinNames([{ name: 'pH' }, { name: 'KH' }, { name: 'GH' }])).toBe('pH, KH and GH');
		expect(joinNames([{ name: 'pH' }, { name: 'KH' }])).toBe('pH and KH');
	});
});

describe('the water test form', () => {
	const no3: TestParam = { id: 'n', key: 'no3', name: 'Nitrate', unit: 'ppm', min: 5, max: 20, rangeText: '5–20 ppm', last: '10 · Oct 1' };
	const gh: TestParam = { id: 'g', key: 'gh', name: 'GH', unit: 'ppm', min: 70, max: 140, rangeText: '70–140 ppm', last: null };
	const ghDeg: TestParam = { ...gh, unit: 'dGH', min: 4, max: 8, rangeText: '4–8 dGH' };

	it('reads each row as typed', () => {
		const r = readingRow(no3, '25', { mode: 'new' });
		expect(r).toMatchObject({ v: 25, st: { level: 'bad', direction: 'high' }, was: null, lastValue: '10', lastDate: 'Oct 1', degrees: false, drops: null });
		expect(readingRow(no3, '', { mode: 'new' }).st).toBeNull();
		// "was": while it's changed, the saved value; else the one before the last edit
		expect(readingRow(no3, '12', { mode: 'edit', saved: '15', previous: '40' }).was).toBe('15');
		expect(readingRow(no3, '15', { mode: 'edit', saved: '15', previous: '40' }).was).toBe('40');
		// hardness: in degrees, drops are degrees; in ppm, a value like drops gets its ppm
		expect(readingRow(ghDeg, '6', { mode: 'new' }).degrees).toBe(true);
		expect(readingRow(gh, '7', { mode: 'new' }).drops).toMatchObject({ drops: 7, times10: false });
		expect(readingRow(gh, '125', { mode: 'new' }).drops).toBeNull();
	});

	it('says what saving does, and the button counts the readings', () => {
		const row = (name: string, raw: string) => readingRow({ ...no3, name }, raw, { mode: 'new' });
		expect(attentionSummary([row('Nitrate', '25')])).toBe('▲ Nitrate is above target. Saving adds it to Needs attention.');
		expect(attentionSummary([row('Nitrate', '2')])).toBe('▲ Nitrate is below target. Saving adds it to Needs attention.');
		expect(attentionSummary([row('Nitrate', '25'), row('Phosphate', '1')])).toBe('▲ Nitrate and Phosphate are out of range. Saving adds them to Needs attention.');
		expect(attentionSummary([row('Nitrate', '19.6')])).toBe('▲ Nitrate is near a limit.');
		expect(attentionSummary([row('Nitrate', '10')])).toBe('');
		expect(testSaveLabel('new', 0, false)).toBe('Save');
		expect(testSaveLabel('new', 1, false)).toBe('Save 1 reading');
		expect(testSaveLabel('new', 3, true)).toBe('Save 3 readings + water change');
		expect(testSaveLabel('edit', 3, true)).toBe('Save changes');
	});

	it('words the status after its icon, and keeps only what a number can be', () => {
		expect(statusWord(readingRow(no3, '10', { mode: 'new' }))).toBe('In range');
		expect(statusWord(readingRow(no3, '19.6', { mode: 'new' }))).toBe('Near limit');
		expect(statusWord(readingRow(no3, '25', { mode: 'new' }))).toBe('Above 5–20');
		expect(shortStatus(readingRow(no3, '2', { mode: 'new' }))).toBe('✕ Below 5–20');
		expect(shortStatus(readingRow({ ...no3, max: null, rangeText: '≥ 5 ppm' }, '2', { mode: 'new' }))).toBe('✕ Below 5');
		expect(shortStatus(readingRow(no3, '', { mode: 'new' }))).toBe('');
		expect(cleanReading('7,2 ppm')).toBe('7.2');
		expect(cleanReading('-0.5')).toBe('-0.5');
		expect(waterChangeSummary('25', 'percent', 'gal', 'tap')).toBe('25% · Tap');
		expect(waterChangeSummary('', 'volume', 'gal', 'rodi')).toBe('– gal · RODI');
	});
});

describe('the event form', () => {
	const recent = [
		{ product: 'Easy Green', amount: 5, unit: 'mL', at: '2026-10-03T10:00:00Z' },
		{ product: 'Excel', amount: 2, unit: 'mL', at: '2026-10-01T10:00:00Z' }
	];

	it('lists products once, recent first, and says when one was last dosed', () => {
		expect(productChoices(recent, [{ name: ' easy green ' }, { name: 'Prime' }, { name: '' }])).toEqual(['Easy Green', 'Excel', 'Prime']);
		expect(lastDoseOf(recent, ' EASY GREEN')?.amount).toBe(5);
		expect(doseHint(recent, 'easy green', 3, 'UTC')).toBe('Last dosed 5 mL on Oct 3. Recent products are listed first.');
		expect(doseHint(recent, 'Prime', 2, 'UTC')).toBe('');
		expect(doseHint([], 'Prime', 1, 'UTC')).toBe('');
	});

	it('steps the count within its limits', () => {
		expect(stepCount('', 1, 1, null)).toBe('1');
		expect(stepCount('', -1, 1, null)).toBe('1');
		expect(stepCount('3', 1, 1, null)).toBe('4');
		expect(stepCount('1', -1, 1, null)).toBe('1');
		expect(stepCount('5', 1, 1, 5)).toBe('5');
		expect(stepCount('0', 1, 0, null)).toBe('1');
	});

	it('previews the livestock counts before saving', () => {
		const tank = [
			{ id: 'a', name: 'Neon tetra', count: 6, status: 'in_tank', scientific: 'Paracheirodon innesi' },
			{ id: 'b', name: 'Otocinclus', count: 3, status: 'quarantine' }
		];
		const base = { action: 'added', kind: 'fish', status: 'in_tank', count: '4', species: { name: 'Neons', scientific: 'Paracheirodon innesi' } };
		expect(livestockPreview(tank, base)).toEqual({ name: 'Neon tetra', from: 6, to: 10, total: 13 });
		// by name when there's no scientific name; another status is another group
		expect(livestockPreview(tank, { ...base, species: { name: 'otocinclus', scientific: '' } })).toEqual({ name: 'otocinclus', from: 0, to: 4, total: 13 });
		expect(livestockPreview(tank, { ...base, status: 'quarantine', species: { name: 'otocinclus', scientific: '' } })).toEqual({ name: 'Otocinclus', from: 3, to: 7, total: 13 });
		expect(livestockPreview(tank, { ...base, action: 'removed', count: '2', target: tank[0] })).toEqual({ name: 'Neon tetra', from: 6, to: 4, total: 7 });
		expect(livestockPreview(tank, { ...base, action: 'removed', count: '7', target: tank[0] })).toBeNull();
		expect(livestockPreview(tank, { ...base, count: '0' })).toBeNull();
		expect(livestockPreview(tank, { ...base, kind: 'plant' })).toBeNull();
	});

	it('titles the form and its button by category', () => {
		expect(eventTitle('new', 'dosing')).toBe('Log a dose');
		expect(eventTitle('new', 'note')).toBe('Add note or photo');
		expect(eventTitle('new', 'water_change')).toBe('Log water change');
		expect(eventTitle('edit', 'note')).toBe('Edit note');
		expect(eventSaveLabel('new', 'equipment')).toBe('Save equipment change');
		expect(eventSaveLabel('edit', 'equipment')).toBe('Save changes');
	});
});
