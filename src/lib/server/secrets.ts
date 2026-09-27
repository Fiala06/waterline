// Encrypt stored secrets (mail and Google passwords/API keys) with AES-256-GCM,
// and sign stateless links (unsubscribe) with HMAC. Keys are derived from
// ENCRYPTION_KEY, else AUTH_SECRET, else the key this server made for itself.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { encryptionBase } from './instance';

function key(purpose: string): Buffer {
	return Buffer.from(hkdfSync('sha256', encryptionBase(), 'waterline', purpose, 32));
}

/** "v1:<iv>:<tag>:<ciphertext>" (base64url parts) */
export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', key('secrets'), iv);
	const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
	return ['v1', iv, c.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
}

export function decrypt(stored: string | null | undefined): string | null {
	if (!stored) return null;
	const [v, iv, tag, data] = stored.split(':');
	if (v !== 'v1' || !iv || !tag || !data) return null;
	try {
		const d = createDecipheriv('aes-256-gcm', key('secrets'), Buffer.from(iv, 'base64url'));
		d.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
	} catch {
		return null;
	}
}

/** Signed value "<payload>.<sig>" for links that must not be guessable. */
export function sign(payload: string, purpose: string): string {
	const sig = createHmac('sha256', key(`sign:${purpose}`)).update(payload).digest('base64url').slice(0, 32);
	return `${payload}.${sig}`;
}

export function verify(signed: string, purpose: string): string | null {
	const i = signed.lastIndexOf('.');
	if (i <= 0) return null;
	const payload = signed.slice(0, i);
	const expected = Buffer.from(sign(payload, purpose));
	const actual = Buffer.from(signed);
	return expected.length === actual.length && timingSafeEqual(expected, actual) ? payload : null;
}
