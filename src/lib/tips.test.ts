import { describe, expect, it } from 'vitest';
import { defaultParameters } from './params';
import { nextStep, paramTip } from './tips';

const prefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;

describe('paramTip', () => {
	it('explains every parameter of every tank type', () => {
		for (const type of ['freshwater', 'planted', 'brackish', 'reef'] as const) {
			for (const p of defaultParameters(prefs, type)) expect(paramTip(p.key, type), `${type} ${p.key}`).toBeTruthy();
		}
	});

	it('reads KH as alkalinity in a reef', () => {
		expect(paramTip('kh', 'freshwater')).toMatch(/^Carbonate hardness/);
		expect(paramTip('kh', 'reef')).toMatch(/^Alkalinity/);
		expect(paramTip('sal', 'reef')).toMatch(/35 ppt/);
		expect(paramTip('sal', 'brackish')).not.toMatch(/35 ppt/);
	});

	it('has nothing to say about a custom parameter', () => {
		expect(paramTip('custom:silicate', 'freshwater')).toBeNull();
	});
});

describe('nextStep', () => {
	it('says what to do for every parameter of every tank type, both ways', () => {
		for (const type of ['freshwater', 'planted', 'brackish', 'reef'] as const) {
			for (const p of defaultParameters(prefs, type)) {
				expect(nextStep(p.key, 'high', type), `${type} ${p.key} high`).toBeTruthy();
				// ammonia and nitrite can't read below their 0 target
				if (p.min !== 0) expect(nextStep(p.key, 'low', type), `${type} ${p.key} low`).toBeTruthy();
			}
		}
	});

	it('uses reef wording in a reef, and nothing for custom parameters or no direction', () => {
		expect(nextStep('kh', 'low', 'reef')).toMatch(/alkalinity dose/);
		expect(nextStep('kh', 'low', 'planted')).toMatch(/pH drop/);
		expect(nextStep('nh3', 'high', 'reef')).toMatch(/water change|water/);
		expect(nextStep('custom', 'high', 'planted')).toBeNull();
		expect(nextStep('nh3', null, 'planted')).toBeNull();
	});
});
