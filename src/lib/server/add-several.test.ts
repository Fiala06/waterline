import { describe, expect, it, vi } from 'vitest';

// add-several.ts saves through import.ts, which opens the database; these tests only read lists
vi.mock('./import', () => ({ applyImport: () => ({ importId: 'x' }) }));
const { linesToValues } = await import('./add-several');

describe('linesToValues (Add several without scripts)', () => {
	it('reads a count and a name per line, and finds species the list knows', () => {
		const v = linesToValues('livestock', '6 Neon tetra\n\n  3× Amano shrimp \nMy mystery fish', 'fresh', { status: 'in_tank', added: '2026-09-28' });
		expect(v).toEqual([
			expect.objectContaining({ name: 'Neon tetra', count: 6, kind: 'fish', scientific: 'Paracheirodon innesi', added: '2026-09-28', status: 'in_tank' }),
			expect.objectContaining({ name: 'Amano shrimp', count: 3, kind: 'invert' }),
			expect.objectContaining({ name: 'My mystery fish', count: 1, kind: 'fish', scientific: null })
		]);
	});

	it('reads a count after the name too, as the page does (#120)', () => {
		const v = linesToValues('livestock', 'Otocinclus x 5\nAmano shrimp, 3', 'fresh', { status: 'in_tank', added: '2026-09-28' });
		expect(v.map((x) => [x.name, (x as { count: number }).count])).toEqual([
			['Otocinclus', 5],
			['Amano shrimp', 3]
		]);
	});

	it('plants go in the midground, thriving', () => {
		expect(linesToValues('plants', 'Java fern', 'fresh', { status: 'in_tank', added: '2026-09-28' })).toEqual([
			expect.objectContaining({ name: 'Java fern', position: 'midground', status: 'thriving' })
		]);
	});
});
