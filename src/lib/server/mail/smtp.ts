import nodemailer from 'nodemailer';
import { MailError, type MailMessage, type Transport } from './types';

export function smtpTransport(opts: {
	host: string;
	port: number;
	secure: boolean;
	user: string | null;
	password: string | null;
}): Transport {
	const transporter = nodemailer.createTransport({
		host: opts.host,
		port: opts.port,
		// secure = implicit TLS (465); otherwise STARTTLS is required when offered
		secure: opts.secure && opts.port === 465,
		requireTLS: opts.secure && opts.port !== 465,
		auth: opts.user ? { user: opts.user, pass: opts.password ?? '' } : undefined,
		connectionTimeout: 15_000,
		greetingTimeout: 15_000
	});
	return {
		describe: `Custom SMTP · ${opts.host}:${opts.port}`,
		async send(from: string, msg: MailMessage) {
			try {
				await transporter.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
			} catch (e) {
				const err = e as { responseCode?: number; code?: string; message: string };
				throw new MailError(
					`The SMTP server refused the message. (${err.responseCode ?? err.code ?? 'error'}: ${err.message.split('\n')[0]})`
				);
			}
		}
	};
}
