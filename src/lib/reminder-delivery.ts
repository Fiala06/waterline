// How a task's next reminder will reach the keeper (#310): when it goes, and
// on which channels, from their settings as they are. A saved schedule isn't
// a delivered reminder, so this says what Waterline will try, never that it
// arrived. Pure: the server gathers the facts (reminderFacts in
// $lib/server/reminder-delivery.ts), the page shows the lines.
import { addDays, fmtDateLong } from './time';
import { pushTime, remindTime, type Quiet, type RemindAt } from './remind-time';
import { isRoutine } from './tasks';

export interface ReminderFacts {
	/** the task's next date (snoozed included); null when it has none */
	due: string | null;
	kind: string;
	remindAt: RemindAt;
	today: string;
	/** email and push go this many days ahead (a routine on the day) */
	leadDays: number;
	sendTime: string;
	lights: { on: string; off: string } | null;
	quiet: Quiet | null;
	/** a shared tank whose owner keeps its reminders to themself */
	notified: boolean;
	email: {
		/** the server can send email */
		configured: boolean;
		/** where it goes; null without a usable address */
		to: string | null;
		unsubscribed: boolean;
		/** Task reminders is on */
		on: boolean;
		delivery: 'individual' | 'daily' | 'weekly';
	};
	push: {
		/** Task reminders is on for push */
		on: boolean;
		devices: number;
		ntfy: boolean;
	};
	/** the last time this task's reminder was sent: when, and how */
	lastSent: { at: string; by: 'email' | 'push'; error: boolean } | null;
	/** why no reminder goes for now (#323), by the scheduler's own rules; null when one does */
	hold?: Hold | null;
}

/** Why the scheduler sends no reminder for a task (#323). */
export type Hold =
	| { kind: 'paused'; until: string; param: string | null }
	| { kind: 'archived' }
	| { kind: 'no-date' };

export type Level = 'ok' | 'none';
export interface Channel {
	key: 'email' | 'push';
	level: Level;
	/** "✓ Email" or "– Email off": icon and word, never color alone */
	label: string;
	detail: string;
	/** where to change it */
	href: string;
}

export interface ReminderDelivery {
	/** "Fri, Nov 28": the day the reminder goes; null without a next date */
	day: string | null;
	channels: Channel[];
	/** nothing leaves Waterline: it shows under Tasks and on the dashboard */
	inAppOnly: boolean;
	/** the shared tank's owner gets them instead */
	ownerOnly: boolean;
	lastSent: string | null;
	/** "– Reminders paused until …": nothing is sent for now, so no day or channel is promised (#323) */
	held: string | null;
}

/** "8:00 AM" for "08:00" */
export function clockText(t: string): string {
	const [h, m] = t.split(':').map(Number);
	return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The line for a task whose reminders are held (#323). */
export function holdText(h: Hold): string {
	if (h.kind === 'archived') return '– No reminders: this tank is archived. Restore it to get them again.';
	if (h.kind === 'no-date') return '– No reminder scheduled: this task has no next date.';
	const sooner = h.param ? `, or sooner once a test reads ${h.param} in range` : '';
	return `– Reminders paused until ${fmtDateLong(h.until)}${sooner}. No email or push goes until then.`;
}

export function reminderDelivery(f: ReminderFacts, fmtSent: (iso: string) => string = (iso) => iso): ReminderDelivery {
	const sent = f.lastSent;
	// sent is not received: Waterline can say it went, never that it arrived
	const lastSent = sent ? (sent.error ? `✕ Last tried ${fmtSent(sent.at)} by ${sent.by}, and it didn't go through.` : `Last sent ${fmtSent(sent.at)} by ${sent.by}.`) : null;
	if (f.hold) return { day: null, channels: [], inAppOnly: true, ownerOnly: false, lastSent, held: holdText(f.hold) };
	const lead = isRoutine(f.kind) ? 0 : f.leadDays;
	// the day it goes: its lead ahead of the due date, or today when that's passed
	let on: string | null = f.due ? addDays(f.due, -lead) : null;
	if (on && on < f.today) on = f.today;
	const day = on ? fmtDateLong(on) : null;
	const settings = '/settings#notifications';
	const channels: Channel[] = [];

	const e = f.email;
	if (!e.configured) channels.push({ key: 'email', level: 'none', label: '– Email not available', detail: "This server isn't set up to send email.", href: settings });
	else if (e.unsubscribed) channels.push({ key: 'email', level: 'none', label: '– Email off', detail: 'You unsubscribed from Waterline emails.', href: settings });
	else if (!e.to) channels.push({ key: 'email', level: 'none', label: '– Email off', detail: 'There is no address to send it to.', href: settings });
	else if (!e.on) channels.push({ key: 'email', level: 'none', label: '– Email off', detail: 'Task reminders are turned off for email.', href: settings });
	else {
		const at = clockText(f.sendTime);
		const detail =
			e.delivery === 'daily'
				? `In your daily summary at ${at}, to ${e.to}.`
				: e.delivery === 'weekly'
					? `In your weekly summary on Mondays at ${at}, to ${e.to}.`
					: `${day ? `${day} at ${at}` : `At ${at}`}, to ${e.to}.`;
		channels.push({ key: 'email', level: 'ok', label: '✓ Email', detail, href: settings });
	}

	const p = f.push;
	const targets = [p.devices ? plural(p.devices, 'device') : '', p.ntfy ? 'ntfy' : ''].filter(Boolean).join(' and ');
	if (!targets) channels.push({ key: 'push', level: 'none', label: '– Push not set up', detail: 'No device or ntfy topic gets notifications yet.', href: '/settings#push' });
	else if (!p.on) channels.push({ key: 'push', level: 'none', label: '– Push off', detail: 'Task reminders are turned off for push.', href: settings });
	else {
		const set = remindTime(f.remindAt, f.sendTime, f.lights);
		const goes = pushTime(set, f.quiet);
		const at = `${clockText(goes)}${goes !== set ? ', after quiet hours' : ''}`;
		channels.push({ key: 'push', level: 'ok', label: '✓ Push', detail: `${day ? `${day} at ${at}` : `At ${at}`}, to ${targets}.`, href: '/settings#push' });
	}

	return {
		day,
		channels: f.notified ? channels : [],
		ownerOnly: !f.notified,
		inAppOnly: !f.notified || channels.every((c) => c.level === 'none'),
		lastSent,
		held: null
	};
}
