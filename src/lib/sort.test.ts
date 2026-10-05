import { describe, expect, it } from 'vitest';
import { ariaSort, readSort, sortHref, sortRows } from './sort';

const u = (q: string) => new URL(`http://x/tanks/1/livestock${q}`);

describe('readSort', () => {
	it('reads a known key and direction, and nothing else', () => {
		expect(readSort(u('?sort=name&dir=desc'), ['name', 'count'])).toEqual({ key: 'name', dir: 'desc' });
		expect(readSort(u('?sort=name'), ['name'])).toEqual({ key: 'name', dir: 'asc' });
		expect(readSort(u('?sort=password'), ['name'])).toBeNull();
		expect(readSort(u(''), ['name'])).toBeNull();
		// the Sort by menu without scripts sends both in one
		expect(readSort(u('?sort=count:desc'), ['name', 'count'])).toEqual({ key: 'count', dir: 'desc' });
	});
});

describe('sortHref', () => {
	it('starts a column in its first direction and flips it on the second tap', () => {
		expect(sortHref(u('?tank=1'), 'name', null)).toBe('?tank=1&sort=name&dir=asc');
		expect(sortHref(u(''), 'added', null, 'desc')).toBe('?sort=added&dir=desc');
		expect(sortHref(u('?sort=name&dir=asc'), 'name', { key: 'name', dir: 'asc' })).toBe('?sort=name&dir=desc');
		expect(sortHref(u('?sort=name&dir=desc'), 'count', { key: 'name', dir: 'desc' })).toBe('?sort=count&dir=asc');
	});
	it('says how a header is sorted', () => {
		expect(ariaSort('name', { key: 'name', dir: 'desc' })).toBe('descending');
		expect(ariaSort('count', { key: 'name', dir: 'desc' })).toBe('none');
	});
});

describe('sortRows', () => {
	const rows = [
		{ n: 'neon tetra', c: 12, d: '2026-03-01' },
		{ n: 'Amano shrimp', c: 8, d: null },
		{ n: 'Otocinclus', c: 4, d: '2026-01-15' },
		{ n: 'Tank 10', c: 1, d: '2026-02-01' },
		{ n: 'Tank 2', c: 1, d: '2026-02-01' }
	];
	const by = (r: (typeof rows)[number], k: string) => (k === 'name' ? r.n : k === 'count' ? r.c : r.d);
	it('keeps the order without a choice', () => {
		expect(sortRows(rows, null, by)).toEqual(rows);
	});
	it('sorts words without case, numbers in order', () => {
		expect(sortRows(rows, { key: 'name', dir: 'asc' }, by).map((r) => r.n)).toEqual(['Amano shrimp', 'neon tetra', 'Otocinclus', 'Tank 2', 'Tank 10']);
		expect(sortRows(rows, { key: 'count', dir: 'desc' }, by).map((r) => r.c)).toEqual([12, 8, 4, 1, 1]);
	});
	it('puts rows without a value last either way, and keeps ties in order', () => {
		expect(sortRows(rows, { key: 'date', dir: 'asc' }, by).map((r) => r.n)).toEqual(['Otocinclus', 'Tank 10', 'Tank 2', 'neon tetra', 'Amano shrimp']);
		expect(sortRows(rows, { key: 'date', dir: 'desc' }, by).map((r) => r.n)).toEqual(['neon tetra', 'Tank 10', 'Tank 2', 'Otocinclus', 'Amano shrimp']);
	});
});
