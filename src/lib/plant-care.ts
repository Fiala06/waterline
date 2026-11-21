// Plant care profiles (#84): Waterline's own short, cautious notes for common
// aquarium plants (plant-care.json, licensed like the code), matched by
// scientific name. General guidance to start from, never a rule: plants vary
// with light, water and nutrients. A plant that isn't listed has no profile.
// The tank context compares what the tank already knows (its latest
// temperature, whether it has injected CO₂) and stays quiet otherwise.
import data from './plant-care.json';
import { formatNumber, toDisplay, unitLabel, type UnitPrefs } from './units';

export type Light = 'low' | 'medium' | 'high';
export type Co2 = 'optional' | 'helps' | 'needed';
export type Growth = 'slow' | 'medium' | 'fast';
export interface PlantCare {
	s: string;
	light: Light;
	co2: Co2;
	growth: Growth;
	place: string[];
	propagate: string;
	/** feeds through its roots: a rich substrate or root tabs help */
	roots: boolean;
	tempC: [number, number];
	note?: string;
	/** other scientific names it goes by */
	also?: string[];
}

const key = (s: string) => s.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
const byName = new Map<string, PlantCare>();
for (const p of data.plants as PlantCare[]) for (const n of [p.s, ...(p.also ?? [])]) byName.set(key(n), p);

/** The profile for a plant, by its scientific name ("Cryptocoryne wendtii 'Brown'" finds C. wendtii); null when none. */
export function plantCare(scientific: string | null | undefined): PlantCare | null {
	return scientific ? (byName.get(key(scientific)) ?? null) : null;
}

const LIGHT: Record<Light, string> = { low: 'Low light is enough', medium: 'Medium light', high: 'Strong light' };
const CO2: Record<Co2, string> = { optional: 'Not needed', helps: 'Grows better with it', needed: 'Needed for good growth' };
const GROWTH: Record<Growth, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
const PLACE: Record<string, string> = { foreground: 'Foreground', midground: 'Midground', background: 'Background', epiphyte: 'On wood or rock', floating: 'Floating' };

export interface TankFacts {
	/** the tank's latest temperature, in °C, if it's been read */
	tempC: number | null;
	/** the tank injects CO₂ (grown that way, or a CO₂ item on its equipment) */
	co2: boolean;
}

/** The profile as rows, in the keeper's units, with the tank's own context where it has one. */
export function careRows(c: PlantCare, prefs: UnitPrefs, tank: TankFacts) {
	const t = (v: number) => formatNumber(toDisplay(v, 'temp', prefs), 0);
	const unit = unitLabel('temp', prefs);
	let tempContext: string | null = null;
	if (tank.tempC != null) {
		const now = `${t(tank.tempC)} ${unit}`;
		// icon and word, never color alone; a degree's leeway either side, so a reading on the line isn't flagged
		tempContext =
			tank.tempC < c.tempC[0] - 0.5 ? `▲ Your tank: ${now}, cooler than this` : tank.tempC > c.tempC[1] + 0.5 ? `▲ Your tank: ${now}, warmer than this` : `✓ Your tank: ${now}`;
	}
	const co2Context = c.co2 === 'needed' && !tank.co2 ? '– Your tank has no injected CO₂: expect slow growth or paler colour' : null;
	return [
		{ label: 'Light', value: LIGHT[c.light], context: null },
		{ label: 'CO₂', value: CO2[c.co2], context: co2Context },
		{ label: 'Growth', value: GROWTH[c.growth], context: null },
		{ label: 'Placement', value: c.place.map((p) => PLACE[p] ?? p).join(', '), context: null },
		{ label: 'Propagation', value: c.propagate, context: null },
		{ label: 'Feeding', value: c.roots ? 'Through its roots: a rich substrate or root tabs help' : 'Mostly from the water', context: null },
		{ label: 'Temperature', value: `${t(c.tempC[0])}–${t(c.tempC[1])} ${unit}`, context: tempContext }
	];
}
