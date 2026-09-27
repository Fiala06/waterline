import { describe, expect, it } from 'vitest';
import { defaultParameters } from './params';
import { paramTip } from './tips';

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
