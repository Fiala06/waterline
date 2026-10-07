import { describe, expect, it } from 'vitest';
import { checklistSteps, showChecklist, type ChecklistFacts } from './checklist';

const fresh: ChecklistFacts = {
	tankId: 't1',
	type: 'planted',
	cycling: false,
	createdAt: new Date().toISOString(),
	state: null,
	tests: 0,
	livestock: 0,
	plants: 0,
	photos: 0,
	lights: false,
	waterChangeTaskId: 'task1'
};

describe('getting-started checklist (#82)', () => {
	it('starts with the tank made and its water-change reminder, the rest to do', () => {
		const steps = checklistSteps(fresh);
		expect(steps.map((s) => s.key)).toEqual(['created', 'test', 'livestock', 'plants', 'lights', 'water', 'photo']);
		expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(['created', 'water']);
		expect(steps.find((s) => s.key === 'water')?.href).toBe('/tasks/task1');
	});

	it('ticks steps off from the tank, and leaves plants out of a tank that is not planted', () => {
		const steps = checklistSteps({ ...fresh, type: 'reef', tests: 2, livestock: 3, photos: 1, lights: true });
		expect(steps.map((s) => s.key)).not.toContain('plants');
		expect(steps.filter((s) => !s.done).map((s) => s.key)).toEqual([]);
	});

	it('talks a cycling tank through the cycle', () => {
		const steps = checklistSteps({ ...fresh, cycling: true });
		expect(steps.find((s) => s.key === 'test')?.detail).toMatch(/Ammonia, nitrite and nitrate/);
		expect(steps.find((s) => s.key === 'livestock')?.detail).toMatch(/both read 0/);
	});

	it('shows for a new tank, not a settled or old one, and does as it was told', () => {
		const now = Date.parse('2026-10-07T12:00:00Z');
		const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
		expect(showChecklist({ state: null, createdAt: ago(1), tests: 0 }, now)).toBe(true);
		expect(showChecklist({ state: null, createdAt: ago(59), tests: 9 }, now)).toBe(true);
		expect(showChecklist({ state: null, createdAt: ago(61), tests: 0 }, now)).toBe(false);
		expect(showChecklist({ state: null, createdAt: ago(1), tests: 10 }, now)).toBe(false);
		expect(showChecklist({ state: 'hidden', createdAt: ago(1), tests: 0 }, now)).toBe(false);
		expect(showChecklist({ state: 'shown', createdAt: ago(400), tests: 300 }, now)).toBe(true);
	});
});
