// Email templates E1–E5. Hand-built tables with inline styles so they render in
// every client; 600px single column, light theme (email dark mode is uneven).

const C = {
	page: '#eef3f2',
	card: '#ffffff',
	border: '#d5e0df',
	divider: '#e1e9e8',
	text: '#0f2126',
	muted: '#4f666b',
	accent: '#1a7a7a',
	secondaryBorder: '#bccccb',
	ok: '#1d7a47',
	warn: '#8a6300',
	bad: '#b8412c'
};
const FONT = `'Helvetica Neue',Helvetica,Arial,sans-serif`;

export type Level = 'ok' | 'warn' | 'bad';
const levelColor = (l: Level) => (l === 'bad' ? C.bad : l === 'warn' ? C.warn : C.ok);

export function esc(s: unknown): string {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface Footer {
	reason: string; // "You're getting this because task reminders are on."
	settingsUrl: string;
	unsubscribeUrl: string;
	host: string;
	/** Digest footer offers switching delivery instead of settings */
	settingsLabel?: string;
}

export interface Rendered {
	subject: string;
	preheader: string;
	html: string;
	text: string;
}

// Mark 2c as text: images are often blocked, and self-hosted servers may not be reachable from mail clients.
const logo = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 8px 0 4px;vertical-align:middle;font:22px/1 ${FONT};color:${C.accent}">&#9682;</td>
<td style="font:600 17px ${FONT};color:${C.text};vertical-align:middle">Waterline</td></tr></table>`;

function layout(opts: { preheader: string; body: string; footer: Footer }): string {
	const f = opts.footer;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>Waterline</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${esc(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 20px">${logo}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px 28px;font:15px/1.5 ${FONT};color:${C.text}">
${opts.body}
</td></tr>
<tr><td style="padding:20px 4px 0;font:12px/1.6 ${FONT};color:${C.muted}">
${f.reason ? `${esc(f.reason)}<br>` : ''}
<a href="${esc(f.settingsUrl)}" style="color:${C.accent}">${esc(f.settingsLabel ?? 'Notification settings')}</a> · <a href="${esc(f.unsubscribeUrl)}" style="color:${C.accent}">Unsubscribe from all</a><br>
Waterline · ${esc(f.host)}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

const status = (text: string, level: Level) =>
	`<div style="font:700 14px ${FONT};color:${levelColor(level)};margin:0 0 8px">${esc(text)}</div>`;
const title = (text: string) =>
	`<div style="font:600 28px/1.2 ${FONT};letter-spacing:-0.01em;color:${C.text};margin:0 0 20px">${esc(text)}</div>`;

function rows(items: [string, string][]) {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.divider};border-bottom:1px solid ${C.divider};margin:0 0 20px">
${items
	.map(
		([k, v], i) => `<tr>
<td style="padding:12px 0;font:15px ${FONT};color:${C.muted};${i ? `border-top:1px solid ${C.divider};` : ''}">${esc(k)}</td>
<td align="right" style="padding:12px 0;font:600 15px ${FONT};color:${C.text};${i ? `border-top:1px solid ${C.divider};` : ''}">${esc(v)}</td></tr>`
	)
	.join('')}
</table>`;
}

function button(label: string, url: string, primary = true) {
	return `<a href="${esc(url)}" style="display:inline-block;padding:14px 24px;border-radius:10px;font:${primary ? 700 : 600} 16px ${FONT};text-decoration:none;${
		primary ? `background:${C.accent};color:#ffffff;border:1px solid ${C.accent}` : `background:#ffffff;color:${C.text};border:1px solid ${C.secondaryBorder}`
	}">${esc(label)}</a>`;
}
const buttons = (...b: string[]) => `<div style="margin:0 0 16px">${b.join('&nbsp;&nbsp;')}</div>`;
const note = (html: string) => `<div style="font:14px/1.5 ${FONT};color:${C.muted}">${html}</div>`;
const link = (label: string, url: string) => `<a href="${esc(url)}" style="color:${C.accent};font-weight:600">${esc(label)}</a>`;

