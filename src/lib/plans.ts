// Treatment plans (#177): starters for a regimen that runs for a while, a step
// at a time. Each is a starting point, edited before it starts, never advice
// to follow to the letter: the sources disagree, and the tank decides.
import { addDays, fmtDate } from './time';
import type { TaskKind } from './types';

export interface PlanStep {
	name: string;
	kind: Extract<TaskKind, 'water_change' | 'maintenance' | 'other' | 'test'>;
	/** day of the plan it starts and ends on, from 1 */
	from: number;
	to: number;
	/** every so many days between them */
	every: number;
}

export interface PlanTemplate {
	key: string;
	name: string;
	/** what it's for and how it goes, in a sentence or two */
	lead: string;
	steps: PlanStep[];
	/** the tank's routines held back for its first days (a blackout: no ferts, no feeding) */
	pause: { kinds: TaskKind[]; days: number } | null;
	/** where the shape comes from */
	source: string;
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
	{
		key: 'blackout',
		name: 'Blackout',
		lead: 'Four days dark with ferts and feeding held back, a big water change after, then a short photoperiod for two weeks. For green water, hair algae and cyano; little use against black beard or staghorn.',
		steps: [
			{ name: 'Blackout: keep the tank covered and the light off', kind: 'other', from: 1, to: 4, every: 1 },
			{ name: 'Water change 50% after the blackout', kind: 'water_change', from: 5, to: 5, every: 1 },
			{ name: 'Light back on, 5 hours a day', kind: 'other', from: 5, to: 5, every: 1 },
			{ name: 'Back to the usual photoperiod', kind: 'other', from: 19, to: 19, every: 1 }
		],
		pause: { kinds: ['dosing', 'feeding'], days: 4 },
		source: 'Aquasabi and Green Aqua blackout guides'
	},
	{
		key: 'spot',
		name: 'Spot treatment',
		lead: 'Two weeks of daily spot treatment on the algae, with a water change every few days to clear what dies back.',
		steps: [
			{ name: 'Spot-treat the algae (liquid carbon or 3% H₂O₂, flow off 10 minutes)', kind: 'maintenance', from: 1, to: 14, every: 1 },
			{ name: 'Water change 30%', kind: 'water_change', from: 2, to: 14, every: 3 }
		],
		pause: null,
		source: 'Green Aqua and aquascaping guides on spot treatment'
	},
	{
		key: 'carbon',
		name: 'Liquid carbon course',
		lead: 'Three weeks of liquid carbon every day against black beard and staghorn, with the weekly water change. Keep within the label: shrimp and some plants (vallisneria, mosses) take it badly.',
		steps: [
			{ name: 'Dose liquid carbon', kind: 'other', from: 1, to: 21, every: 1 },
			{ name: 'Water change 50%', kind: 'water_change', from: 7, to: 21, every: 7 }
		],
		pause: null,
		source: 'Seachem Excel directions and planted-tank forums'
	},
	{
		key: 'medication',
		name: 'Medication course',
		lead: 'A course as most labels lay it out: carbon out, a dose a day for five days, a water change on the sixth, carbon back after. Follow your medication’s own label where it differs.',
		steps: [
			{ name: 'Take the carbon out of the filter', kind: 'maintenance', from: 1, to: 1, every: 1 },
			{ name: 'Dose the medication as the label says', kind: 'other', from: 1, to: 5, every: 1 },
			{ name: 'Water change 25%', kind: 'water_change', from: 6, to: 6, every: 1 },
			{ name: 'Put the carbon back', kind: 'maintenance', from: 7, to: 7, every: 1 }
		],
		pause: null,
		source: 'Fritz Maracyn and API label directions'
	},
	{
		key: 'newtank',
		name: 'New planted tank',
		lead: 'Big water changes often while a new tank settles: every other day for two weeks, twice a week for two more, then weekly to the end of the second month.',
		steps: [
			{ name: 'Water change 50%', kind: 'water_change', from: 1, to: 14, every: 2 },
			{ name: 'Water change 50%', kind: 'water_change', from: 17, to: 28, every: 4 },
			{ name: 'Water change 50%', kind: 'water_change', from: 35, to: 56, every: 7 }
		],
		pause: null,
		source: 'Aquarium Gardens and planted-tank startup guides'
	}
];

export const planTemplate = (key: string | null | undefined) => PLAN_TEMPLATES.find((t) => t.key === key) ?? null;

/** How many days a plan runs: to its last step's last day. */
export const planDays = (steps: Pick<PlanStep, 'to'>[]) => Math.max(1, ...steps.map((s) => s.to));

/** A step's first and last day from a start, and how many times it comes up. */
export function stepDates(step: Pick<PlanStep, 'from' | 'to' | 'every'>, startedOn: string) {
	const first = addDays(startedOn, step.from - 1);
	const times = Math.floor((step.to - step.from) / Math.max(1, step.every)) + 1;
	const last = addDays(first, (times - 1) * Math.max(1, step.every));
	return { first, last, times };
}

/** "Oct 16 – Oct 19 · every day · 4 times", "Oct 20" */
export function stepText(step: Pick<PlanStep, 'from' | 'to' | 'every'>, startedOn: string): string {
	const { first, last, times } = stepDates(step, startedOn);
	if (times === 1) return fmtDate(first);
	const every = step.every === 1 ? 'every day' : `every ${step.every} days`;
	return `${fmtDate(first)} – ${fmtDate(last)} · ${every} · ${times} times`;
}

/** Whether steps from a form make sense: days from 1, in order, within a year. */
export function validStep(s: Pick<PlanStep, 'name' | 'from' | 'to' | 'every'>): boolean {
	return !!s.name.trim() && [s.from, s.to, s.every].every((n) => Number.isInteger(n)) && s.from >= 1 && s.to >= s.from && s.to <= 365 && s.every >= 1 && s.every <= 60;
}
