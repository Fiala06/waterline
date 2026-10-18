import { describe, expect, it } from 'vitest';
import { nitrogenSource } from './fertilizer';

describe('whether a dosed product adds nitrogen', () => {
	it('fertilizers with nitrogen', () => {
		for (const p of ['Thrive S', 'NilocG Thrive+', 'Easy Green', 'Seachem Flourish Nitrogen', 'Tropica Specialised Nutrition', 'APT Complete', 'KNO3', 'EI macros', 'All-in-one fertilizer', 'NPK mix'])
			expect(nitrogenSource(p), p).toBe('yes');
	});
	it('conditioners, bacteria, medicines, buffers and fertilizers without nitrogen', () => {
		for (const p of ['Seachem Prime', 'Water conditioner', 'Seachem Stability', 'Fritz Zyme 7', 'Metro', 'Seachem Excel', 'Seachem Flourish', 'Flourish Iron', 'Tropica Premium Nutrition', 'APT Zero', 'GH+ remineraliser', 'Alkalinity part B', 'Potassium'])
			expect(nitrogenSource(p), p).toBe('no');
	});
	it("names it can't tell, and a saved product's strength of nitrate", () => {
		expect(nitrogenSource('My mix')).toBe('unknown');
		expect(nitrogenSource('')).toBe('unknown');
		expect(nitrogenSource('My mix', 'nitrate')).toBe('yes');
		expect(nitrogenSource('My mix', 'phosphate')).toBe('unknown');
	});
});
