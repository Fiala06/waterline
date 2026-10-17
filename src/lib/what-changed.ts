// "What changed?" (#89): the facts around a parameter's latest meaningful
// move, without saying why. The stretch is the run of readings up to the
// latest one that kept moving the same way; what was logged in that stretch
// is listed in date order. Wording says these happened in the same time, not
// that they caused it; sparse data gets no summary rather than a guess.
import { fmtValue, paramUnit, type ParamLike } from './params';
import type { UnitPrefs } from './units';

export interface ChangedEvent {
	id: string;
	/** when it happened, ms */
	t: number;
	/** "Water change · 40% · Tap" */
	title: string;
}

export interface WhatChanged {
	/** "Nitrate fell from 18 → 7 ppm over 12 days." */
	headline: string;
	direction: 'up' | 'down';
	/** the stretch, ms */
	from: number;
	to: number;
	days: number;
	/** what was logged in the stretch, oldest first */
	events: ChangedEvent[];
}

const DAY = 86_400_000;
/** A move older than this isn't "what changed" any more. */
export const MAX_DAYS = 60;

/**
 * The latest move worth a word, or null: fewer than two readings, a move too
 * small to matter (under a tenth of the target span, or 15% of the reading
 * without a full target, and always at least one shown decimal), or one that
 * took longer than MAX_DAYS.
 */
export function whatChanged(
	p: ParamLike,
	readings: { t: number; value: number }[],
	events: ChangedEvent[],
	prefs: UnitPrefs
): WhatChanged | null {
	if (readings.length < 2) return null;
	const pts = [...readings].sort((a, b) => a.t - b.t);
	const end = pts[pts.length - 1];
	// walk back while the readings kept moving the same way (flat steps ride along)
	let i = pts.length - 2;
	const sign = Math.sign(end.value - pts[i].value);
	if (!sign) return null;
	while (i > 0 && Math.sign(pts[i].value - pts[i - 1].value) !== -sign) i--;
	const start = pts[i];
	const delta = end.value - start.value;
	const span = p.min != null && p.max != null && p.max > p.min ? p.max - p.min : null;
	const minMove = span != null ? span / 10 : Math.abs(start.value) * 0.15;
	// as shown: a move that reads the same number isn't one
	const shownFrom = fmtValue(p, start.value, prefs);
	const shownTo = fmtValue(p, end.value, prefs);
	if (Math.abs(delta) < minMove || shownFrom === shownTo) return null;
	const days = Math.max(1, Math.round((end.t - start.t) / DAY));
	if (days > MAX_DAYS) return null;
	const unit = paramUnit(p, prefs);
	const direction = delta > 0 ? 'up' : 'down';
	// unit once, after both numbers, as the chart's readout writes it
	const over = days === 1 ? 'in a day' : `over ${days} days`;
	const verb = direction === 'up' ? 'rose' : 'fell';
	return {
		headline: `${p.name} ${verb} from ${shownFrom} → ${shownTo}${unit ? ` ${unit}` : ''} ${over}.`,
		direction,
		from: start.t,
		to: end.t,
		days,
		events: events.filter((e) => e.t >= start.t && e.t <= end.t).sort((a, b) => a.t - b.t)
	};
}

/** The caveat under the list: these happened in the same stretch; that's all the summary says. */
export const WHAT_CHANGED_NOTE = 'Logged in the same stretch; the summary doesn’t say which, if any, moved the reading.';
