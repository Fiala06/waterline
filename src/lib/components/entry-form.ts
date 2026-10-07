// What the log forms (TestForm, EventForm) share (#120): pure, so it's
// tested on its own (entry-form.test.ts) and written once.
import { exifToWhen, type ExifDate } from '$lib/exif';
import { todayInZone, type When } from '$lib/time';

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
export function splitTask(t: { label: string; sub?: string } | null | undefined): { main: string; next: string } | null {
	return t ? { main: t.label, next: t.sub ?? '' } : null;
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

/** "pH", "pH and KH", "pH, KH and GH" */
export function joinNames(xs: { name: string }[]): string {
	return xs.length <= 2 ? xs.map((x) => x.name).join(' and ') : `${xs.slice(0, -1).map((x) => x.name).join(', ')} and ${xs.at(-1)!.name}`;
}
