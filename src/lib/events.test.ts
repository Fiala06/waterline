import { describe, expect, it } from 'vitest';
import { eventIcon, eventTitle } from './events';

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
