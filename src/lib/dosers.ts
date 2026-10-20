// A doser's doses (#196): what a dosing pump puts in on its own, when, and
// whether one is due to be logged, so the equipment form, the Equipment tab
// and the scheduler agree. A dose is a product, an amount in mL, a time of
// day and the days it's made; Waterline logs each in History at its time.
import { amountText, parseWeekdays, WEEKDAYS, weekdayOf, weekdaysText } from './tasks';
import { addDays } from './time';

export interface DoseSpec {
	product: string;
	amountMl: number;
	/** "HH:MM" in the owner's time zone */
	at: string;
	/** how long the pump runs, when noted */
	seconds: number | null;
	/** "1,3,5" (0 Sunday … 6 Saturday); null or every day is every day */
	weekdays: string | null;
	paused: boolean;
}

/** Doses one doser can hold. */
export const MAX_DOSES = 8;
/** A pump runs this long at most, for the form. */
export const MAX_SECONDS = 3600;

/** The days a dose is made, or null for every day. */
export function doseDays(d: Pick<DoseSpec, 'weekdays'>): number[] | null {
	const days = parseWeekdays(d.weekdays);
	return days.length && days.length < 7 ? days : null;
}

/** Whether a dose is made on a day ('YYYY-MM-DD'). */
export const isDoseDay = (d: Pick<DoseSpec, 'weekdays'>, date: string) => {
	const days = doseDays(d);
	return !days || days.includes(weekdayOf(date));
};

/** "every day", "Mon, Wed, Fri" */
export const doseDaysText = (d: Pick<DoseSpec, 'weekdays'>) => weekdaysText(doseDays(d) ?? WEEKDAYS.map((w) => w.day));

/** "1 mL", "0.5 mL" */
export const doseAmountText = (ml: number) => amountText(ml, 'mL') ?? `${ml} mL`;

/** "Thrive+ 1 mL at 10:00 every day · runs 30 s", with "· paused" when it is. */
export function doseLabel(d: DoseSpec): string {
	return [`${d.product} ${doseAmountText(d.amountMl)} at ${d.at} ${doseDaysText(d)}`, d.seconds ? `runs ${d.seconds} s` : null, d.paused ? 'paused' : null]
		.filter(Boolean)
		.join(' · ');
}

/** Every dose in one line for History ("… ; …"), or "nothing" when there are none. */
export const dosesLabel = (list: DoseSpec[]) => (list.length ? list.map(doseLabel).join('; ') : 'nothing');

/** The wall clock where the owner is: the day and the time, as utcToZoned gives them. */
export interface LocalNow {
	date: string;
	time: string;
}

/**
 * Whether a dose is to be logged now: on one of its days, its time come, and
 * not logged yet today. The scheduler runs every few minutes, so a dose is
 * logged within minutes of its time, at its time; a day the server missed
 * entirely isn't made up (the doser dosed, but Waterline didn't see it).
 */
export function doseDue(d: DoseSpec & { lastLoggedOn: string | null }, local: LocalNow): boolean {
	return !d.paused && isDoseDay(d, local.date) && local.time >= d.at && (d.lastLoggedOn ?? '') < local.date;
}

/**
 * The last-logged day a dose starts with when it's made, its time changed or
 * it's resumed: today when its time has passed (so it's logged from the next
 * time, not for a dose the doser may not have made), else what it had.
 */
export function startFrom(d: Pick<DoseSpec, 'at'>, local: LocalNow, keep: string | null): string | null {
	if (local.time < d.at) return keep;
	return keep && keep > local.date ? keep : local.date;
}

/** "Next today at 10:00", "Next tomorrow at 10:00", "Next Wed at 10:00", or "Paused". */
export function nextDoseText(d: DoseSpec & { lastLoggedOn: string | null }, local: LocalNow): string {
	if (d.paused) return 'Paused';
	for (let k = 0; k <= 7; k++) {
		const date = addDays(local.date, k);
		if (!isDoseDay(d, date)) continue;
		if (k === 0 && (local.time >= d.at || d.lastLoggedOn === date)) continue;
		const day = k === 0 ? 'today' : k === 1 ? 'tomorrow' : WEEKDAYS.find((w) => w.day === weekdayOf(date))!.short;
		return `Next ${day} at ${d.at}`;
	}
	return 'No days picked';
}

/** The times of the doses that run, for the day timeline's ticks. */
export const doseMarks = (list: DoseSpec[]) => list.filter((d) => !d.paused).map((d) => d.at);
