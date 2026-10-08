import { describe, expect, it } from 'vitest';
import { parseTankForm } from './forms';

const prefs = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('parseTankForm: growing style and water (#81)', () => {
	it('keeps a planted tank’s growing style and water from Add tank', () => {
		const { errors, values } = parseTankForm(form({ name: 'Moss', type: 'planted', growingStyle: 'low_tech', waterSource: 'tap' }), prefs);
		expect(errors).toEqual({});
		expect(values).toMatchObject({ growingStyle: 'low_tech', waterSource: 'tap' });
	});

	it('drops a style on any other type, or one it doesn’t know', () => {
		expect(parseTankForm(form({ name: 'A', type: 'freshwater', growingStyle: 'co2' }), prefs).values.growingStyle).toBeNull();
		expect(parseTankForm(form({ name: 'A', type: 'planted', growingStyle: 'high_tech' }), prefs).values.growingStyle).toBeNull();
	});

	it('“Not sure” water is no water source; a form without the fields leaves them alone', () => {
		expect(parseTankForm(form({ name: 'A', type: 'planted', growingStyle: 'simple', waterSource: '' }), prefs).values.waterSource).toBeNull();
		const { values } = parseTankForm(form({ name: 'A', type: 'planted' }), prefs);
		expect(values).not.toHaveProperty('growingStyle');
		expect(values).not.toHaveProperty('waterSource');
	});
});
