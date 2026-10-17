import { describe, expect, it } from 'vitest';
import { algaeTitle, plantHealthTitle, plantObservationText, plantStatusAfter, PLANT_OBSERVATIONS, severityText } from './plants';

describe('plant health (#85)', () => {
	it('leaves a plant in a status, or removed', () => {
		expect(plantStatusAfter('thriving')).toBe('thriving');
		expect(plantStatusAfter('new_growth')).toBe('thriving');
		for (const v of ['melting', 'yellowing', 'pinholes', 'stunted'] as const) expect(plantStatusAfter(v)).toBe('melting');
		expect(plantStatusAfter('algae')).toBe('algae');
		expect(plantStatusAfter('removed')).toBeNull();
		expect(plantStatusAfter('other')).toBe('other');
	});

	it('always says it with a glyph and a word', () => {
		for (const o of PLANT_OBSERVATIONS) expect(plantObservationText(o.value)).toBe(`${o.glyph} ${o.label}`);
		expect(plantObservationText('nonsense')).toBe('– Other');
	});

	it('titles an entry by its plants and what was seen', () => {
		expect(plantHealthTitle({ plants: ['Ludwigia'], observation: 'pinholes' })).toBe('Ludwigia · pinholes');
		expect(plantHealthTitle({ plants: ['A', 'B'], observation: 'melting' })).toBe('A, B · melting');
		expect(plantHealthTitle({ plants: ['A', 'B', 'C'], observation: 'new_growth' })).toBe('3 plants · new growth');
		expect(plantHealthTitle({})).toBe('Plants · noted');
	});
});

describe('algae (#86)', () => {
	it('titles an entry by type, how much and where', () => {
		expect(algaeTitle({ algae: 'Black beard', severity: 'moderate', area: 'driftwood' })).toBe('Algae · Black beard · some · on driftwood');
		expect(algaeTitle({ algae: 'Green dust', severity: 'light' })).toBe('Algae · Green dust · a little');
		expect(algaeTitle({})).toBe('Algae');
		expect(severityText('heavy')).toBe('✕ A lot');
	});
});
