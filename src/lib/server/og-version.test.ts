import { describe, expect, it, vi } from 'vitest';

// the hash only: no database
vi.mock('./db', () => ({ db: {} }));
const { ogVersion } = await import('./public');
type Args = Parameters<typeof ogVersion>;

const page = { ogPhotoId: null, ogPlain: false } as unknown as Args[0];
const tank = { coverPhotoId: 'c1', coverX: 50, coverY: 50 } as unknown as Args[1];
const view = (over: Record<string, unknown> = {}) =>
	({
		name: 'Riverbed 40',
		type: 'Planted',
		volume: '40 gal',
		since: 'Mar 2026',
		tested: 'today',
		readings: [{ key: 'ph', name: 'pH', value: '6.8', unit: '', level: 'ok', status: '✓ OK' }],
		summary: null,
		...over
	}) as unknown as Args[2];

describe('ogVersion (#335)', () => {
	it('changes with anything the share card draws', () => {
		const v = ogVersion(page, tank, view());
		expect(ogVersion(page, tank, view())).toBe(v);
		// an edited reading, a changed target, other units, a start date, a day later
		expect(ogVersion(page, tank, view({ readings: [{ key: 'ph', name: 'pH', value: '7.0', unit: '', level: 'ok', status: '✓ OK' }] }))).not.toBe(v);
		expect(ogVersion(page, tank, view({ readings: [{ key: 'ph', name: 'pH', value: '6.8', unit: '', level: 'bad', status: '✕ Low' }] }))).not.toBe(v);
		expect(ogVersion(page, tank, view({ volume: '151 L' }))).not.toBe(v);
		expect(ogVersion(page, tank, view({ since: null }))).not.toBe(v);
		expect(ogVersion(page, tank, view({ tested: 'Nov 23' }))).not.toBe(v);
		expect(ogVersion(page, { ...tank, coverX: 20 } as Args[1], view())).not.toBe(v);
	});
});
