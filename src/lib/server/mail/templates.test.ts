import { describe, expect, it } from 'vitest';
import { digestEmail, esc, outOfRangeEmail, taskEmail, testEmail } from './templates';

const footer = {
	reason: "You're getting this because task reminders are on.",
	settingsUrl: 'https://tanks.example.home/settings#notifications',
	unsubscribeUrl: 'https://tanks.example.home/unsubscribe/abc.def',
	host: 'tanks.example.home'
};

describe('email templates', () => {
	it('E1 task reminder', () => {
		const r = taskEmail({
			taskName: 'Water change 25%',
			tankName: 'Riverbed 40',
			when: 'Due tomorrow',
			overdue: false,
			dueDate: 'Fri, Sep 26',
			repeats: 'Every 7 days',
			doneUrl: 'https://x/e/done',
			snoozeUrl: 'https://x/e/snooze',
			dashboardUrl: 'https://x/',
			footer
		});
		expect(r.subject).toBe('Due tomorrow: Water change 25% · Riverbed 40');
		expect(r.preheader).toBe('Mark it done or snooze it right from this email.');
		expect(r.html).toContain('▲ Due tomorrow');
		expect(r.html).toContain('href="https://x/e/done"');
		expect(r.html).toContain('Unsubscribe from all');
		expect(r.text).toContain('Snooze 1 day: https://x/e/snooze');
	});

	it('E2 overdue alert', () => {
		const r = taskEmail({
			taskName: 'Water change 25%',
			tankName: 'Riverbed 40',
			when: 'Overdue by 2 days',
			overdue: true,
			dueDate: 'Tue, Sep 23',
			repeats: 'Every 7 days',
			lastDone: 'Sep 16 · 9 days ago',
			doneUrl: 'd',
			snoozeUrl: 's',
			dashboardUrl: 'h',
			footer
		});
		expect(r.subject).toBe('Overdue 2 days: Water change 25% · Riverbed 40');
		expect(r.preheader).toBe('It was due Tue, Sep 23. Mark it done or snooze it.');
		expect(r.html).toContain('Last done');
	});

	it('E3 digest', () => {
		const r = digestEmail({
			dateLabel: 'Thursday, September 25',
			weekly: false,
			tanks: [
				{
					name: 'Riverbed 40',
					sub: 'Planted · 40 gal',
					tasks: [{ name: 'Water change 25%', due: '✕ Overdue 1 day', level: 'bad', doneUrl: 'd' }],
					readings: [{ text: '✕ Nitrate 35 ppm', target: '5–20', date: 'Sep 25' }],
					noticed: [
						{ text: 'Nitrate is on course to pass 20 ppm in about 4 days.', warn: true },
						{ text: 'KH drifts down about 1 dKH a week between water changes (in 4 of your last 5).', warn: false }
					]
				},
				{ name: 'Reef 24', sub: 'Reef · 24 gal', tasks: [{ name: 'Top off ATO reservoir', due: '▲ Due today', level: 'warn', doneUrl: 'd2' }], readings: [] }
			],
			summary: { overdue: 1, due: 1, outOfRange: 1 },
			openUrl: 'https://x',
			sentLabel: 'Daily digest, sent at 7:00 AM Pacific.',
			footer: { ...footer, reason: '', settingsLabel: 'Switch to weekly or individual emails' }
		});
		expect(r.subject).toBe('Today: 1 overdue, 1 due, 1 reading out of range');
		expect(r.html).toContain('✓ All readings in range');
		expect(r.html).toContain('Switch to weekly or individual emails');
		// what stands out, with its mark: ▲ heading for a limit
		expect(r.html).toContain('Worth a look');
		expect(r.html).toContain('▲</span> Nitrate is on course to pass 20 ppm in about 4 days.');
		expect(r.text).toContain('Worth a look:\n- ▲ Nitrate is on course to pass 20 ppm in about 4 days.\n- KH drifts down about 1 dKH a week');
		// a tank with nothing to notice has no such section
		expect(r.html.match(/Worth a look/g)).toHaveLength(1);
	});

	it('E4 out-of-range alert', () => {
		const r = outOfRangeEmail({
			paramName: 'Nitrate',
			direction: 'high',
			tankName: 'Riverbed 40',
			value: '35',
			unit: 'ppm',
			target: '5–20',
			targetWithUnit: '5–20 ppm',
			previous: { value: '30', date: 'Sep 18' },
			logged: 'today at 8:12 AM',
			lastWaterChange: '8 days ago',
			dashboardUrl: 'https://x/?tank=1',
			footer
		});
		expect(r.subject).toBe('Nitrate is high in Riverbed 40: 35 ppm');
		expect(r.preheader).toBe('Your target is 5–20 ppm. Logged today at 8:12 AM.');
		expect(r.text).toContain('Last water change was 8 days ago.');
	});

	it('E5 test email', () => {
		const r = testEmail({ host: 'tanks.example.home', via: 'Mailgun (US) · mg.example.home', sent: 'Sep 25, 7:02 PM PDT', footer });
		expect(r.subject).toBe('Waterline test email: delivery works');
		expect(r.html).toContain('Mailgun (US) · mg.example.home');
	});

	it('escapes user text', () => {
		expect(esc('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
		const r = taskEmail({
			taskName: '<img src=x onerror=alert(1)>',
			tankName: 'T',
			when: 'Due today',
			overdue: false,
			dueDate: 'd',
			repeats: 'r',
			doneUrl: 'javascript:"x"',
			snoozeUrl: 's',
			dashboardUrl: 'h',
			footer
		});
		expect(r.html).not.toContain('<img src=x');
		expect(r.html).toContain('&lt;img src=x');
		expect(r.html).not.toContain('href="javascript:"x""');
	});
});
