import { describe, expect, it } from 'vitest';
import { careLine, compatibilityWarnings, groupWarning, tankWarnings, targetWarnings } from './care';

const metric = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
const imperial = { unitSystem: 'imperial', hardnessUnit: 'ppm' } as const;
const neon = { fb: 'Neon tetra', temp: [20, 26] as [number, number], ph: [5, 7] as [number, number], gh: [1, 2] as [number, number], length: 2.5, school: true };

describe('careLine', () => {
	it('reads in the keeper’s units', () => {
		expect(careLine(neon, metric)).toBe('20–26 °C · pH 5–7 · GH 1–2 dGH · up to 2.5 cm · in a group');
		expect(careLine(neon, imperial)).toBe('68–79 °F · pH 5–7 · GH 18–36 ppm · up to 1 in · in a group');
	});
	it('leaves out what FishBase doesn’t say', () => {
		expect(careLine({ temp: [22, 28] }, metric)).toBe('22–28 °C');
		expect(careLine({}, metric)).toBe('');
	});
});

describe('targetWarnings', () => {
	it('warns when the target’s middle is outside the range', () => {
		expect(targetWarnings('Neon tetra', neon, { temp: [25, 29], ph: [7.2, 8], gh: [4, 8] }, metric)).toEqual([
			"▲ Your tank's temperature target (25–29 °C) is outside the Neon tetra's range (20–26 °C)",
			"▲ Your tank's pH target (7.2–8) is outside the Neon tetra's range (5–7)",
			"▲ Your tank's GH target (4–8 dGH) is outside the Neon tetra's range (1–2 dGH)"
		]);
		// the middle at the edge of the range passes
		expect(targetWarnings('Neon tetra', neon, { temp: [24, 28], ph: [6.5, 7.5] }, metric)).toEqual([]);
	});
	it('passes a target that overlaps the range, and one-sided targets by their bound', () => {
		expect(targetWarnings('Neon tetra', neon, { temp: [22, 26] }, metric)).toEqual([]);
		expect(targetWarnings('Neon tetra', neon, { temp: [null, 25] }, metric)).toEqual([]);
		expect(targetWarnings('Neon tetra', neon, { temp: [27, null] }, metric)).toEqual(["▲ Your tank's temperature target (27 °C) is outside the Neon tetra's range (20–26 °C)"]);
	});
	it('says nothing without targets or ranges', () => {
		expect(targetWarnings('Neon tetra', {}, { temp: [24, 28] }, metric)).toEqual([]);
		expect(targetWarnings('Neon tetra', neon, {}, metric)).toEqual([]);
	});
});

describe('groupWarning', () => {
	it('asks for a group for shoalers, by FishBase or by the hobby list', () => {
		expect(groupWarning({ s: 'Paracheirodon innesi', name: 'Neon tetra', count: 3 }, neon)).toBe('▲ Neon tetra do best in groups of 6 or more · you have 3');
		expect(groupWarning({ s: 'Corydoras paleatus', name: 'Peppered cory', count: 2 }, null)).toBe('▲ Peppered cory do best in groups of 6 or more · you have 2');
		expect(groupWarning({ s: 'Paracheirodon innesi', name: 'Neon tetra', count: 6 }, neon)).toBe(null);
		expect(groupWarning({ s: 'Betta splendens', name: 'Betta', count: 1 }, null)).toBe(null);
		expect(groupWarning({ s: null, name: 'Mystery fish', count: 1 }, null)).toBe(null);
	});
});

describe('compatibilityWarnings', () => {
	it('names well-known conflicts once each, by genus or species', () => {
		const kept = [
			{ s: 'Betta splendens', name: 'Betta', count: 1 },
			{ s: 'Poecilia reticulata', name: 'Guppy', count: 6 },
			{ s: 'Pterophyllum scalare', name: 'Angelfish', count: 2 },
			{ s: 'Paracheirodon innesi', name: 'Neon tetra', count: 10 },
			{ s: 'Neocaridina davidi', name: 'Cherry shrimp', count: 20 }
		];
		const w = compatibilityWarnings(kept);
		expect(w).toContain("▲ Betta · Guppy: Bettas and guppies often don't get along: a betta takes a guppy's flowing fins for a rival's, and guppies nip in return.");
		expect(w).toContain('▲ Angelfish · Neon tetra: Grown angelfish eat fish the size of Neon tetra.');
		expect(w).toContain('▲ Angelfish · Betta: Angelfish and bettas both defend their space, and the one with longer fins loses.');
		expect(w.filter((x) => x.startsWith('▲ Cherry shrimp · Betta'))).toHaveLength(1);
		expect(w.filter((x) => x.startsWith('▲ Cherry shrimp · Angelfish'))).toHaveLength(1);
		expect(w).toHaveLength(5);
	});
	it('counts bettas, and skips the same clownfish species', () => {
		expect(compatibilityWarnings([{ s: 'Betta splendens', name: 'Betta', count: 2 }])).toEqual([
			"▲ Betta × 2: Two bettas in one tank fight, male or female alike, unless it's a large, planted sorority of several females watched closely."
		]);
		expect(compatibilityWarnings([{ s: 'Amphiprion ocellaris', name: 'Clownfish', count: 2 }])).toEqual([]);
		expect(compatibilityWarnings([{ s: 'Amphiprion ocellaris', name: 'Ocellaris', count: 2 }, { s: 'Amphiprion percula', name: 'Percula', count: 2 }])).toHaveLength(1);
	});
	it('is quiet for a peaceful community and for custom names', () => {
		expect(compatibilityWarnings([{ s: 'Paracheirodon innesi', name: 'Neon tetra', count: 10 }, { s: 'Corydoras paleatus', name: 'Cory', count: 6 }, { s: null, name: 'Mystery', count: 1 }])).toEqual([]);
	});
});

describe('tankWarnings', () => {
	it('puts targets, groups and conflicts together', () => {
		const w = tankWarnings(
			[
				{ s: 'Paracheirodon innesi', name: 'Neon tetra', count: 3 },
				{ s: 'Pterophyllum scalare', name: 'Angelfish', count: 1 }
			],
			(s) => (s === 'Paracheirodon innesi' ? neon : null),
			{ temp: [26, 30] },
			metric
		);
		expect(w).toEqual([
			"▲ Your tank's temperature target (26–30 °C) is outside the Neon tetra's range (20–26 °C)",
			'▲ Neon tetra do best in groups of 6 or more · you have 3',
			'▲ Angelfish · Neon tetra: Grown angelfish eat fish the size of Neon tetra.'
		]);
	});
});
