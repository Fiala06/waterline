import { describe, expect, it } from 'vitest';
import { additivesOf, eventIcon, eventTitle } from './events';

describe('eventIcon', () => {
	it('shows a plant for plant changes, which are logged as livestock', () => {
		expect(eventIcon({ category: 'livestock', note: null, data: { action: 'added', kind: 'plant', name: 'Java fern' } })).toBe('plant');
		expect(eventIcon({ category: 'livestock', note: null, data: { action: 'added', name: 'Neon tetra', count: 12 } })).toBe('livestock');
	});

	it('uses the category for everything else', () => {
		expect(eventIcon({ category: 'water_change', note: null, data: { percent: 25 } })).toBe('water_change');
		expect(eventIcon({ category: 'maintenance', note: null, data: { actions: ['Trimmed plants'], plants: ['Java fern'] } })).toBe('maintenance');
	});
});

describe('pets in History', () => {
	const prefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
	const title = (data: Record<string, unknown>) => eventTitle({ category: 'livestock', note: null, data }, prefs);

	it('says a pet by name', () => {
		expect(title({ action: 'named', name: 'Corydoras', nickname: 'Pepper', previous: null })).toBe('Named Pepper · Corydoras');
		expect(title({ action: 'named', name: 'Corydoras', nickname: 'Salt', previous: 'Pepper' })).toBe('Renamed Pepper to Salt · Corydoras');
		expect(title({ action: 'named', name: 'Corydoras', nickname: null, previous: 'Salt' })).toBe('Removed the name Salt · Corydoras');
		expect(title({ action: 'status', name: 'Betta', nickname: 'Captain', status: 'in_tank', count: 1 })).toBe('Captain moved into the tank');
		expect(title({ action: 'removed', name: 'Betta', nickname: 'Captain', reason: 'loss', count: 1 })).toBe('Removed Captain · Betta · loss');
	});

	it('says the species when the name is left out, as on public pages', () => {
		expect(title({ action: 'status', name: 'Betta', nickname: null, status: 'in_tank', count: 1 })).toBe('Betta moved into the tank');
		expect(title({ action: 'removed', name: 'Betta', nickname: null, reason: 'loss', count: 1 })).toBe('−1 Betta · loss');
	});
});

describe('feeding and water change titles', () => {
	const prefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;

	it('says what was fed, the amount first', () => {
		expect(eventTitle({ category: 'feeding', note: null, data: { food: 'flakes', amount: 2, unit: 'pinches' } }, prefs)).toBe('Fed 2 pinches of flakes');
		expect(eventTitle({ category: 'feeding', note: null, data: { food: 'flakes', amount: 1, unit: 'pinches' } }, prefs)).toBe('Fed 1 pinch of flakes');
		expect(eventTitle({ category: 'feeding', note: null, data: { food: 'Micro pellets' } }, prefs)).toBe('Fed Micro pellets');
		expect(eventTitle({ category: 'feeding', note: null, data: { food: 'Algae wafer', amount: 1 } }, prefs)).toBe('Fed Algae wafer · 1');
	});

	it('lists what went into a water change', () => {
		const data = { percent: 25, source: 'tap', additives: [{ product: 'Prime', amount: 2.5, unit: 'mL' }, { product: 'GH+', amount: null, unit: null }] };
		expect(eventTitle({ category: 'water_change', note: null, data }, prefs)).toBe('Water change · 25% · Tap · Prime 2.5 mL · GH+');
		expect(additivesOf({ additives: [{ product: '', amount: 1 }, 'junk', { product: 'Prime', amount: '3', unit: 'mL' }] })).toEqual([
			{ product: 'Prime', amount: null, unit: 'mL' }
		]);
		expect(additivesOf({})).toEqual([]);
	});
});

describe('equipment adjustments in History', () => {
	const prefs = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
	const title = (data: Record<string, unknown>) => eventTitle({ category: 'equipment', note: null, data }, prefs);

	it('says what changed, up to two settings, else how many', () => {
		expect(title({ action: 'adjusted', item: 'Twinstar 300S V', changes: { intensity: [60, 80] } })).toBe('Adjusted Twinstar 300S V · Intensity 60% → 80%');
		expect(title({ action: 'adjusted', item: 'Lumora Pro 90', changes: { photoperiodH: [8.5, 8], intensity: [100, 80] } })).toBe('Adjusted Lumora Pro 90 · Photoperiod 8.5 h → 8 h, Intensity 100% → 80%');
		expect(title({ action: 'adjusted', item: 'Lumora Pro 90', changes: { photoperiodH: [8.5, 8], intensity: [100, 80], spectrum: [null, 'Full'] } })).toBe('Adjusted Lumora Pro 90 · 3 settings');
		expect(title({ action: 'adjusted', item: 'Lumora Pro 90', changes: {} })).toBe('Adjusted Lumora Pro 90');
		expect(title({ action: 'adjusted', item: 'Lumora Pro 90' })).toBe('Adjusted Lumora Pro 90');
		expect(title({ action: 'replaced', item: 'Tidewell C-400', changes: { media: ['Sponge', 'Ceramic'] } })).toBe('Replaced Tidewell C-400');
	});
});
