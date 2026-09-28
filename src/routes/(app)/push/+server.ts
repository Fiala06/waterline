import { error, json } from '@sveltejs/kit';
import { addSubscription, allowedEndpoint, deviceLabel, listSubscriptions, removeSubscription, vapidKeys } from '$lib/server/push/webpush';
import { logger } from '$lib/server/log';
import type { RequestHandler } from './$types';

// This device's Web Push subscription (#16), from Settings › Notifications'
// "Turn on for this device", or from the service worker when the browser
// renews it (`replaces` is the old one).
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
		replaces?: unknown;
	} | null;
	const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
	const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
	const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
	if (!endpoint || endpoint.length > 1000 || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) error(400, "That isn't a push subscription.");
	if (!allowedEndpoint(endpoint)) error(400, "This browser's push service isn't one Waterline knows.");
	vapidKeys();
	const sub = addSubscription(
		locals.user!.id,
		{ endpoint, p256dh, auth },
		deviceLabel(request.headers.get('user-agent') ?? ''),
		typeof body?.replaces === 'string' ? body.replaces : null
	);
	logger.info('push', `Push turned on for ${sub.label}`, { userId: locals.user!.id });
	return json({ id: sub.id, label: sub.label });
};

/** Push turned off on this device: forget it. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
	const gone = listSubscriptions(locals.user!.id).find((s) => s.endpoint === endpoint);
	if (gone) {
		removeSubscription(locals.user!.id, gone.id);
		logger.info('push', `Push turned off for ${gone.label}`, { userId: locals.user!.id });
	}
	return json({ removed: !!gone });
};
