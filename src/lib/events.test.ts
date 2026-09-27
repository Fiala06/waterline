import { describe, expect, it } from 'vitest';
import { eventIcon } from './events';

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