function textFooter(f: Footer) {
	return `\n\n—\n${f.reason ? `${f.reason}\n` : ''}${f.settingsLabel ?? 'Notification settings'}: ${f.settingsUrl}\nUnsubscribe from all: ${f.unsubscribeUrl}\nWaterline · ${f.host}`;
}

// ── E1 / E2 · task reminder and overdue alert ───────────────────────────────

export interface TaskEmail {
	taskName: string;
	tankName: string;
	/** "Due tomorrow", "Due today", "Due in 3 days", or "Overdue by 2 days" */
	when: string;
	overdue: boolean;
	dueDate: string; // "Fri, Sep 26"
	repeats: string; // "Every 7 days" | "One-off"
	lastDone?: string | null; // "Sep 16 · 9 days ago"
	doneUrl: string;
	/** the setup review (#30) isn't marked done from an email: its button opens the review page */
	review?: boolean;
	snoozeUrl: string;
	dashboardUrl: string;
	footer: Footer;
}

export function taskEmail(e: TaskEmail): Rendered {
	const done = e.review ? 'Review' : 'Mark done';
	const subject = `${e.overdue ? e.when.replace(/^Overdue by /, 'Overdue ') : e.when}: ${e.taskName} · ${e.tankName}`;
	const preheader = e.review
		? 'Check the tank’s settings are still right, or snooze it.'
		: e.overdue
			? `It was due ${e.dueDate}. Mark it done or snooze it.`
			: 'Mark it done or snooze it right from this email.';
	const details: [string, string][] = [
		['Tank', e.tankName],
		[e.overdue ? 'Was due' : 'Due', e.dueDate]
	];
	if (e.overdue && e.lastDone) details.push(['Last done', e.lastDone]);
	else details.push(['Repeats', e.repeats]);
	const body =
		status(`${e.overdue ? '✕' : '▲'} ${e.when}`, e.overdue ? 'bad' : 'warn') +
		title(e.taskName) +
		rows(details) +
		buttons(button(done, e.doneUrl), button('Snooze 1 day', e.snoozeUrl, false)) +
		note(`${e.review ? 'Snoozing needs no sign-in.' : 'No sign-in needed.'} ${link('Open dashboard', e.dashboardUrl)}`);
	return {
		subject,
		preheader,
		html: layout({ preheader, body, footer: e.footer }),
		text:
			`${e.overdue ? '✕' : '▲'} ${e.when}\n${e.taskName}\n\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n` +
			`${done}: ${e.doneUrl}\nSnooze 1 day: ${e.snoozeUrl}\nOpen dashboard: ${e.dashboardUrl}` +
			textFooter(e.footer)
	};
}

// ── E3 · daily / weekly digest ──────────────────────────────────────────────

export interface DigestTank {
	name: string;
	sub: string; // "Planted · 40 gal"
	/** review: the setup review (#30), whose button opens its page */
	tasks: { name: string; due: string; level: Level; doneUrl: string; review?: boolean }[];
	readings: { text: string; target: string; date: string }[]; // out of range
	/** what stands out in its readings (Spotting trends), ▲ when heading for a limit */
	noticed?: { text: string; warn: boolean }[];
}

export interface DigestEmail {
	dateLabel: string; // "Thursday, September 25"
	weekly: boolean;
	tanks: DigestTank[];
	summary: { overdue: number; due: number; outOfRange: number };
	openUrl: string;
	sentLabel: string; // "Daily digest, sent at 7:00 AM Pacific."
	footer: Footer;
}

