// What a queued entry's post came back as, decided apart from the browser
// (offline.ts does the storing and posting) so it can be unit-tested.

/** What to do with a queued entry after posting it. */
export type SyncOutcome =
	| { kind: 'synced' }
	/** the server said no, and will again: kept with its reason, for Retry or Discard */
	| { kind: 'refused'; message: string }
	/** something on the way that will pass (#225): left as it is, and tried again next time */
	| { kind: 'later' };

/**
 * A refusal that will stand is an answer the app itself gave: a form's failure,
 * or a 4xx. Being sent to the sign-in page (the session ran out while offline),
 * a 5xx (a proxy's 502 during a deploy) and a body that isn't the app's JSON
 * all pass by themselves, so the entry waits for the next sync.
 */
export function syncOutcome(res: { status: number; redirected?: boolean }, result: { type?: unknown; data?: unknown } | null): SyncOutcome {
	if (result?.type === 'redirect' || result?.type === 'success') return { kind: 'synced' };
	if (res.status === 409) return { kind: 'refused', message: 'Logged by another account. Sign in as them to sync it.' };
	if (res.redirected || res.status >= 500) return { kind: 'later' };
	if (result?.type === 'failure') return { kind: 'refused', message: "The server couldn't save this entry." };
	if (res.status >= 400) return { kind: 'refused', message: `Sync failed (${res.status}).` };
	return { kind: 'later' };
}

/**
 * An error kept by an earlier version for something that would have passed:
 * "Sync failed (200)." from the sign-in page, "(502)." from a proxy. Those
 * entries are tried again rather than left for someone to notice.
 */
export const wasPassing = (error: string | null | undefined) => /^Sync failed \((2\d\d|3\d\d|5\d\d)\)\.$/.test(error ?? '');

/**
 * A form post that never got an answer (#224): use:enhance reports a failed
 * fetch as an error with no status, where one the server answered with carries
 * its status. The browser may still say it's online: Wi-Fi up, no way through.
 */
export const neverAnswered = (result: { type: string; status?: number }) => result.type === 'error' && result.status === undefined;
