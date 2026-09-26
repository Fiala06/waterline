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

export interface MailConfig {
	emailProvider: 'mailgun' | 'smtp' | null;
	mailgunApiKey: string | null;
	mailgunDomain: string | null;
	mailgunRegion: 'us' | 'eu';
	smtpHost: string | null;
	smtpPort: number | null;
	smtpSecure: boolean;
	smtpUser: string | null;
	smtpPassword: string | null;
	sender: string | null;
}

export function storedConfig(): MailConfig {
	const s = getServerSettings();
	return {
		emailProvider: s.emailProvider,
		mailgunApiKey: decrypt(s.mailgunApiKeyEnc),
		mailgunDomain: s.mailgunDomain,
		mailgunRegion: s.mailgunRegion,
		smtpHost: s.smtpHost,
		smtpPort: s.smtpPort,
		smtpSecure: s.smtpSecure,
		smtpUser: s.smtpUser,
		smtpPassword: decrypt(s.smtpPasswordEnc),
		sender: s.sender
	};
}

/** Build a transport from settings (saved or just typed into the admin form). */
export function transportFrom(c: MailConfig): { transport: Transport; from: string } | null {
	if (!c.sender) return null;
	const from = c.sender.includes('<') ? c.sender : `Waterline <${c.sender}>`;
	if (c.emailProvider === 'mailgun') {
		if (!c.mailgunApiKey || !c.mailgunDomain) return null;
		return { transport: mailgunTransport({ apiKey: c.mailgunApiKey, domain: c.mailgunDomain, region: c.mailgunRegion }), from };
	}
	if (c.emailProvider === 'smtp') {
		if (!c.smtpHost || !c.smtpPort) return null;
		return {
			transport: smtpTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpSecure, user: c.smtpUser, password: c.smtpPassword }),
			from
		};
	}
	return null;
}

export const outboxMode = () => env.EMAIL_TRANSPORT === 'outbox';

/** The configured transport and sender, or null when email isn't set up. */
export function getTransport(): { transport: Transport; from: string } | null {
	if (outboxMode()) return { transport: outboxTransport(), from: 'Waterline <waterline@localhost>' };
	return transportFrom(storedConfig());
}

export function emailConfigured() {
	return getTransport() !== null;
}

export async function sendMail(msg: MailMessage) {
	const t = getTransport();
	if (!t) throw new MailError("Email delivery isn't set up. An admin can add Mailgun or SMTP in Server settings.");
	await t.transport.send(t.from, msg);
	return t.transport.describe;
}