export function digestEmail(e: DigestEmail): Rendered {
	const parts: string[] = [];
	if (e.summary.overdue) parts.push(`${e.summary.overdue} overdue`);
	if (e.summary.due) parts.push(`${e.summary.due} due`);
	if (e.summary.outOfRange) parts.push(`${e.summary.outOfRange} reading${e.summary.outOfRange === 1 ? '' : 's'} out of range`);
	const subject = `${e.weekly ? 'This week' : 'Today'}: ${parts.join(', ') || 'all clear'}`;
	const first = e.tanks.find((t) => t.tasks.length || t.readings.length);
	const preheader = first
		? `${first.name}${first.tasks[0] ? ` needs: ${first.tasks[0].name.toLowerCase()}` : ''}${first.readings[0] ? `${first.tasks[0] ? ';' : ':'} ${first.readings[0].text.replace(/^✕ /, '').toLowerCase()}` : ''}.`
		: 'Nothing due and every reading is in range.';

	const tankHtml = e.tanks
		.map((t) => {
			const taskRows = t.tasks
				.map(
					(k) => `<tr><td style="padding:10px 0;border-top:1px solid ${C.divider}">
<div style="font:600 15px ${FONT};color:${C.text}">${esc(k.name)}</div>
<div style="font:600 13px ${FONT};color:${levelColor(k.level)}">${esc(k.due)}</div></td>
<td align="right" style="padding:10px 0;border-top:1px solid ${C.divider}"><a href="${esc(k.doneUrl)}" style="display:inline-block;padding:8px 14px;border-radius:8px;border:1px solid ${C.secondaryBorder};font:600 14px ${FONT};color:${C.text};text-decoration:none">${k.review ? 'Review' : 'Mark done'}</a></td></tr>`
				)
				.join('');
			const readingRows = t.readings.length
				? t.readings
						.map(
							(r) => `<tr><td colspan="2" style="padding:10px 0;border-top:1px solid ${C.divider};font:14px ${FONT};color:${C.muted}">
<span style="color:${C.bad};font-weight:700">${esc(r.text)}</span> · target ${esc(r.target)} <span style="float:right">${esc(r.date)}</span></td></tr>`
						)
						.join('')
				: `<tr><td colspan="2" style="padding:10px 0;border-top:1px solid ${C.divider};font:600 14px ${FONT};color:${C.ok}">✓ All readings in range</td></tr>`;
			const noticedRows = t.noticed?.length
				? `<tr><td colspan="2" style="padding:10px 0 2px;border-top:1px solid ${C.divider};font:600 13px ${FONT};color:${C.muted}">Worth a look</td></tr>` +
					t.noticed
						.map(
							(n) =>
								`<tr><td colspan="2" style="padding:4px 0;font:14px ${FONT};color:${C.text}"><span style="color:${n.warn ? C.warn : C.muted};font-weight:700">${n.warn ? '▲' : '•'}</span> ${esc(n.text)}</td></tr>`
						)
						.join('')
				: '';
			return `<div style="margin:0 0 24px">
<div style="font:600 17px ${FONT};color:${C.text}">${esc(t.name)}</div>
<div style="font:13px ${FONT};color:${C.muted};margin:0 0 6px">${esc(t.sub)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${taskRows}${readingRows}${noticedRows}</table></div>`;
		})
		.join('');

	const body =
		`<div style="font:13px ${FONT};color:${C.muted};margin:0 0 4px">${esc(e.dateLabel)}</div>` +
		title(e.weekly ? 'Your tanks this week' : 'Your tanks today') +
		tankHtml +
		buttons(button('Open Waterline', e.openUrl)) +
		note(esc(e.sentLabel));

	const text =
		`${e.dateLabel}\n${e.weekly ? 'Your tanks this week' : 'Your tanks today'}\n\n` +
		e.tanks
			.map(
				(t) =>
					`${t.name} (${t.sub})\n` +
					t.tasks.map((k) => `- ${k.name}: ${k.due} — ${k.review ? 'review' : 'mark done'}: ${k.doneUrl}`).join('\n') +
					(t.tasks.length ? '\n' : '') +
					(t.readings.length ? t.readings.map((r) => `- ${r.text} (target ${r.target}, ${r.date})`).join('\n') : '- ✓ All readings in range') +
					(t.noticed?.length ? `\nWorth a look:\n${t.noticed.map((n) => `- ${n.warn ? '▲ ' : ''}${n.text}`).join('\n')}` : '')
			)
			.join('\n\n') +
		`\n\nOpen Waterline: ${e.openUrl}\n${e.sentLabel}` +
		textFooter(e.footer);

	return { subject, preheader, html: layout({ preheader, body, footer: e.footer }), text };
}

// ── E4 · out-of-range alert ─────────────────────────────────────────────────

