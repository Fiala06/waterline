import { describe, expect, it, vi } from 'vitest';

// the senders open the database; these tests only need what they build
vi.mock('../db', () => ({ db: {} }));
vi.mock('../mail', () => ({ getServerSettings: () => ({}) }));
const { ntfyMessage, parseTopicUrl, sendNtfy } = await import('./ntfy');
const { allowedEndpoint, deviceLabel, subject } = await import('./webpush');

describe('parseTopicUrl', () => {
	it('splits a topic from its server, on ntfy.sh or your own', () => {
		expect(parseTopicUrl('https://ntfy.sh/waterline-x7Kq_2')).toEqual({ server: 'https://ntfy.sh', topic: 'waterline-x7Kq_2' });
		expect(parseTopicUrl(' https://home.example/ntfy/tank ')).toEqual({ server: 'https://home.example/ntfy', topic: 'tank' });
		expect(parseTopicUrl('http://192.168.1.20:8080/fish')).toEqual({ server: 'http://192.168.1.20:8080', topic: 'fish' });
	});

	it('refuses anything that isn\'t a topic address', () => {
		for (const bad of ['', 'ntfy.sh/topic', 'https://ntfy.sh/', 'https://ntfy.sh/a b', 'ftp://ntfy.sh/t', 'https://u:p@ntfy.sh/t', 'https://ntfy.sh/t?x=1', 'javascript:alert(1)']) {
			expect(parseTopicUrl(bad), bad).toBeNull();
		}
	});
});

describe('ntfyMessage', () => {
	it('has the notice, a tap to open it, and Mark done / Snooze as posts', () => {
		const m = ntfyMessage('fish', {
			kind: 'reminder',
			title: 'Due today: Water change',
			body: 'Riverbed 40',
			url: 'https://w.example/?tank=1',
			tag: 'task-1',
			actions: [{ action: 'done', title: 'Mark done', url: 'https://w.example/e/abc', result: '✓ Water change done' }]
		});
		expect(m).toEqual({
			topic: 'fish',
			title: 'Due today: Water change',
			message: 'Riverbed 40',
			click: 'https://w.example/?tank=1',
			tags: ['alarm_clock'],
			priority: 3,
			actions: [
				{ action: 'http', label: 'Mark done', url: 'https://w.example/e/abc', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', clear: true }
			]
		});
	});

	it('marks an out-of-range alert as more urgent', () => {
		expect(ntfyMessage('fish', { kind: 'oor', title: 't', body: 'b', url: 'u', tag: 'x' })).toMatchObject({ priority: 4, tags: ['warning'], actions: [] });
	});
});

describe('sendNtfy', () => {
	it('posts to the server with the token, and says when it needs one', async () => {
		const calls: [string, RequestInit][] = [];
		const ok = (async (u: string, init: RequestInit) => (calls.push([u, init]), new Response('{}'))) as unknown as typeof fetch;
		await sendNtfy('https://ntfy.example/fish', 'tk_1', { kind: 'test', title: 'T', body: 'B', url: 'u', tag: 't' }, ok);
		expect(calls[0][0]).toBe('https://ntfy.example');
		expect((calls[0][1].headers as Record<string, string>).authorization).toBe('Bearer tk_1');
		expect(JSON.parse(String(calls[0][1].body))).toMatchObject({ topic: 'fish', title: 'T' });

		const refused = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
		await expect(sendNtfy('https://ntfy.example/fish', null, { kind: 'test', title: 'T', body: 'B', url: 'u', tag: 't' }, refused)).rejects.toThrow(
			'The ntfy server answered 403: it needs an access token, or this one is wrong'
		);
	});
});

describe('allowedEndpoint', () => {
	it("posts only to the browsers' push services, over https", () => {
		for (const ok of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://web.push.apple.com/abc',
			'https://wns2-par02p.notify.windows.com/w/?token=abc'
		]) {
			expect(allowedEndpoint(ok, false), ok).toBe(true);
		}
		for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/fcm.googleapis.com', 'https://googleapis.com.evil.example/x', 'http://localhost:9999/x', 'https://169.254.169.254/latest', 'nope']) {
			expect(allowedEndpoint(bad, false), bad).toBe(false);
		}
	});

	it('also posts to this machine in tests', () => {
		expect(allowedEndpoint('http://localhost:9999/x', true)).toBe(true);
		expect(allowedEndpoint('http://127.0.0.1:9999/x', true)).toBe(true);
		expect(allowedEndpoint('http://192.168.1.2/x', true)).toBe(false);
	});
});

describe('deviceLabel', () => {
	it('names the browser and the device', () => {
		expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')).toBe('Chrome on Android');
		expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(
			'Safari on iPhone'
		);
		expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0')).toBe('Edge on Windows');
		expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox on Mac');
		expect(deviceLabel('')).toBe('A browser');
	});
});

describe('subject', () => {
	it('is the admin, else the https address, else a stand-in push services accept', () => {
		expect(subject('https://w.example', 'me@example.com')).toBe('mailto:me@example.com');
		expect(subject('https://w.example', undefined)).toBe('https://w.example');
		expect(subject('http://192.168.1.5:3000', undefined)).toBe('mailto:waterline@localhost');
	});
});
