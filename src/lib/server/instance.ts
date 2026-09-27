// Keys this server makes for itself on first start, kept in DATA_DIR/keys.json
// (readable by its owner only): one signs sign-in sessions, one encrypts stored
// passwords. AUTH_SECRET and ENCRYPTION_KEY, when set, are used instead.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

type Env = Record<string, string | undefined>;

export const dataDir = (e: Env = env) => e.DATA_DIR ?? './data';

interface Keys {
	authSecret: string;
	encryptionKey: string;
}
/** by folder, read once */
const made = new Map<string, Keys>();

function read(path: string): Keys | null {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
	const k = JSON.parse(text) as Partial<Keys>;
	if (!k.authSecret || !k.encryptionKey) {
		throw new Error(`${path} is damaged. Delete it to make new keys: everyone signs in again, and saved email and Google passwords need entering again.`);
	}
	return k as Keys;
}

function instanceKeys(dir: string): Keys {
	const known = made.get(dir);
	if (known) return known;
	const path = join(dir, 'keys.json');
	let keys = read(path);
	if (!keys) {
		const fresh = { authSecret: randomBytes(32).toString('base64url'), encryptionKey: randomBytes(32).toString('base64url') };
		mkdirSync(dir, { recursive: true });
		try {
			writeFileSync(path, `${JSON.stringify(fresh, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
			keys = fresh;
		} catch {
			// another start made it at the same moment: use that one
			keys = read(path)!;
		}
	}
	made.set(dir, keys);
	return keys;
}

/** Signs sign-in sessions: AUTH_SECRET, else this server's own key. */
export const authSecret = (e: Env = env) => e.AUTH_SECRET || instanceKeys(dataDir(e)).authSecret;

/**
 * Encrypts stored passwords and signs links in emails: ENCRYPTION_KEY, else
 * AUTH_SECRET (as on servers from before these keys), else this server's own.
 */
export const encryptionBase = (e: Env = env) => e.ENCRYPTION_KEY || e.AUTH_SECRET || instanceKeys(dataDir(e)).encryptionKey;
