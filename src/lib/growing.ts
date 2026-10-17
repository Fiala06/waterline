// A planted tank's growing setup (#96, #97): the light, CO₂, fertilizer and
// substrate it runs on, as rows for the dashboard and Tank setup, each leading
// to where it's changed. Only what's set is a row.
import { hoursText, periodsText, type Schedule } from './equipment';
import { daysBetween, fmtDate } from './time';

export interface GrowingDosing {
	id: string;
	title: string;
	product: string | null;
	amount: number | null;
	amountUnit: string | null;
	/** YYYY-MM-DD */
	nextDue: string;
	/** "every 3 days", "Mon, Wed, Fri" */
	interval: string;
}

export interface GrowingInput {
	tankId: string;
	lights: { schedule: Schedule; hours: number | null; itemId: string | null } | null;
	co2: { schedule: Schedule; hours: number | null; itemId: string | null } | null;
	substrate: string | null;
	dosing: GrowingDosing[];
	/** YYYY-MM-DD in the keeper's time zone */
	today: string;
}

export interface GrowingRow {
	key: 'light' | 'co2' | 'fertilizer' | 'substrate';
	title: string;
	text: string;
	href: string;
}

const mins = (s: string) => {
	const m = /^(\d{2}):(\d{2})$/.exec(s);
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const span = (m: number) => {
	const a = Math.abs(m);
	if (a % 60 === 0) return `${a / 60} h`;
	return a >= 60 ? `${Math.floor(a / 60)} h ${a % 60} min` : `${a} min`;
};

/**
 * How the CO₂ runs against the lights, the way planted keepers time it:
 * "on 1 h before the lights · off 1 h before the lights", "with the lights";
 * null when either has more than one period a day.
 */
export function co2RelativeText(lights: Schedule, co2: Schedule): string | null {
	if (lights.periods.length !== 1 || co2.periods.length !== 1) return null;
	const l = lights.periods[0];
	const c = co2.periods[0];
	const on = mins(c.on)! - mins(l.on)!;
	const off = mins(c.off)! - mins(l.off)!;
	if (on === 0 && off === 0) return 'with the lights';
	const part = (m: number, what: string) => (m === 0 ? `${what} with the lights` : `${what} ${span(m)} ${m < 0 ? 'before' : 'after'} the lights`);
	return `${part(on, 'on')} · ${part(off, 'off')}`;
}

/** "Thrive 5 mL", or the routine's title when it names no product */
export function doseText(d: Pick<GrowingDosing, 'title' | 'product' | 'amount' | 'amountUnit'>): string {
	if (!d.product) return d.title;
	const amount = d.amount != null ? ` ${d.amount}${d.amountUnit ? ` ${d.amountUnit}` : ''}` : '';
	return `${d.product}${amount}`;
}

/** "due today", "tomorrow", "Thu", "Oct 20", "✕ overdue 2 days" */
export function nextDoseText(nextDue: string, today: string): string {
	const days = daysBetween(today, nextDue);
	if (days < 0) return `✕ overdue ${-days} day${days === -1 ? '' : 's'}`;
	if (days === 0) return 'due today';
	if (days === 1) return 'tomorrow';
	if (days < 7) return new Date(`${nextDue}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
	return fmtDate(nextDue);
}

/** The rows for a planted tank, in the order a keeper thinks about them: light, CO₂, fertilizer, substrate. */
export function growingRows(i: GrowingInput): GrowingRow[] {
	const base = `/tanks/${i.tankId}`;
	const rows: GrowingRow[] = [];
	if (i.lights) {
		rows.push({
			key: 'light',
			title: 'Light',
			text: [i.lights.hours != null && `${hoursText(i.lights.hours)}/day`, periodsText(i.lights.schedule)].filter(Boolean).join(' · '),
			href: i.lights.itemId ? `${base}/equipment/${i.lights.itemId}` : `${base}/settings#lights`
		});
	}
	if (i.co2) {
		const rel = i.lights ? co2RelativeText(i.lights.schedule, i.co2.schedule) : null;
		rows.push({
			key: 'co2',
			title: 'CO₂',
			text: [periodsText(i.co2.schedule), rel].filter(Boolean).join(' · '),
			href: i.co2.itemId ? `${base}/equipment/${i.co2.itemId}` : `${base}/settings#co2`
		});
	}
	for (const d of i.dosing.slice(0, 3)) {
		rows.push({ key: 'fertilizer', title: 'Fertilizer', text: [doseText(d), d.interval, nextDoseText(d.nextDue, i.today)].filter(Boolean).join(' · '), href: `/tasks/${d.id}` });
	}
	if (i.substrate) rows.push({ key: 'substrate', title: 'Substrate', text: i.substrate, href: `${base}/settings#substrate` });
	return rows;
}
