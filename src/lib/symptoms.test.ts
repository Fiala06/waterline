import { describe, expect, it } from 'vitest';
import { ALGAE_CHECKS, PLANT_SYMPTOM_CHECKS, resolveChecks, type SymptomFacts } from './symptoms';
import { ALGAE_TYPES, PLANT_OBSERVATIONS } from './plants';

const facts: SymptomFacts = {
	tankId: 't1',
	params: {
		k: { id: 'pk', name: 'Potassium', latest: null },
		no3: { id: 'pn', name: 'Nitrate', latest: { value: '12 ppm', status: '✓ OK', when: '3 days ago' } }
	},
	lastDose: { title: 'Thrive · 5 mL', when: '2 days ago' },
	lightHours: 8,
	co2: null
};

describe('resolveChecks', () => {
	it('says what the records say, and says plainly when there is nothing', () => {
		const out = resolveChecks(PLANT_SYMPTOM_CHECKS.pinholes!.checks, facts);
		expect(out[0]).toEqual({ text: 'Potassium: no readings yet.', link: { label: 'Log a test ›', href: '/entries/test/new?tank=t1' } });
		expect(out[1].link).toBeNull();
		expect(out[2]).toEqual({ text: 'Last dose (a recent change in fertilizer): Thrive · 5 mL · 2 days ago.', link: { label: 'Dosing history ›', href: '/history?tank=t1&cat=dosing' } });
		expect(out[3].link?.href).toBe('/photos?tank=t1');
	});

	it('reads a reading, an untracked parameter, the light and CO₂', () => {
		const out = resolveChecks([{ param: 'no3' }, { param: 'po4' }, { light: true }, { co2: true }], facts);
		expect(out[0]).toEqual({ text: 'Nitrate: 12 ppm · ✓ OK · 3 days ago.', link: { label: 'Chart ›', href: '/charts?tank=t1&p=pn' } });
		expect(out[1].text).toBe('Phosphate: not tracked on this tank.');
		expect(out[2].text).toBe('Light: 8 h a day.');
		expect(out[3].text).toBe('CO₂: not set up in Tank setup, so it isn’t known.');
		expect(resolveChecks([{ light: true }, { co2: true }, { dosing: true }], { ...facts, lightHours: 'none', co2: false, lastDose: null }).map((c) => c.text)).toEqual([
			'Light: none on this tank.',
			'CO₂: none, on purpose.',
			'Dosing: no doses logged.'
		]);
		expect(resolveChecks([{ light: true }], { ...facts, lightHours: null })[0].text).toMatch(/no schedule set/);
	});

	it('has checks for every algae kind and every plant symptom that is one', () => {
		for (const a of ALGAE_TYPES) expect(ALGAE_CHECKS[a].checks.length, a).toBeGreaterThan(1);
		for (const o of PLANT_OBSERVATIONS) {
			const symptom = o.status === 'melting' || o.status === 'algae';
			expect(!!PLANT_SYMPTOM_CHECKS[o.value], o.value).toBe(symptom);
		}
	});
});
