import { describe, expect, it } from 'vitest';
import { defaultParameters } from './params';
import { guidance, nextStep, paramTip, whenToTest } from './tips';

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

describe('whenToTest (#91)', () => {
	it('says when to test every parameter of every tank type', () => {
		for (const type of ['freshwater', 'planted', 'brackish', 'reef'] as const) {
			for (const p of defaultParameters(prefs, type)) expect(whenToTest(p.key, type)?.text, `${type} ${p.key}`).toBeTruthy();
		}
	});

	it('marks the optional ones as optional, in words and in kind', () => {
		for (const type of ['freshwater', 'planted', 'brackish', 'reef'] as const) {
			for (const p of defaultParameters(prefs, type)) {
				const w = whenToTest(p.key, type)!;
				expect(/^Optional/.test(w.text), `${type} ${p.key}: "${w.text}"`).toBe(w.optional);
			}
		}
		expect(whenToTest('fe', 'planted')?.optional).toBe(true);
		expect(whenToTest('kh', 'freshwater')?.optional).toBe(true);
		expect(whenToTest('no3', 'freshwater')?.optional).toBe(false);
		expect(whenToTest('nh3', 'reef')?.optional).toBe(false);
	});

	it('reads by tank type, and has nothing to say about a custom parameter', () => {
		expect(whenToTest('kh', 'reef')?.text).toMatch(/alkalinity/);
		expect(whenToTest('kh', 'planted')?.text).toMatch(/CO₂/);
		expect(whenToTest('kh', 'planted')?.optional).toBe(true);
		expect(whenToTest('po4', 'planted')?.optional).toBe(false);
		expect(whenToTest('po4', 'freshwater')?.optional).toBe(true);
		expect(whenToTest('custom:silicate', 'freshwater')).toBeNull();
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

describe('guidance (#90)', () => {
	const ctx = (over: Partial<Parameters<typeof guidance>[2]> = {}) => ({ tankId: 't1', tankType: 'planted', waterSource: null, co2: null, shrimp: false, ...over });

	it('fills in the water change calculator for what a water change brings down', () => {
		const g = guidance('no3', 'high', ctx())!;
		expect(g.text).toMatch(/bigger water change/);
		expect(g.link).toEqual({ label: 'Work out the water change ›', href: '/calculators?tank=t1&param=no3#water-change' });
		expect(guidance('po4', 'high', ctx())!.link?.href).toContain('param=po4#water-change');
		// not for ammonia: the target is 0, and the step is the same anyway
		expect(guidance('nh3', 'high', ctx())!.link).toBeNull();
	});

	it('knows the tank is on RO water', () => {
		const kh = guidance('kh', 'low', ctx({ waterSource: 'rodi' }))!;
		expect(kh.text).toMatch(/^Your new water is RO: add a little more KH remineralizer/);
		expect(kh.text).not.toMatch(/CO₂/);
		expect(kh.link).toEqual({ label: 'GH / KH for RO water ›', href: '/calculators?tank=t1#remineralize' });
		expect(guidance('kh', 'low', ctx({ waterSource: 'mix', co2: true }))!.text).toMatch(/With CO₂ injected, KH also decides/);
		expect(guidance('gh', 'high', ctx({ waterSource: 'rodi' }))!.text).toMatch(/Add less GH remineralizer/);
		expect(guidance('tds', 'high', ctx({ waterSource: 'rodi' }))!.link?.href).toContain('#remineralize');
		// tap water: check it first, no chemistry by default
		expect(guidance('kh', 'low', ctx({ waterSource: 'tap' }))!.text).toMatch(/^Your tap water usually brings some KH/);
		expect(guidance('gh', 'low', ctx({ waterSource: 'well' }))!.text).toMatch(/^Check what your well water reads/);
		// nothing known: the generic step
		expect(guidance('kh', 'low', ctx())!.text).toBe(nextStep('kh', 'low', 'planted'));
		// a reef's alkalinity keeps its own wording
		expect(guidance('kh', 'low', ctx({ tankType: 'reef', waterSource: 'rodi' }))!.text).toMatch(/alkalinity dose/);
	});

	it('asks for slow changes when shrimp live in the tank', () => {
		expect(guidance('gh', 'low', ctx({ shrimp: true }))!.text).toMatch(/Shrimp mind sudden changes most/);
		expect(guidance('gh', 'low', ctx({ shrimp: false }))!.text).not.toMatch(/Shrimp/);
	});

	it('reads CO₂ and pH by whether CO₂ is injected', () => {
		expect(guidance('co2', 'low', ctx({ co2: false }))!.text).toMatch(/no CO₂ injection, so a low reading is normal/);
		expect(guidance('co2', 'low', ctx({ co2: false }))!.link).toBeNull();
		expect(guidance('co2', 'low', ctx({ co2: true }))).toEqual({ text: nextStep('co2', 'low', 'planted'), link: { label: 'Estimate CO₂ from pH and KH ›', href: '/calculators?tank=t1#co2' } });
		expect(guidance('co2', 'high', ctx())!.link?.href).toContain('#co2');
		expect(guidance('ph', 'low', ctx({ co2: true }))!.text).toMatch(/^With CO₂ injected, pH drops while it runs/);
		expect(guidance('ph', 'high', ctx({ co2: true }))!.text).toMatch(/after the CO₂ goes off/);
		expect(guidance('ph', 'low', ctx({ co2: false }))!.text).toBe(nextStep('ph', 'low', 'planted'));
		expect(guidance('ph', 'low', ctx({ tankType: 'reef', co2: true }))!.text).toMatch(/stuffy room/);
	});

	it('has nothing for custom parameters or no direction', () => {
		expect(guidance('custom:x', 'high', ctx())).toBeNull();
		expect(guidance('no3', null, ctx())).toBeNull();
	});
});
