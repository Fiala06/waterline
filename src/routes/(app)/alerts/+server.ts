import { error, json } from '@sveltejs/kit';
import { markAlertsSeen } from '$lib/server/users';
import type { RequestHandler } from './$types';

// Alerts marked read (one, or Mark all read): the keys join the account's
// list, so the bell's count agrees on every device. Only the signed-in
// person's own list changes.
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
	const keys = Array.isArray(body?.keys) ? body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 200) : null;
	if (!keys || keys.length > 300) error(400, 'Send the alert keys to mark read.');
	return json({ seen: markAlertsSeen(locals.user!.id, keys) });
};
