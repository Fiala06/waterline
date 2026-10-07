import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Security boundaries over HTTP (#106): another keeper's records by id, forged
// and cross-site posts, token scope and kind, share links. The same rules at
// the server's functions are in src/lib/server/security-boundaries.test.ts.
// The victim is the seeded demo account; it's replaced on each seed, so this
// runs on one project only.
test.setTimeout(180_000);

async function signIn(page: Page, email: string) {
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
}

/** Links on a page matching a pattern, without repeats. */
async function links(page: Page, url: string, pattern: RegExp) {
	await open(page, url);
	const all = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
	return [...new Set(all.filter((h) => pattern.test(h)))];
}

const status = async (r: APIRequestContext, url: string) => (await r.get(url, { maxRedirects: 0 })).status();

test('the boundaries between keepers, tokens and the public', async ({ page, browser, request, baseURL }, info) => {
	test.skip(info.project.name !== 'desktop', 'one seeded victim at a time');
	const origin = new URL(baseURL!).origin;
	const seeded = await (await request.post('/dev/seed')).json();
	const tank = seeded.plantedTank as string;

	// the victim's records, found the way they'd find them
	const victim = await (await browser.newContext()).newPage();
	await signIn(victim, seeded.email);
	const testEntry = (await links(victim, '/history?range=all&cat=test', /^\/entries\/test\/[\w-]+$/))[0];
	const eventEntry = (await links(victim, '/history?range=all', /^\/entries\/event\/[\w-]+$/))[0];
	const photo = (await links(victim, '/photos', /^\/photos\/[\w-]+$/))[0];
	await open(victim, photo);
	const media = (await victim.locator('img[src^="/media/"]').first().getAttribute('src'))!.split('?')[0];
	const task = (await links(victim, '/tasks', /^\/tasks\/[\w-]+$/)).find((h) => h !== '/tasks/new')!;
	const equipment = (await links(victim, `/tanks/${tank}/equipment`, new RegExp(`^/tanks/${tank}/equipment/[\\w-]+$`))).find((h) => !h.endsWith('/new'))!;
	const animal = (await links(victim, `/tanks/${tank}/livestock`, new RegExp(`^/tanks/${tank}/livestock/[\\w-]+$`))).find((h) => !/\/(new|several)$/.test(h))!;
	const expense = (await links(victim, `/tanks/${tank}/spending`, new RegExp(`^/tanks/${tank}/spending/[\\w-]+$`))).find((h) => !h.endsWith('/new'))!;
	// the photo with a public link
	let share: string | null = null;
	let shared: string | null = null;
	for (const p of await links(victim, '/photos', /^\/photos\/[\w-]+$/)) {
		await open(victim, p);
		const url = await victim.locator('aside .s-url').inputValue({ timeout: 1500 }).catch(() => '');
		if (url) {
			// shown without the scheme, as "host/s/…"
			share = url.match(/\/s\/[\w-]+/)![0];
			shared = p;
			break;
		}
	}
	for (const found of [testEntry, eventEntry, photo, media, task, equipment, animal, expense, share, shared]) expect(found, 'the seed has one of each').toBeTruthy();
	const taskId = task.split('/').pop()!;

	// someone else on the server
	await newKeeperWithTank(page, 'intruder');
	const own = new URL(page.url()).searchParams.get('tank')!;
	const intruder = page.request;

	await test.step("another keeper's records by id are not found (404, not 403: nothing says they exist)", async () => {
		const pages = [
			`/tanks/${tank}`,
			`/tanks/${tank}/settings`,
			`/tanks/${tank}/sharing`,
			`/tanks/${tank}/targets`,
			`/tanks/${tank}/public`,
			`/tanks/${tank}/spending`,
			`/tanks/${tank}/summary`,
			`/tanks/${tank}/summary.md`,
			`/tanks/${tank}/livestock/new`,
			`/entries/test/new?tank=${tank}`,
			`/entries/event/new?tank=${tank}&category=note`,
			testEntry,
			`${testEntry}/edit`,
			eventEntry,
			`${eventEntry}/edit`,
			photo,
			media,
			task,
			equipment,
			animal,
			expense,
			`/settings/export/${crypto.randomUUID()}/download`
		];
		const seen: Record<string, number> = {};
		for (const url of pages) seen[url] = await status(intruder, url);
		expect(seen).toEqual(Object.fromEntries(pages.map((u) => [u, 404])));
		// a page that picks the tank from ?tank= falls back to their own, never shows the victim's
		const dash = await (await intruder.get(`/?tank=${tank}`)).text();
		expect(dash).not.toContain('CO₂ 1 bps');
		expect(await status(intruder, `/?tank=${own}`)).toBe(200);
	});

	await test.step("another keeper can't change or delete them either", async () => {
		const post = (url: string, form: Record<string, string> = {}) => intruder.post(url, { form, headers: { origin }, maxRedirects: 0 });
		const tries = {
			deleteTest: (await post(`${testEntry}?/delete`)).status(),
			deleteEvent: (await post(`${eventEntry}?/delete`)).status(),
			deletePhoto: (await post(`${photo}?/delete`)).status(),
			unsharePhoto: (await post(`${photo}?/unshare`)).status(),
			saveTask: (await post(`${task}?/save`, { name: 'Mine now' })).status(),
			doneTask: (await post('/tasks?/done', { taskId })).status(),
			skipTask: (await post('/tasks?/skip', { taskId })).status(),
			removeEquipment: (await post(`${equipment}?/remove`)).status(),
			invite: (await post(`/tanks/${tank}/sharing?/invite`, { email: 'me@example.com', role: 'log' })).status(),
			tankSettings: (await post(`/tanks/${tank}/settings`, { name: 'Mine now' })).status()
		};
		expect(tries).toEqual(Object.fromEntries(Object.keys(tries).map((k) => [k, 404])));
		// all still there for the victim
		for (const url of [testEntry, eventEntry, photo, task, equipment, share!]) expect(await status(victim.request, url), url).toBe(200);
	});

	await test.step('a cross-site post is refused even with the victim signed in (403), and nothing changes', async () => {
		for (const o of ['https://evil.example', null]) {
			const headers: Record<string, string> = o ? { origin: o } : {};
			const res = await victim.request.post(`${testEntry}?/delete`, { form: {}, headers, maxRedirects: 0 });
			expect(res.status(), `Origin: ${o}`).toBe(403);
		}
		expect(await status(victim.request, testEntry)).toBe(200);
	});

	await test.step('a token reads or writes only the tanks it was made for, and only its own kind', async () => {
		// a forged form naming the victim's tank: the token gets only the intruder's own
		const make = async (kind: 'assistant' | 'sensors') => {
			const html = await (await intruder.post(`/settings/${kind}?/create`, { form: { name: 'Probe', tank: tank }, headers: { origin } })).text();
			const own2 = await (await intruder.post(`/settings/${kind}?/create`, { form: { name: 'Probe 2', tank: own }, headers: { origin } })).text();
			const re = kind === 'sensors' ? /wls_[\w-]{40,}/ : /wl_[\w-]{40,}/;
			return { forged: html.match(re)?.[0] ?? null, token: own2.match(re)![0] };
		};
		const a = await make('assistant');
		const s = await make('sensors');
		const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

		// assistant: its own tank, not the victim's, whichever form made it
		expect((await request.get(`/api/v1/tanks/${own}/summary`, { headers: bearer(a.token) })).status()).toBe(200);
		for (const t of [a.token, a.forged].filter(Boolean) as string[]) {
			for (const what of ['summary', 'readings?parameter=pH', 'history', 'livestock', 'trends', 'photos']) {
				const res = await request.get(`/api/v1/tanks/${tank}/${what}`, { headers: bearer(t) });
				expect(res.status(), what).toBe(404);
				expect(await res.text(), what).not.toContain('Riverbed');
			}
			const list = await (await request.get('/api/v1/tanks', { headers: bearer(t) })).text();
			expect(list).not.toContain(tank);
		}
		// sensor: writes to its own tank only, and can't read
		const reading = { parameter: 'temp', value: 25 };
		expect((await request.post(`/api/v1/tanks/${own}/readings`, { headers: bearer(s.token), data: reading })).status()).toBe(200);
		for (const t of [s.token, s.forged].filter(Boolean) as string[]) {
			expect([403, 404]).toContain((await request.post(`/api/v1/tanks/${tank}/readings`, { headers: bearer(t), data: reading })).status());
		}
		expect((await request.get('/api/v1/tanks', { headers: bearer(s.token) })).status()).toBe(401);
		// an assistant token can't write readings
		expect((await request.post(`/api/v1/tanks/${own}/readings`, { headers: bearer(a.token), data: reading })).status()).toBe(401);
		// a session cookie is not an API credential
		expect((await intruder.get('/api/v1/tanks')).status()).toBe(401);
		// a web page elsewhere can't use a token through the browser
		expect((await request.post(`/api/v1/tanks/${own}/readings`, { headers: { ...bearer(s.token), origin: 'https://evil.example' }, data: reading })).status()).toBe(403);

		// malformed and oversized requests fail safely
		const junk = await request.post(`/api/v1/tanks/${own}/readings`, { headers: { ...bearer(s.token), 'content-type': 'application/json' }, data: '{"parameter": "temp", "value": ' });
		expect(junk.status()).toBe(400);
		const many = await request.post(`/api/v1/tanks/${own}/readings`, { headers: bearer(s.token), data: { readings: Array.from({ length: 101 }, () => reading) } });
		expect(many.status()).toBe(400);

		// revoked: refused at once
		await open(page, '/settings/sensors');
		const ids = await page.locator('[popovertarget^="revoke-"]').evaluateAll((els) => els.map((e) => e.getAttribute('popovertarget')!.slice('revoke-'.length)));
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect((await intruder.post('/settings/sensors?/revoke', { form: { id }, headers: { origin }, maxRedirects: 0 })).status()).toBeLessThan(400);
		expect((await request.post(`/api/v1/tanks/${own}/readings`, { headers: bearer(s.token), data: reading })).status()).toBe(401);
	});

	await test.step("share links: a made-up one looks like a revoked one, and revoking stops it", async () => {
		const made = await request.get(`/s/${crypto.randomUUID().slice(0, 12)}`);
		expect(made.status()).toBe(404);
		expect((await request.get(share!)).status()).toBe(200);
		const off = await victim.request.post(`${shared}?/unshare`, { form: {}, headers: { origin, accept: "text/html" }, maxRedirects: 0 });
		expect(off.status()).toBe(303);
		const revoked = await request.get(share!);
		expect(revoked.status()).toBe(made.status());
		expect(await revoked.text()).not.toContain('Riverbed 40');
		// a public tank page that doesn't exist is the same 404 as one turned off
		expect((await request.get('/t/no-such-tank')).status()).toBe(404);
	});
});

