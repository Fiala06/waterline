// A bit of fun on the dashboard when things are going well: a streak of
// ammonia and nitrite at zero, and milestones (the tank's birthdays, a pet's
// anniversaries, round numbers of water tests). Shown only while nothing
// needs attention; each milestone for a few days, so it isn't missed.
import { addDays, daysBetween } from './time';

/** days a milestone stays on the dashboard, from its day */
export const MILESTONE_DAYS = 3;
/** tests in a row, at least, for the streak note */
export const MIN_STREAK = 3;

export interface Milestone {
	key: string;
	text: string;
}

/**
 * Tests in a row, newest first, with ammonia and nitrite both at 0. A test
 * without both is passed over; any other value ends the streak.
 */
export function zeroStreak(tests: { nh3?: number | null; no2?: number | null }[]): number {
	let n = 0;
	for (const t of tests) {
		const has = [t.nh3, t.no2].filter((v): v is number => v != null);
		if (has.some((v) => v !== 0)) break;
		if (has.length === 2) n++;
	}
	return n;
}

export const streakText = (n: number) => `Ammonia and nitrite at 0 for ${n} tests. The bacteria are clocking in.`;

const years = (n: number) => (n === 1 ? 'a year' : `${n} years`);

/** "Betta Tank turns 100 days 🎉" (day 100, 200, 300, 500, 1000) or "turns 1 year 🎉", for a few days from the day. */
export function tankMilestone(name: string, startDate: string | null, today: string): Milestone | null {
	if (!startDate || startDate > today) return null;
	const day = daysBetween(startDate, today) + 1;
	for (let back = 0; back < MILESTONE_DAYS; back++) {
		const d = day - back;
		if (d < 1) break;
		// a birthday: the same date, a year or more on
		const on = addDays(today, -back);
		const y = Number(on.slice(0, 4)) - Number(startDate.slice(0, 4));
		if (y >= 1 && on.slice(4) === startDate.slice(4)) {
			return { key: `tank-y${y}`, text: `${name} turns ${y === 1 ? '1 year' : `${y} years`} 🎉` };
		}
		if ([100, 200, 300, 500, 1000].includes(d)) return { key: `tank-d${d}`, text: `${name} turns ${d} days 🎉` };
	}
	return null;
}

/** "Darwin has lived with you a year": a named pet, on the anniversary of the day it was added, for a few days. */
export function petAnniversaries(pets: { name: string; added: string | null }[], today: string): Milestone[] {
	const out: Milestone[] = [];
	for (const p of pets) {
		if (!p.added || p.added >= today) continue;
		for (let back = 0; back < MILESTONE_DAYS; back++) {
			const day = addDays(today, -back);
			const y = Number(day.slice(0, 4)) - Number(p.added.slice(0, 4));
			if (y >= 1 && day.slice(4) === p.added.slice(4)) {
				out.push({ key: `pet-${p.name}-${y}`, text: `${p.name} has lived with you ${years(y)} 🎂` });
				break;
			}
		}
	}
	return out;
}

const ROUND_TESTS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const ordinal = (n: number) => {
	const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
	return `${n}${s}`;
};

/** "Your 50th water test.": when the tank's latest test was a round number, a few days ago at most. */
export function testMilestone(count: number, latestDay: string | null, today: string): Milestone | null {
	if (!latestDay || !ROUND_TESTS.includes(count) || daysBetween(latestDay, today) >= MILESTONE_DAYS) return null;
	return { key: `tests-${count}`, text: `Your ${ordinal(count)} water test. 🧪` };
}
