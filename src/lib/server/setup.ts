// First start: while nobody could sign in as the admin (no local admin password,
// and no Google sign-in for an admin's account), a one-time setup code, printed
// in the server's log and kept in DATA_DIR/setup-code.txt, lets the owner create
// the admin login at /first-run. Only someone who can see the server has it.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { serverSettings } from './db/schema';
import { dataDir } from './instance';
import { getServerSettings } from './mail';
import { hashPassword } from './password';
import { googleAdminPossible, localAdminLogin } from './sign-in';

/** no 0/O or 1/I, so it reads back from a log without mistakes */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code: string | null = null;
const codeFile = () => join(dataDir(), 'setup-code.txt');

/** Nobody could sign in as the admin yet. */
export function setupNeeded(): boolean {
	// the tests' sign-in lets anyone in as anyone, the admin too
	if (env.AUTH_DEV_LOGIN === 'true') return false;
	return !localAdminLogin() && !googleAdminPossible();
}

/** The code while setup is needed: made, and printed to the log, the first time it's asked for. */
export function setupCode(): string | null {
	if (!setupNeeded()) {
		if (code) forget();
		return null;
	}
	if (!code) {
		const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
		code = `${c.slice(0, 4)}-${c.slice(4)}`;
		try {
			writeFileSync(codeFile(), `${code}\n`, { mode: 0o600 });
		} catch {
			/* the log has it */
		}
		console.log(
			`\n[waterline] This server has no admin yet. Open ${env.ORIGIN || 'it'} and enter this setup code to create the admin login:\n\n        ${code}\n\n[waterline] It's also in ${resolve(codeFile())}.\n`
		);
	}
	return code;
}

const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Whether a typed code is this one (in any case, with or without the dash). */
export function codeMatches(input: string): boolean {
	const want = setupCode();
	if (!want) return false;
	const a = Buffer.from(plain(input));
	const b = Buffer.from(plain(want));
	return a.length === b.length && timingSafeEqual(a, b);
}

function forget() {
	code = null;
	rmSync(codeFile(), { force: true });
}

/** Save the admin login; setup is done and the code is gone. */
export function finishSetup(username: string, password: string) {
	getServerSettings();
	db.update(serverSettings).set({ localAdminUsername: username, localAdminPasswordHash: hashPassword(password) }).where(eq(serverSettings.id, 1)).run();
	forget();
}

/** At startup: announce the code when it's needed, and clear an old one when it isn't. */
export function announceSetup() {
	if (!setupCode()) rmSync(codeFile(), { force: true });
}