export interface OutOfRangeEmail {
	paramName: string;
	direction: 'high' | 'low';
	tankName: string;
	value: string;
	unit: string;
	target: string; // "5–20"
	targetWithUnit: string; // "5–20 ppm"
	previous?: { value: string; date: string } | null;
	logged: string; // "today at 8:12 AM"
	lastWaterChange?: string | null; // "8 days ago"
	dashboardUrl: string;
	footer: Footer;
	more?: string[]; // other out-of-range readings in the same test
}

export function outOfRangeEmail(e: OutOfRangeEmail): Rendered {
	const headline = `${e.paramName} is ${e.direction} in ${e.tankName}`;
	const subject = `${headline}: ${e.value}${e.unit ? ' ' + e.unit : ''}`;
	const preheader = `Your target is ${e.targetWithUnit}. Logged ${e.logged}.`;
	const cell = (label: string, value: string, sub = '', color = C.text) =>
		`<td width="33%" style="padding:12px;border:1px solid ${C.divider};border-radius:10px;vertical-align:top">
<div style="font:13px ${FONT};color:${C.muted}">${esc(label)}</div>
<div style="font:600 22px ${FONT};color:${color}">${esc(value)}${sub ? ` <span style="font:13px ${FONT};color:${C.muted}">${esc(sub)}</span>` : ''}</div></td>`;
	const body =
		status('✕ Out of range', 'bad') +
		title(headline) +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 16px"><tr>
${cell('Reading', e.value, e.unit, C.bad)}${cell('Target', e.target)}${e.previous ? cell('Previous', e.previous.value, e.previous.date) : ''}</tr></table>` +
		(e.more?.length ? note(`Also out of range: ${e.more.map(esc).join(', ')}.`) + '<div style="height:12px"></div>' : '') +
		note(`Logged ${esc(e.logged)}.${e.lastWaterChange ? ` Last water change was ${esc(e.lastWaterChange)}.` : ''}`) +
		'<div style="height:16px"></div>' +
		buttons(button('View tank dashboard', e.dashboardUrl));
	return {
		subject,
		preheader,
		html: layout({ preheader, body, footer: e.footer }),
		text:
			`✕ Out of range\n${headline}\n\nReading: ${e.value} ${e.unit}\nTarget: ${e.targetWithUnit}\n` +
			(e.previous ? `Previous: ${e.previous.value} (${e.previous.date})\n` : '') +
			(e.more?.length ? `Also out of range: ${e.more.join(', ')}\n` : '') +
			`Logged ${e.logged}.${e.lastWaterChange ? ` Last water change was ${e.lastWaterChange}.` : ''}\n\nView tank dashboard: ${e.dashboardUrl}` +
			textFooter(e.footer)
	};
}

// ── E5 · test email ─────────────────────────────────────────────────────────

export function testEmail(e: { host: string; via: string; sent: string; footer: Footer }): Rendered {
	const subject = 'Waterline test email: delivery works';
	const preheader = 'If you can read this, reminders will reach you.';
	const mono = (k: string, v: string) =>
		`<tr><td style="padding:2px 12px 2px 0;font:13px ui-monospace,Menlo,monospace;color:${C.muted}">${esc(k)}</td><td style="font:13px ui-monospace,Menlo,monospace;color:${C.text}">${esc(v)}</td></tr>`;
	const body =
		status('✓ Delivery works', 'ok') +
		title('Your server can send email') +
		`<p style="margin:0 0 20px;font:15px/1.5 ${FONT}">Task reminders, alerts and digests will arrive at this address.</p>` +
		`<table role="presentation" cellpadding="0" cellspacing="0" style="background:${C.page};border-radius:10px;padding:12px;margin:0 0 8px;width:100%"><tr><td style="padding:12px"><table role="presentation" cellpadding="0" cellspacing="0">${mono('server', e.host)}${mono('via', e.via)}${mono('sent', e.sent)}</table></td></tr></table>`;
	return {
		subject,
		preheader,
		html: layout({ preheader, body, footer: e.footer }),
		text: `✓ Delivery works\nYour server can send email.\n\nserver  ${e.host}\nvia     ${e.via}\nsent    ${e.sent}` + textFooter(e.footer)
	};
}
