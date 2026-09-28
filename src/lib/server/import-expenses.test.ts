import { describe, expect, it } from 'vitest';
import { importTemplate, readImport, validValue } from './import-rows';

const ctx = { prefs: { unitSystem: 'imperial' as const, hardnessUnit: 'dgh' as const }, water: 'fresh' as const, today: '2026-09-28', currency: 'USD' };

describe('importing spending', () => {
	it('reads each purchase, its amount as written, and its category by a common word', () => {
		const csv = 'Date,Item,Price,Category,Notes\n9/1/2026,12 Neon tetras,$23.88,Fish,Local store\n,Fertilizer,"1,019.50",fertilizer,\n2026-09-02,Filter,abc,Gear,';
		const r = readImport('expenses', csv, ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.rows[0].value).toEqual({ date: '2026-09-01', what: '12 Neon tetras', amountCents: 2388, category: 'livestock', note: 'Local store' });
		expect(r.rows[0].detail).toBe('$23.88 · Livestock · Sep 1, 2026');
		expect(r.rows[1].value).toEqual({ date: '2026-09-28', what: 'Fertilizer', amountCents: 101950, category: 'consumables', note: null });
		expect(r.rows[2].problems).toEqual(["Amount “abc” isn't an amount"]);
	});

	it('needs an Amount column, and a row needs What', () => {
		expect(readImport('expenses', 'What\nTetras', ctx)).toMatchObject({ error: expect.stringContaining('no Amount column') });
		const r = readImport('expenses', 'What,Amount\n,5', ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.rows[0].problems).toEqual(['No What']);
	});

	it("its template's examples aren't imported, and a row sent back is checked again", () => {
		const r = readImport('expenses', importTemplate('expenses', ctx.prefs as never), ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.rows.every((x) => x.example)).toBe(true);
		expect(validValue('expenses', { date: '2026-09-01', what: 'X', amountCents: 100, category: 'other', note: null }, ctx.today)).not.toBeNull();
		expect(validValue('expenses', { date: '2027-01-01', what: 'X', amountCents: 100, category: 'other', note: null }, ctx.today)).toBeNull();
		expect(validValue('expenses', { date: '2026-09-01', what: 'X', amountCents: -1, category: 'other', note: null }, ctx.today)).toBeNull();
	});
});
