// What the log forms (TestForm, EventForm) share (#120): pure, so it's
// tested on its own (forms.test.ts) and written once. Their frame is LogFormShell.
import { LOG_TYPES } from '$lib/events';
import { exifToWhen, type ExifDate } from '$lib/exif';
import { reminderSub, type ReminderTask } from '$lib/tasks';
import { todayInZone, type When } from '$lib/time';
import type { EventCategory } from '$lib/types';

/**
 * A photo taken on another day than the entry (#42): its date and time, to
 * offer, the first such photo's; null when all were taken that day (or have no date).
 */
export function photoOtherDay(dates: (ExifDate | null)[], when: When | null, timeZone: string): When | null {
	const day = when?.date ?? todayInZone(timeZone);
	for (const d of dates) {
		if (!d) continue;
		const w = exifToWhen(d, timeZone);
		if (w.date !== day) return w;
	}
	return null;
}

/** "Also mark the reminder “Water test” done", with where it stands on its own line. */
export function splitTask(
	t: { label: string; sub?: string; schedule?: ReminderTask; today?: string } | null | undefined,
	entryDate?: string | null
): { main: string; next: string } | null {
	if (!t) return null;
	// what the next one would be, from the entry's day as its When changes (#163)
	const next = t.schedule && t.today && entryDate ? reminderSub(t.schedule, entryDate, t.today) : t.sub;
	return { main: t.label, next: next ?? '' };
}

/** Another log type's form, keeping this one's tank and time (README § 11). */
export function entryHref(current: URLSearchParams, path: '/entries/test/new' | '/entries/event/new', category?: string): string {
	const q = new URLSearchParams();
	for (const k of ['tank', 'date', 'time']) {
		const v = current.get(k);
		if (v) q.set(k, v);
	}
	if (category) q.set('category', category);
	return `${path}?${q}`;
}

/** A chip in a log form's type row (README § 11); the one this form is has `on`. */
export type LogType = { label: string; href?: string; key?: string; on?: boolean };

/** The water test's type row: Test, then the three other quick types and More. */
export function testTypes(current: URLSearchParams): LogType[] {
	const to = (category: EventCategory) => entryHref(current, '/entries/event/new', category);
	return [
		{ label: 'Test', key: 'T', on: true },
		{ label: 'Water change', key: 'W', href: to('water_change') },
		{ label: 'Dose', key: 'D', href: to('dosing') },
		{ label: 'Note', key: 'N', href: to('note') },
		{ label: 'More', href: to('maintenance') }
	];
}

/** An event's type row: Test, then every kind of entry as an equal chip, this one on. */
export function eventTypes(current: URLSearchParams, category: EventCategory, categoryHref: (c: EventCategory) => string): LogType[] {
	return [
		{ label: 'Test', key: 'T', href: entryHref(current, '/entries/test/new') },
		...LOG_TYPES.map((t) => ({ label: t.label, key: t.key, href: categoryHref(t.category), on: category === t.category }))
	];
}

/**
 * How far the one-row type chips scroll so this one shows (it may be past the
 * edge, e.g. Equipment on a phone): just enough to bring its far side in, past the row's padding.
 */
export function chipScrollLeft(chipLeft: number, chipWidth: number, rowWidth: number, pad: number): number {
	return Math.max(0, Math.ceil(chipLeft + chipWidth + pad - rowWidth));
}

/** The banner over a log form whose unsaved draft came back (lib/draft): the test counts its readings. */
export function restoredText(readings = 0): string {
	return readings ? `Restored ${readings} unsaved reading${readings === 1 ? '' : 's'}` : "Restored what you hadn't saved";
}

/** "pH", "pH and KH", "pH, KH and GH" */
export function joinNames(xs: { name: string }[]): string {
	return xs.length <= 2 ? xs.map((x) => x.name).join(' and ') : `${xs.slice(0, -1).map((x) => x.name).join(', ')} and ${xs.at(-1)!.name}`;
}
