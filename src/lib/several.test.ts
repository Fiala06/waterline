import { describe, expect, it } from 'vitest';
import { parseSeveralLine, parseSeveralList, severalSaveLabel } from './several';

// Add several's pasted list (#120): the same reading on the page and on the server.
describe('a pasted list', () => {
	it('reads a count before or after the name', () => {
		expect(parseSeveralLine('6 Neon tetra')).toEqual({ name: 'Neon tetra', count: 6 });
		expect(parseSeveralLine('6x Neon tetra')).toEqual({ name: 'Neon tetra', count: 6 });
		expect(parseSeveralLine('3× Otocinclus')).toEqual({ name: 'Otocinclus', count: 3 });
		expect(parseSeveralLine('Otocinclus x 5')).toEqual({ name: 'Otocinclus', count: 5 });
		expect(parseSeveralLine('Amano shrimp, 3')).toEqual({ name: 'Amano shrimp', count: 3 });
		expect(parseSeveralLine('  Java   fern ')).toEqual({ name: 'Java fern', count: 1 });
		expect(parseSeveralLine('   ')).toBeNull();
	});

	it('keeps counts from 1 to 999 and names to 80 characters, and skips blank lines', () => {
		expect(parseSeveralLine('0 Neon tetra')).toEqual({ name: 'Neon tetra', count: 1 });
		expect(parseSeveralLine('5000 Neon tetra')?.count).toBe(999);
		expect(parseSeveralLine('x'.repeat(100))?.name).toHaveLength(80);
		expect(parseSeveralList('6 Neon tetra\r\n\n  \nJava fern\n')).toEqual([
			{ name: 'Neon tetra', count: 6 },
			{ name: 'Java fern', count: 1 }
		]);
	});

	it('says what the button adds', () => {
		expect(severalSaveLabel(false, false, 3, 9)).toBe('Add them');
		expect(severalSaveLabel(true, false, 0, 0)).toBe('Add species');
		expect(severalSaveLabel(true, false, 2, 1)).toBe('Add 1 animal · 2 species');
		expect(severalSaveLabel(true, false, 2, 9)).toBe('Add 9 animals · 2 species');
		expect(severalSaveLabel(true, true, 0, 0)).toBe('Add plants');
		expect(severalSaveLabel(true, true, 1, 0)).toBe('Add 1 plant');
		expect(severalSaveLabel(true, true, 3, 0)).toBe('Add 3 plants');
	});
});
