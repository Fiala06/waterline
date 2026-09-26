import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Format: scrypt:<salt base64>:<hash base64> (no $, so .env/compose files don't expand it). Generate with `npm run hash-password`.

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, KEY_LEN);
	return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/** Salt and hash of a well-formed stored hash, or null. A short or garbled hash must never match. */
function parse(stored: string): { salt: Buffer; hash: Buffer } | null {
	const [scheme, saltB64, hashB64, extra] = stored.trim().split(':');
	if (scheme !== 'scrypt' || !saltB64 || !hashB64 || extra !== undefined) return null;
	const salt = Buffer.from(saltB64, 'base64');
	const hash = Buffer.from(hashB64, 'base64');
	// Buffer.from skips bad characters, so re-encode to be sure it was real base64
	if (salt.toString('base64') !== saltB64 || hash.toString('base64') !== hashB64) return null;
	return salt.length >= 16 && hash.length === KEY_LEN ? { salt, hash } : null;
}

export const isValidPasswordHash = (stored: string) => parse(stored) !== null;

/**
 * Checks a password without blocking the server. It always does the full
 * scrypt work, so a wrong username or a bad hash takes as long as a real check.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const p = parse(stored);
	const actual = await scryptAsync(password, p?.salt ?? Buffer.alloc(16), KEY_LEN);
	return p !== null && timingSafeEqual(actual, p.hash);
}
