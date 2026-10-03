// Who may sign in with Google, as rules with no database behind them (sign-in.ts reads the settings).
import { env } from '$env/dynamic/private';

export type SignupMode = 'admin' | 'list' | 'invited' | 'open';

/** Emails and @domains, however they were written down: commas, spaces or one per line. */
export const parseAllowed = (v: string | null | undefined) =>
	(v ?? '')
		.split(/[\s,;]+/)
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);

/** An email or @domain an allow list can hold. */
export const validAllowed = (entry: string) => /^(@|[^@\s]+@)[^@\s]+\.[^@\s]+$/.test(entry);

/** Who may sign in with Google besides the admin: the saved setting, else the environment's. */
export function signupRules(saved: { signupMode: SignupMode | null; allowedEmails: string | null }, e: Record<string, string | undefined> = env) {
	if (saved.signupMode) return { mode: saved.signupMode, list: saved.signupMode === 'list' ? parseAllowed(saved.allowedEmails) : [], from: 'app' as const };
	if (e.OPEN_SIGNUP === 'true') return { mode: 'open' as const, list: [], from: 'env' as const };
	const list = parseAllowed(e.ALLOWED_EMAILS);
	return { mode: list.length ? ('list' as const) : ('admin' as const), list, from: e.ALLOWED_EMAILS || e.OPEN_SIGNUP ? ('env' as const) : ('app' as const) };
}

/** Whether a list lets this email in: the address itself, or its @domain. */
export const listAllows = (list: string[], email: string) => {
	const e = email.trim().toLowerCase();
	return list.some((entry) => (entry.startsWith('@') ? e.endsWith(entry) : e === entry));
};
