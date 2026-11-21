import { describe, expect, it } from 'vitest';
import data from './plant-care.json';
import { careRows, plantCare, type PlantCare } from './plant-care';

// Plant care profiles (#84): found by scientific name, quiet for unknown
// plants, shown in the keeper's units, with the tank's own context.
const metric = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
const imperial = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
const row = (rows: ReturnType<typeof careRows>, label: string) => rows.find((r) => r.label === label)!;

describe('plant care profiles (#84)', () => {
	it('finds a plant by its scientific name, a cultivar or another name for it, and nothing for one it does not know', () => {
		expect(plantCare('Cryptocoryne wendtii')?.light).toBe('low');
		expect(plantCare("cryptocoryne wendtii 'Brown'")?.s).toBe('Cryptocoryne wendtii');
		expect(plantCare('Leptochilus pteropus')?.s).toBe('Microsorum pteropus');
		expect(plantCare('Vesicularia dubyana')?.s).toBe('Taxiphyllum barbieri');
		expect(plantCare('Plantus imaginarius')).toBeNull();
		expect(plantCare(null)).toBeNull();
	});

	it('says how warm in the keeper’s units, and how the tank compares, with icon and word', () => {
		const c = plantCare('Cryptocoryne wendtii')!; // 22–28 °C
		expect(row(careRows(c, metric, { tempC: 25, co2: false }), 'Temperature')).toEqual({ label: 'Temperature', value: '22–28 °C', context: '✓ Your tank: 25 °C' });
		expect(row(careRows(c, imperial, { tempC: 25, co2: false }), 'Temperature')).toMatchObject({ value: '72–82 °F', context: '✓ Your tank: 77 °F' });
		expect(row(careRows(c, metric, { tempC: 30, co2: false }), 'Temperature').context).toBe('▲ Your tank: 30 °C, warmer than this');
		expect(row(careRows(c, metric, { tempC: 18, co2: false }), 'Temperature').context).toBe('▲ Your tank: 18 °C, cooler than this');
		// on the line, or never read: no warning
		expect(row(careRows(c, metric, { tempC: 28.3, co2: false }), 'Temperature').context).toBe('✓ Your tank: 28 °C');
		expect(row(careRows(c, metric, { tempC: null, co2: false }), 'Temperature').context).toBeNull();
	});

	it('mentions CO₂ only for a plant that needs it, in a tank without it', () => {
		const cuba = plantCare('Hemianthus callitrichoides')!;
		expect(row(careRows(cuba, metric, { tempC: null, co2: false }), 'CO₂').context).toMatch(/^– Your tank has no injected CO₂/);
		expect(row(careRows(cuba, metric, { tempC: null, co2: true }), 'CO₂').context).toBeNull();
		expect(row(careRows(plantCare('Anubias barteri')!, metric, { tempC: null, co2: false }), 'CO₂')).toMatchObject({ value: 'Not needed', context: null });
	});

	it('keeps its data tidy: known values, sensible temperatures, one profile per name', () => {
		const names = new Set<string>();
		for (const p of data.plants as PlantCare[]) {
			expect(['low', 'medium', 'high'], p.s).toContain(p.light);
			expect(['optional', 'helps', 'needed'], p.s).toContain(p.co2);
			expect(['slow', 'medium', 'fast'], p.s).toContain(p.growth);
			for (const pl of p.place) expect(['foreground', 'midground', 'background', 'epiphyte', 'floating'], p.s).toContain(pl);
			expect(p.tempC[0], p.s).toBeLessThan(p.tempC[1]);
			expect(p.tempC[0], p.s).toBeGreaterThanOrEqual(10);
			expect(p.tempC[1], p.s).toBeLessThanOrEqual(32);
			for (const n of [p.s, ...(p.also ?? [])]) {
				expect(names.has(n.toLowerCase()), n).toBe(false);
				names.add(n.toLowerCase());
			}
		}
		expect(names.size).toBeGreaterThan(60);
	});
});
