import { expect, test } from '@playwright/test';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dateValue, newKeeperWithTank, open, pickDate } from './helpers';

// Push notifications (#16). A stand-in on this machine plays the browser's push
// service and an ntfy server; the test decrypts each Web Push with the
// device's own keys, as a phone would.

interface Got {
	path: string;
	headers: IncomingHttpHeaders;
	body: Buffer;
}

async function standIn() {
	const got: Got[] = [];
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			got.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
			// a device that's gone: the push service says so
			res.writeHead(req.url?.startsWith('/wp/gone') ? 410 : 201).end();
		});
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const port = (server.address() as AddressInfo).port;
	return { got, base: `http://localhost:${port}`, close: () => server.close() };
}

/** A device's keys, as a browser makes them. */
function device() {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const auth = randomBytes(16);
	return { ecdh, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, auth };
}

/** RFC 8291 (aes128gcm): what the phone would show. */
function decrypt(body: Buffer, d: ReturnType<typeof device>) {
	const salt = body.subarray(0, 16);
	const idLen = body[20];
	const serverKey = body.subarray(21, 21 + idLen);
	const data = body.subarray(21 + idLen);
	const shared = d.ecdh.computeSecret(serverKey);
	const info = Buffer.concat([Buffer.from('WebPush: info\0'), d.ecdh.getPublicKey(), serverKey]);
	const ikm = Buffer.from(hkdfSync('sha256', shared, d.auth, info, 32));
	const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
	const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
	const dc = createDecipheriv('aes-128-gcm', cek, nonce);
	dc.setAuthTag(data.subarray(-16));
	const plain = Buffer.concat([dc.update(data.subarray(0, -16)), dc.final()]);
	// the last record ends with 0x02, then padding
	return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString('utf8'));
}

