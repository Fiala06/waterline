// The local admin's password (#102): the recovery login, with no second step,
// so a new one has to be long and not one everybody tries first. Length is
// what counts: no rules about capitals, digits or symbols, spaces welcome,
// so a few words make a good one. Checked here on the server, against a list
// shipped with the app (data/PASSWORD_SOURCES.md); it's never sent anywhere.
import common from './data/common-passwords.json';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 1024;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters. A few words with spaces between them works well.`;

const COMMON = new Set<string>(common as string[]);
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz'];

/** Letters and digits only, lower case: "Pass word 1" and "password1" are the same guess. */
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A run along a keyboard row or the alphabet, either way ("123456789012", "qwertyuiop[]"), or one thing repeated. */
function predictable(s: string): boolean {
	if (s.length < 4) return true;
	if (/^(.)\1+$/u.test(s) || /^(.{1,4})\1+$/u.test(s)) return true;
	const runs = ROWS.flatMap((r) => [r, [...r].reverse().join('')]);
	// mostly made of a run: what's left over is a few characters at most
	return runs.some((r) => {
		for (let n = Math.min(r.length, s.length); n >= 6; n--) for (let i = 0; i + n <= r.length; i++) if (s.includes(r.slice(i, i + n)) && s.length - n <= 3) return true;
		return false;
	});
}

/**
 * Why a new local admin password won't do, or null when it will. `names` are
 * words a password shouldn't just be (the username, the address).
 */
export function passwordProblem(password: string, names: string[] = []): string | null {
	const length = [...password].length; // characters, not UTF-16 units
	if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters. A few words with spaces between them works well.`;
	if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
	const s = squash(password);
	const lower = password.toLowerCase();
	const own = [...names, 'waterline', 'admin', 'password', 'aquarium'].map(squash).filter((n) => n.length >= 3);
	// the name with a little added on ("admin2026!!", "waterline123"), or said twice with a number ("admin admin 12")
	const justAName =
		own.some((n) => s.includes(n) && s.length - n.length <= 6) ||
		(own.some((n) => s.includes(n)) && own.reduce((rest, n) => rest.split(n).join(''), s).replace(/\p{N}/gu, '').length <= 3);
	// mostly symbols: look at it as typed, or "#$%&*!@^)(+=" would squash to nothing
	if (COMMON.has(lower) || COMMON.has(s) || predictable(s.length >= 8 ? s : lower) || justAName) {
		return "That password is one people try first. Choose something only you'd think of, like a few unrelated words.";
	}
	return null;
}
