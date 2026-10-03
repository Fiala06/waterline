import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDuration, KIT_PRESETS, kitKeyFor, kitLine, kitSeconds, parseSteps, stepsText } from './kits';

describe('test kits (#21)', () => {
	it('reads a wait or a shake off the end of a step', () => {
		expect(parseSteps('Fill to 5 mL\nAdd 10 drops\nShake 30 s\nWait 5 min\nShake for 1 minute\nRead the colour')).toEqual([
			{ text: 'Fill to 5 mL' },
			{ text: 'Add 10 drops' },
			{ text: 'Shake 30 s', seconds: 30 },
			{ text: 'Wait 5 min', seconds: 300 },
			{ text: 'Shake for 1 minute', seconds: 60 },
			{ text: 'Read the colour' }
		]);
		expect(parseSteps('Add 5 drops of bottle 2')).toEqual([{ text: 'Add 5 drops of bottle 2' }]);
		expect(parseSteps('\n\n')).toEqual([]);
		expect(parseSteps('Wait 0 min')).toEqual([{ text: 'Wait 0 min' }]);
		expect(parseSteps('Wait 2,5 min')).toEqual([{ text: 'Wait 2,5 min', seconds: 150 }]);
	});
	it('adds the timed steps up and formats them', () => {
		const no3 = KIT_PRESETS.find((k) => k.id === 'api-no3')!;
		expect(kitSeconds(no3)).toBe(390);
		expect(fmtDuration(390)).toBe('6 min 30 s');
		expect(fmtDuration(300)).toBe('5 min');
		expect(fmtDuration(5)).toBe('5 s');
		expect(fmtClock(300)).toBe('5:00');
		expect(fmtClock(29.2)).toBe('0:30');
		expect(kitLine(no3)).toContain('Wait 5 min');
		expect(stepsText(parseSteps('A\nB 10 s'))).toBe('A\nB 10 s');
	});
	it('files a kit under the parameter key, or the custom name', () => {
		expect(kitKeyFor({ key: 'no3', name: 'Nitrate' })).toBe('no3');
		expect(kitKeyFor({ key: 'custom', name: ' Phosphate ' })).toBe('custom:phosphate');
	});
	it('presets round-trip through the editor', () => {
		for (const k of KIT_PRESETS) expect(parseSteps(stepsText(k.steps))).toEqual(k.steps);
	});
});
