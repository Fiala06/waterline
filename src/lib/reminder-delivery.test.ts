import { describe, expect, it } from 'vitest';
import { clockText, reminderDelivery, type ReminderFacts } from './reminder-delivery';

const base: ReminderFacts = {
	due: '2026-11-28',
	kind: 'water_change',
	remindAt: null,
	today: '2026-11-21',
	leadDays: 1,
	sendTime: '08:00',
	lights: null,
	quiet: null,
	notified: true,
	email: { configured: true, to: 'keeper@example.com', unsubscribed: false, on: true, delivery: 'individual' },
	push: { on: true, devices: 0, ntfy: false },
	lastSent: null
};
const f = (o: Partial<ReminderFacts> = {}, email: Partial<ReminderFacts['email']> = {}, push: Partial<ReminderFacts['push']> = {}) => ({
	...base,
	...o,
	email: { ...base.email, ...email },
	push: { ...base.push, ...push }
});
const line = (d: ReturnType<typeof reminderDelivery>, key: 'email' | 'push') => d.channels.find((c) => c.key === key)!;

describe('how a reminder reaches the keeper (#310)', () => {
	it('goes by email a day ahead, at the send time', () => {
		const d = reminderDelivery(f());
		expect(d.day).toBe('Nov 27, 2026');
		expect(line(d, 'email')).toMatchObject({ level: 'ok', label: '✓ Email', detail: 'Nov 27, 2026 at 8:00 AM, to keeper@example.com.' });
		expect(line(d, 'push')).toMatchObject({ level: 'none', label: '– Push not set up' });
		expect(d.inAppOnly).toBe(false);
	});

	it('is in Waterline only with no email on the server and no push', () => {
		const d = reminderDelivery(f({}, { configured: false }));
		expect(line(d, 'email')).toMatchObject({ level: 'none', label: '– Email not available', detail: "This server isn't set up to send email." });
		expect(d.inAppOnly).toBe(true);
	});

	it('says why email is off', () => {
		expect(line(reminderDelivery(f({}, { on: false })), 'email').detail).toBe('Task reminders are turned off for email.');
		expect(line(reminderDelivery(f({}, { unsubscribed: true })), 'email').detail).toBe('You unsubscribed from Waterline emails.');
		expect(line(reminderDelivery(f({}, { to: null })), 'email').detail).toBe('There is no address to send it to.');
		expect(line(reminderDelivery(f({}, { delivery: 'daily' })), 'email').detail).toBe('In your daily summary at 8:00 AM, to keeper@example.com.');
	});

	it('pushes at the task’s own time, after quiet hours when it falls inside them', () => {
		const on = reminderDelivery(f({ remindAt: '21:30' }, { on: false }, { devices: 2, ntfy: true }));
		expect(line(on, 'push')).toMatchObject({ level: 'ok', label: '✓ Push', detail: 'Nov 27, 2026 at 9:30 PM, to 2 devices and ntfy.' });
		const quiet = reminderDelivery(f({ remindAt: '22:30', quiet: { start: '22:00', end: '07:00' } }, {}, { devices: 1 }));
		expect(line(quiet, 'push').detail).toBe('Nov 27, 2026 at 7:00 AM, after quiet hours, to 1 device.');
		expect(line(reminderDelivery(f({}, {}, { devices: 1, on: false })), 'push')).toMatchObject({ level: 'none', label: '– Push off' });
	});

	it('goes today when the lead has passed, and on the day for a routine', () => {
		expect(reminderDelivery(f({ due: '2026-11-21' })).day).toBe('Nov 21, 2026');
		expect(reminderDelivery(f({ kind: 'feeding' })).day).toBe('Nov 28, 2026');
		expect(reminderDelivery(f({ due: null })).day).toBeNull();
	});

	it("says a shared tank's owner gets them", () => {
		const d = reminderDelivery(f({ notified: false }));
		expect(d).toMatchObject({ ownerOnly: true, inAppOnly: true, channels: [] });
	});

	it('says it was sent, never that it arrived', () => {
		expect(reminderDelivery(f({ lastSent: { at: 'Nov 20, 8:00 AM', by: 'email', error: false } })).lastSent).toBe('Last sent Nov 20, 8:00 AM by email.');
		expect(reminderDelivery(f({ lastSent: { at: 'Nov 20, 8:00 AM', by: 'push', error: true } })).lastSent).toBe("✕ Last tried Nov 20, 8:00 AM by push, and it didn't go through.");
	});

	it('reads clock times', () => {
		expect(clockText('00:05')).toBe('12:05 AM');
		expect(clockText('12:00')).toBe('12:00 PM');
	});
});

describe('a task whose reminders are held (#323)', () => {
	it('promises no day or channel while paused, and says until when', () => {
		const d = reminderDelivery(
			f({ due: '2026-11-22', hold: { kind: 'paused', until: '2026-11-26', param: null }, lastSent: { at: '2026-11-01T08:00:00Z', by: 'email', error: false } }, {}, { devices: 1, ntfy: true })
		);
		expect(d.day).toBeNull();
		expect(d.channels).toEqual([]);
		expect(d.held).toBe('– Reminders paused until Nov 26, 2026. No email or push goes until then.');
		// what was sent before stays
		expect(d.lastSent).toBe('Last sent 2026-11-01T08:00:00Z by email.');
	});

	it('says a reading can end the pause sooner, and covers archived tanks and tasks with no next date', () => {
		expect(reminderDelivery(f({ hold: { kind: 'paused', until: '2026-12-01', param: 'Ammonia' } })).held).toBe(
			'– Reminders paused until Dec 1, 2026, or sooner once a test reads Ammonia in range. No email or push goes until then.'
		);
		expect(reminderDelivery(f({ hold: { kind: 'archived' } })).held).toMatch(/^– No reminders: this tank is archived/);
		expect(reminderDelivery(f({ due: null, hold: { kind: 'no-date' } })).held).toBe('– No reminder scheduled: this task has no next date.');
		expect(reminderDelivery(f()).held).toBeNull();
	});
});
