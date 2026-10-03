import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { photos } from '$lib/server/db/schema';
import { optStr, str } from '$lib/server/forms';
import { displayNameFor, getPublicPage, ogVersion, publicSettings, slugify, updatePublicPage, viewsThisWeek } from '$lib/server/public';
import { getTank } from '$lib/server/tanks';
import { logger } from '$lib/server/log';
import type { Actions, PageServerLoad } from './$types';

// P1 (what shows) + P4 (search & sharing) for one tank.
export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const page = getPublicPage(user.id, tank.id);
	const s = publicSettings();
	const base = s.baseUrl ?? url.origin;
	return {
		tank: { id: tank.id, name: tank.name, hasCover: !!tank.coverPhotoId },
		page,
		ogVersion: ogVersion(page, tank),
		allowed: s.allowPublicPages,
		base,
		host: new URL(base).host,
		views: viewsThisWeek(tank.id),
		names: {
			full: displayNameFor(user, 'full') ?? 'Your name',
			short: displayNameFor(user, 'short') ?? 'Your name'
		},
		photos: db.select({ id: photos.id }).from(photos).where(eq(photos.tankId, tank.id)).orderBy(desc(photos.takenAt)).limit(24).all()
	};
};

const on = (form: FormData, k: string) => form.get(k) === 'on';

/** localhost, .local/.internal names and private, loopback or link-local IPs. */
function internalHost(host: string) {
	const h = host.replace(/^\[|\]$/g, '').toLowerCase();
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa') || !h.includes('.')) return true;
	const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
	}
	return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const seoTitle = optStr(form, 'seoTitle', 60);
		const seoDescription = optStr(form, 'seoDescription', 160);
		const displayName = str(form, 'displayName');
		const ogPhotoId = optStr(form, 'ogPhotoId', 64);
		const result = updatePublicPage(user.id, params.id, {
			enabled: on(form, 'enabled'),
			slug: slugify(str(form, 'slug')),
			showReadings: on(form, 'showReadings'),
			showCharts: on(form, 'showCharts'),
			showPhotos: on(form, 'showPhotos'),
			showLivestock: on(form, 'showLivestock'),
			showPetNames: on(form, 'showPetNames'),
			showEquipment: on(form, 'showEquipment'),
			showActivity: on(form, 'showActivity'),
			showDescription: on(form, 'showDescription'),
			description: optStr(form, 'description', 1000),
			displayName: displayName === 'full' || displayName === 'none' ? displayName : 'short',
			indexable: on(form, 'indexable'),
			seoTitle,
			seoDescription,
			ogPhotoId:
				ogPhotoId && db.select().from(photos).where(eq(photos.id, ogPhotoId)).get()?.tankId === params.id ? ogPhotoId : null,
			ogPlain: str(form, 'ogStyle') === 'plain'
		});
		if ('error' in result) return fail(400, { slugError: result.error });
		return { saved: true };
	},
	// Is the public link reachable? Fetched from this server through the public address, so it
	// catches a wrong Public site URL, a proxy that isn't passing /t/, or pages turned off; a
	// firewall between the internet and the server it can't see (open the link with Wi-Fi off for that).
	check: async ({ locals, params, url }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id);
		const page = getPublicPage(user.id, tank.id);
		const s = publicSettings();
		const base = s.baseUrl ?? url.origin;
		const link = `${base}/t/${page.slug}`;
		const fail = (text: string, hint: string) => ({ check: { ok: false, link, text, hint } });
		if (!s.allowPublicPages) return fail('✕ Public pages are off for this server', 'Turn them on in Server settings › Public pages.');
		if (!page.enabled) return fail('✕ This page is off', 'Turn it on above and save, then check again.');
		// only a web address, and never an internal one (the server's own origin aside), so the
		// check can't be used to poke at the network the server sits in
		let target: URL;
		try {
			target = new URL(link);
		} catch {
			return fail('✕ Not a web address', 'The Public site URL in Server settings must start with http:// or https://.');
		}
		if (!/^https?:$/.test(target.protocol)) return fail('✕ Not a web address', 'The Public site URL in Server settings must start with http:// or https://.');
		if (target.origin !== url.origin && internalHost(target.hostname)) return fail('▲ An internal address', `${target.host} is a private or local address, which visitors on the internet can't reach. Set the Public site URL in Server settings to the address they use.`);
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 8000);
		try {
			const res = await fetch(link, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'Waterline self-check' } });
			if (res.status === 200) {
				const html = await res.text();
				if (html.includes(`/t/${page.slug}`)) return { check: { ok: true, link, text: '✓ Reachable from this server', hint: `${link} answered with the page. To be sure it works from outside your network, open it on a phone with Wi-Fi off.` } };
				return fail('▲ Something else answered', `${link} returned a page that isn't this tank's. Check the Public site URL in Server settings and your proxy's rules for /t/.`);
			}
			if (res.status >= 300 && res.status < 400) return fail(`▲ Redirected (${res.status})`, `${link} sends visitors to ${res.headers.get('location') ?? 'somewhere else'}. A proxy or sign-in rule may be in the way of /t/.`);
			if (res.status === 404) return fail('✕ Not found (404)', `${link} isn't served. Check the Public site URL in Server settings; the page is on at ${url.origin}/t/${page.slug}.`);
			return fail(`✕ ${res.status} from the server`, `${link} answered with an error. The Logs in Server settings may say why.`);
		} catch (e) {
			const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name;
			logger.warn('settings', `Self-check of ${link} failed: ${code}`);
			if (code === 'AbortError') return fail('✕ No answer in 8 seconds', `${link} didn't respond. The address may point somewhere this server can't reach, or a firewall is dropping it.`);
			if (code === 'ENOTFOUND') return fail("✕ The address doesn't resolve", `${new URL(link).host} has no DNS record this server can see. Check the Public site URL in Server settings.`);
			if (code === 'ECONNREFUSED') return fail('✕ Connection refused', `Nothing is listening at ${new URL(link).host}. Check the port and your proxy.`);
			if (/CERT|TLS|SSL/i.test(String(code))) return fail('✕ Certificate problem', `${new URL(link).host}'s HTTPS certificate isn't trusted. Visitors' browsers will refuse it too.`);
			return fail('✕ Could not connect', `${link}: ${code}. Check the Public site URL in Server settings and your proxy.`);
		} finally {
			clearTimeout(timer);
		}
	}
};