test('push: a device and ntfy get a test, reminders with Mark done, and out-of-range alerts', async ({ page, request }, info) => {
	await newKeeperWithTank(page, `push-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const origin = new URL(page.url()).origin;
	const out = await standIn();
	try {
		// a device turns push on (the page does this with the browser's subscription)
		const phone = device();
		const add = await page.request.post('/push', { headers: { origin }, data: { endpoint: `${out.base}/wp/phone`, keys: phone.keys } });
		expect(add.status()).toBe(200);
		const { label } = await add.json();
		expect(label).toMatch(/^Chrome on (Windows|Android)$/);
		// only real push services, and never from another site
		expect((await page.request.post('/push', { headers: { origin }, data: { endpoint: 'https://evil.example/x', keys: phone.keys } })).status()).toBe(400);
		expect((await page.request.post('/push', { headers: { origin: 'https://evil.example' }, data: { endpoint: `${out.base}/wp/x`, keys: phone.keys } })).status()).toBe(403);

		await open(page, '/settings#push');
		const push = page.locator('#push');
		await expect(push.getByRole('button', { name: `Remove ${label}` })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Task reminders by push' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Task reminders by email' })).toBeChecked();

		// a test reaches it, encrypted for it
		await push.getByRole('button', { name: 'Send a test' }).click();
		await expect(page.getByRole('status').filter({ hasText: '✓ Test sent to' })).toContainText(`✓ Test sent to ${label}`);
		const test1 = out.got.find((g) => g.path === '/wp/phone')!;
		expect(test1.headers['content-encoding']).toBe('aes128gcm');
		expect(test1.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
		expect(Number(test1.headers.ttl)).toBeGreaterThan(0);
		expect(decrypt(test1.body, phone)).toMatchObject({ kind: 'test', title: 'Test from Waterline', url: `${origin}/settings#push` });

		// ntfy: a bad address, then a topic on "your own server"
		await push.getByLabel('ntfy').fill('https://ntfy.sh/');
		await push.getByRole('button', { name: 'Add ntfy' }).click();
		await expect(push.getByText("✕ Enter the topic's full address, like https://ntfy.sh/your-topic.")).toBeVisible();
		await push.getByLabel('ntfy').fill(`${out.base}/fish-tank-x7Kq`);
		await push.getByRole('button', { name: 'Add ntfy' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'ntfy saved' })).toBeVisible();
		await push.getByRole('button', { name: 'Send a test' }).click();
		await expect(page.getByRole('status').filter({ hasText: '✓ Test sent to' })).toContainText(`${label} and ntfy`);
		const ntfyTest = JSON.parse(out.got.find((g) => g.path === '/')!.body.toString());
		expect(ntfyTest).toMatchObject({ topic: 'fish-tank-x7Kq', title: 'Test from Waterline', tags: ['fish'] });

		// a task due tomorrow: pushed once, with Mark done and Snooze
		await open(page, '/tasks/new');
		await page.getByLabel('Task').fill('Trim stem plants');
		const today = await dateValue(page, 'nextDue');
		await pickDate(page, 'nextDue', new Date(Date.parse(today + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10));
		await page.getByRole('button', { name: 'Save' }).last().click();
		await expect(page.getByRole('status')).toContainText('added');
		out.got.length = 0;
		expect((await page.request.post('/dev/notify')).ok()).toBe(true);
		const reminder = decrypt(out.got.find((g) => g.path === '/wp/phone')!.body, phone);
		expect(reminder).toMatchObject({ kind: 'reminder', title: 'Due tomorrow: Trim stem plants', body: 'Riverbed 40', url: `${origin}/?tank=${tankId}` });
		expect(reminder.actions.map((a: { title: string }) => a.title)).toEqual(['Mark done', 'Snooze']);
		const ntfyReminder = JSON.parse(out.got.find((g) => g.path === '/')!.body.toString());
		expect(ntfyReminder).toMatchObject({ title: 'Due tomorrow: Trim stem plants', click: `${origin}/?tank=${tankId}` });
		// not twice
		out.got.length = 0;
		await page.request.post('/dev/notify');
		expect(out.got).toHaveLength(0);

		// Mark done from the ntfy app: a post with no Origin and no cookies
		const done = ntfyReminder.actions.find((a: { label: string }) => a.label === 'Mark done');
		const res = await request.post(done.url, { headers: done.headers, data: done.body });
		expect(res.status()).toBe(200);
		// the phone and ntfy share the one-time link: it's used everywhere
		expect(reminder.actions[0].url).toBe(done.url);
		await open(page, new URL(done.url).pathname);
		await expect(page.getByText('This link was already used.')).toBeVisible();

		// an out-of-range reading: pushed right away
		out.got.length = 0;
		await open(page, `/entries/test/new?tank=${tankId}`);
		await page.getByLabel('Nitrate', { exact: true }).fill('40');
		await page.getByRole('button', { name: 'Save 1 reading' }).click();
		await expect(page.getByRole('status')).toContainText('1 out of range');
		await expect.poll(() => out.got.filter((g) => g.path === '/wp/phone').length).toBe(1);
		expect(decrypt(out.got.find((g) => g.path === '/wp/phone')!.body, phone)).toMatchObject({
			kind: 'oor',
			title: 'Nitrate is high in Riverbed 40: 40 ppm',
			body: 'Target 5–20 ppm'
		});

		// off for push, email stays on
		await open(page, '/settings#push');
		await page.getByRole('checkbox', { name: 'Out-of-range alerts by push' }).uncheck({ force: true });
		await expect(page.getByRole('status').filter({ hasText: 'Notification settings saved' })).toBeVisible();
		out.got.length = 0;
		await open(page, `/entries/test/new?tank=${tankId}`);
		await page.getByLabel('Nitrate', { exact: true }).fill('45');
		await page.getByRole('button', { name: 'Save 1 reading' }).click();
		await expect(page.getByRole('status')).toContainText('1 out of range');
		await page.waitForTimeout(1000);
		expect(out.got).toHaveLength(0);

		// a device that's gone is forgotten on the next send; one removed from the list too
		const old = device();
		await page.request.post('/push', { headers: { origin }, data: { endpoint: `${out.base}/wp/gone`, keys: old.keys } });
		await open(page, '/settings#push');
		await push.getByRole('button', { name: 'Remove ntfy' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'ntfy removed' })).toBeVisible();
		await push.getByRole('button', { name: 'Send a test' }).click();
		await expect(page.getByRole('status').filter({ hasText: '✓ Test sent to' })).toContainText(`✓ Test sent to ${label}`);
		await open(page, '/settings#push');
		await expect(push.getByRole('button', { name: /^Remove / })).toHaveCount(1);
		await push.getByRole('button', { name: `Remove ${label}` }).click();
		await expect(page.getByRole('status').filter({ hasText: "won't get notifications any more" })).toBeVisible();
		await expect(push.getByRole('button', { name: 'Send a test' })).toHaveCount(0);
	} finally {
		out.close();
	}
});
