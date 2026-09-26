// EMAIL_TRANSPORT=outbox: write emails to DATA_DIR/outbox as JSON instead of
// sending them. For development and tests.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import type { MailMessage, Transport } from './types';

const dir = () => join(env.DATA_DIR ?? './data', 'outbox');

export function outboxTransport(): Transport {
	return {
		describe: 'Outbox (files, not sent)',
		async send(from: string, msg: MailMessage) {
			mkdirSync(dir(), { recursive: true });
			const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.json`;
			writeFileSync(join(dir(), name), JSON.stringify({ from, ...msg }, null, 2));
		}
	};
}

export function readOutbox(): (MailMessage & { from: string; file: string })[] {
	try {
		return readdirSync(dir())
			.sort()
			.map((f) => ({ ...JSON.parse(readFileSync(join(dir(), f), 'utf8')), file: f }));
	} catch {
		return [];
	}
}
