import { MailError, type MailMessage, type Transport } from './types';

export function mailgunTransport(opts: { apiKey: string; domain: string; region: 'us' | 'eu' }): Transport {
	const base = opts.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
	return {
		describe: `Mailgun (${opts.region.toUpperCase()}) · ${opts.domain}`,
		async send(from: string, msg: MailMessage) {
			const body = new FormData();
			body.set('from', from);
			body.set('to', msg.to);
			body.set('subject', msg.subject);
			body.set('html', msg.html);
			body.set('text', msg.text);
			for (const [k, v] of Object.entries(msg.headers ?? {})) body.set(`h:${k}`, v);
			let res: Response;
			try {
				res = await fetch(`${base}/v3/${encodeURIComponent(opts.domain)}/messages`, {
					method: 'POST',
					headers: { authorization: `Basic ${Buffer.from(`api:${opts.apiKey}`).toString('base64')}` },
					body,
					signal: AbortSignal.timeout(20_000)
				});
			} catch (e) {
				throw new MailError(`Couldn't reach Mailgun. (${(e as Error).message})`);
			}
			if (!res.ok) throw new MailError(`Mailgun rejected the request. (${res.status} ${res.statusText})`);
		}
	};
}
