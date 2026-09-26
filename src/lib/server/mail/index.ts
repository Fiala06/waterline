// One interface for sending mail, whichever provider the admin picked.
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '../db';
import { serverSettings } from '../db/schema';
import { decrypt } from '../secrets';
import { mailgunTransport } from './mailgun';
import { outboxTransport } from './outbox';
import { smtpTransport } from './smtp';
import { MailError, type MailMessage, type Transport } from './types';

export { MailError, type MailMessage };

export function getServerSettings() {
	return (
		db.select().from(serverSettings).where(eq(serverSettings.id, 1)).get() ??
		db.insert(serverSettings).values({ id: 1 }).returning().get()
	);
}

/** The configured transport and sender, or null when email isn't set up. */
export function getTransport(): { transport: Transport; from: string } | null {
	if (env.EMAIL_TRANSPORT === 'outbox') return { transport: outboxTransport(), from: 'Waterline <waterline@localhost>' };
	const s = getServerSettings();
	if (!s.sender) return null;
	const from = s.sender.includes('<') ? s.sender : `Waterline <${s.sender}>`;
	if (s.emailProvider === 'mailgun') {
		const apiKey = decrypt(s.mailgunApiKeyEnc);
		if (!apiKey || !s.mailgunDomain) return null;
		return { transport: mailgunTransport({ apiKey, domain: s.mailgunDomain, region: s.mailgunRegion }), from };
	}
	if (s.emailProvider === 'smtp') {
		if (!s.smtpHost || !s.smtpPort) return null;
		return {
			transport: smtpTransport({
				host: s.smtpHost,
				port: s.smtpPort,
				secure: s.smtpSecure,
				user: s.smtpUser,
				password: decrypt(s.smtpPasswordEnc)
			}),
			from
		};
	}
	return null;
}

export function emailConfigured() {
	return getTransport() !== null;
}

export async function sendMail(msg: MailMessage) {
	const t = getTransport();
	if (!t) throw new MailError('Email delivery isn’t set up. An admin can add Mailgun or SMTP in Server settings.');
	await t.transport.send(t.from, msg);
	return t.transport.describe;
}
