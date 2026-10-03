import { describe, expect, it } from 'vitest';
import {
	afterWaterChange,
	co2Ppm,
	co2Status,
	doseForPpm,
	heaterSize,
	phForCo2,
	ppmFromDose,
	remineralize,
	strengthMgPerMl,
	substrateAmount,
	tankVolume,
	waterChangeFraction
} from './calculators';

describe('tankVolume', () => {
	it('is length × width × height, less glass, substrate and the air gap', () => {
		expect(tankVolume({ lengthCm: 100, widthCm: 40, heightCm: 50 })).toEqual({ grossL: 200, waterL: 200 });
		expect(tankVolume({ lengthCm: 100, widthCm: 40, heightCm: 50, substrateCm: 5, gapCm: 3 })).toEqual({ grossL: 200, waterL: 168 });
		expect(tankVolume({ lengthCm: 100, widthCm: 40, heightCm: 50, glassCm: 1 })).toEqual({ grossL: 182.5, waterL: 182.5 });
	});
	it('is null for a size that is not one', () => {
		expect(tankVolume({ lengthCm: 0, widthCm: 40, heightCm: 50 })).toBeNull();
		expect(tankVolume({ lengthCm: 10, widthCm: 10, heightCm: 10, glassCm: 6 })).toBeNull();
		expect(tankVolume({ lengthCm: 100, widthCm: 40, heightCm: 10, substrateCm: 20 })?.waterL).toBe(0);
	});
});

describe('water change', () => {
	it('finds the share to change', () => {
		expect(waterChangeFraction(40, 20)).toBeCloseTo(0.5);
		expect(waterChangeFraction(40, 10)).toBeCloseTo(0.75);
		expect(waterChangeFraction(40, 20, 10)).toBeCloseTo(2 / 3);
	});
	it('says when a change cannot get there', () => {
		expect(waterChangeFraction(20, 40)).toBeNull();
		expect(waterChangeFraction(20, 20)).toBeNull();
		expect(waterChangeFraction(40, 5, 10)).toBeNull();
		expect(waterChangeFraction(0, 0)).toBeNull();
	});
	it('works forwards too', () => {
		expect(afterWaterChange(40, 0.5)).toBe(20);
		expect(afterWaterChange(40, 0.25, 10)).toBe(32.5);
		expect(afterWaterChange(40, 2)).toBe(0);
	});
});

describe('dose → ppm', () => {
	it('reads a bottle’s strength and works a dose both ways', () => {
		// "5 mL per 50 L raises nitrate by 1 ppm" → 10 mg/mL
		expect(strengthMgPerMl(5, 50, 1)).toBe(10);
		expect(ppmFromDose(10, 10, 200)).toBe(0.5);
		expect(doseForPpm(5, 10, 200)).toBe(100);
		expect(doseForPpm(0, 10, 200)).toBe(0);
	});
	it('is null without a strength or a volume', () => {
		expect(strengthMgPerMl(0, 50, 1)).toBeNull();
		expect(ppmFromDose(10, 0, 200)).toBeNull();
		expect(doseForPpm(5, 10, 0)).toBeNull();
	});
});

describe('heaterSize', () => {
	it('sizes by volume and the lift above the room, rounded up to a common size', () => {
		expect(heaterSize(100, 20, 26)).toEqual({ watts: 96, buy: '100 W', perL: 0.96 });
		expect(heaterSize(200, 18, 26)).toEqual({ watts: 256, buy: '300 W', perL: 1.28 });
		expect(heaterSize(500, 18, 26)).toEqual({ watts: 640, buy: '2 × 300 W', perL: 1.28 });
		expect(heaterSize(400, 16, 26)?.buy).toBe('2 × 300 W');
	});
	it('needs no heater when the room is warm enough', () => {
		expect(heaterSize(100, 26, 24)).toEqual({ watts: 0, buy: 'No heater needed', perL: 0 });
		expect(heaterSize(0, 20, 26)).toBeNull();
	});
});

describe('substrateAmount', () => {
	it('averages a slope and weighs the kind picked', () => {
		expect(substrateAmount(100, 40, 4, 8, 'gravel')).toEqual({ litres: 24, kg: 38.4 });
		expect(substrateAmount(100, 40, 5, 5, 'sand')).toEqual({ litres: 20, kg: 30 });
		expect(substrateAmount(60, 30, 5, 5, 'aquasoil')).toEqual({ litres: 9, kg: 6.8 });
	});
	it('is null for nothing', () => {
		expect(substrateAmount(100, 40, 0, 0, 'gravel')).toBeNull();
		expect(substrateAmount(0, 40, 5, 5, 'gravel')).toBeNull();
	});
});

describe('CO₂ from pH and KH', () => {
	it('follows 3 × KH × 10^(7 − pH)', () => {
		expect(co2Ppm(7, 4)).toBe(12);
		expect(co2Ppm(6.6, 4)).toBe(30.1);
		expect(co2Ppm(6, 1)).toBe(30);
		expect(co2Ppm(7, 0)).toBeNull();
	});
	it('gives the pH to aim for', () => {
		expect(phForCo2(30, 4)).toBe(6.6);
		expect(phForCo2(30, 1)).toBe(6);
	});
	it('reads the level in words', () => {
		expect(co2Status(5).text).toMatch(/^▲ Low/);
		expect(co2Status(25).text).toMatch(/^✓ In range/);
		expect(co2Status(40).text).toMatch(/^✕ High/);
	});
});

describe('remineralize', () => {
	it('is about 0.3 g of baking soda per dKH per 10 L, and 0.23 g gypsum + 0.11 g Epsom salt per dGH per 10 L', () => {
		const r = remineralize(10, 1, 1)!;
		expect(r.bakingSodaG).toBeCloseTo(0.3, 1);
		expect(r.potassiumBicarbonateG).toBeCloseTo(0.36, 1);
		expect(r.gypsumG).toBeCloseTo(0.23, 1);
		expect(r.epsomSaltG).toBeCloseTo(0.11, 1);
	});
	it('scales with the volume and each rise, and allows one of them to be 0', () => {
		const r = remineralize(100, 4, 0)!;
		expect(r.bakingSodaG).toBeCloseTo(12, 0);
		expect(r.gypsumG).toBe(0);
		expect(remineralize(100, 0, 0)).toBeNull();
		expect(remineralize(0, 4, 6)).toBeNull();
	});
});
