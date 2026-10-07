import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// The service worker shows a pushed notice (#16), with its buttons. Chrome's
// DevTools protocol plays the push service; desktop Chrome only.
test.use({ serviceWorkers: 'allow', channel: 'chromium' });

test('a pushed reminder shows as a notification with Mark done and Snooze', async ({ page, context, browserName }, info) => {
	test.skip(browserName !== 'chromium' || info.project.name !== 'desktop', 'DevTools push delivery is Chrome only');
	await newKeeperWithTank(page, `push-sw-${info.project.name}`);
	await context.grantPermissions(['notifications']);
	await open(page, '/settings#push');
	await page.evaluate(() => navigator.serviceWorker.ready);

	const cdp = await context.newCDPSession(page);
	// navigator.serviceWorker.ready resolves as soon as the worker starts activating, and DevTools
	// delivers a push only once: under load one sent mid-activation was lost now and then. So wait
	// for an activated version (running or not; a push wakes a stopped one)
	const registration = new Promise<string>((resolve) =>
		cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
			const v = versions.find((x: { status: string }) => x.status === 'activated');
			if (v) resolve(v.registrationId);
		})
	);
	await cdp.send('ServiceWorker.enable');
	const notice = {
		kind: 'reminder',
		title: 'Due today: Water change',
		body: 'Riverbed 40',
		url: '/',
		tag: 'task-1',
		actions: [
			{ action: 'done', title: 'Mark done', url: '/e/x', result: '✓ Water change done' },
			{ action: 'snooze', title: 'Snooze', url: '/e/y', result: 'Snoozed Water change for a day' }
		]
	};
	await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(page.url()).origin, registrationId: await registration, data: JSON.stringify(notice) });

	// the push comes through the browser's own service; with every other test running, give it a while
	await expect
		.poll(
			() =>
			page.evaluate(async () =>
				(await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({
					title: n.title,
					body: n.body,
					tag: n.tag,
					actions: (n as Notification & { actions: { title: string }[] }).actions.map((a) => a.title)
				}))
			),
			{ timeout: 15_000 }
		)
		.toEqual([{ title: 'Due today: Water change', body: 'Riverbed 40', tag: 'task-1', actions: ['Mark done', 'Snooze'] }]);
});
