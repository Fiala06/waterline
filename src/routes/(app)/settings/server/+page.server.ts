import { error, fail } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { serverSettings, users } from '$lib/server/db/schema';
import { num, str } from '$lib/server/forms';
import { getServerSettings, MailError, outboxMode, storedConfig, transportFrom, type MailConfig } from '$lib/server/mail';
import { testEmail } from '$lib/server/mail/templates';
import { baseUrl, prefsFor, recipient, unsubscribeToken } from '$lib/server/notifications';
import { hashPassword } from '$lib/server/password';
import { encrypt } from '$lib/server/secrets';
import { googleAdminPossible, googleClient, localAdminLogin, parseAllowed, signupRules, validAllowed, type SignupMode } from '$lib/server/sign-in';
import { sitemapEntries } from '$lib/server/public';
import { outboxTransport } from '$lib/server/mail/outbox';
import type { Actions, PageServerLoad } from './$types';
import pkg from '../../../../../package.json';
import { logCounts, logger } from '$lib/server/log';
import { lookAgain, stockPhotosOn, stockPhotoStatus, TEST_SPECIES } from '$lib/server/stock-photos';
import { careStatus, downloadCare } from '$lib/server/species-care';
import { listInvites } from '$lib/server/invites';
import { passwordProblem } from '$lib/server/password-policy';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404, 'Not found');
	return locals.user;
}

function dirSize(dir: string): number {
	let total = 0;
	try {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			total += e.isDirectory() ? dirSize(p) : statSync(p).size;
		}
	} catch {
		/* unreadable or missing */
	}
	return total;
}

const mb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${Math.round(bytes / 1024 / 1024)} MB`);

const googleIdHint = (id: string) => `…${id.replace('.apps.googleusercontent.com', '').slice(-4)}.apps.googleusercontent.com`;
const USERNAME = /^[\w.@-]{1,40}$/;

export const load: PageServerLoad = ({ locals, url }) => {
	requireAdmin(locals);
	const s = getServerSettings();
	const dataDir = env.DATA_DIR ?? './data';
	const google = googleClient();
	const local = localAdminLogin();
	const rules = signupRules(s);
	const origin = (env.ORIGIN || url.origin).replace(/\/+$/, '');
	return {
		mail: {
			provider: s.emailProvider ?? 'mailgun',
			configured: !!s.emailProvider,
			hasMailgunKey: !!s.mailgunApiKeyEnc,
			mailgunDomain: s.mailgunDomain ?? '',
			mailgunRegion: s.mailgunRegion,
			smtpHost: s.smtpHost ?? '',
			smtpPort: s.smtpPort ? String(s.smtpPort) : '587',
			smtpSecure: s.smtpSecure,
			smtpUser: s.smtpUser ?? '',
			hasSmtpPassword: !!s.smtpPasswordEnc,
			sender: s.sender ?? ''
		},
		outbox: outboxMode(),
		originSet: !!baseUrl(),
		publicPages: {
			allow: s.allowPublicPages,
			home: s.publicHomeEnabled,
			baseUrl: s.publicBaseUrl ?? '',
			ga4Id: s.ga4Id ?? '',
			consent: s.consentBanner,
			searchConsoleTag: s.searchConsoleTag ?? '',
			sitemapCount: sitemapEntries().length,
			effectiveBase: (s.publicBaseUrl || env.ORIGIN || '').replace(/\/+$/, '')
		},
		signIn: {
			google: {
				on: !!google,
				fromEnv: google?.from === 'env' ? googleIdHint(google.clientId) : null,
				clientId: s.googleClientId ?? '',
				hasSecret: !!s.googleClientSecretEnc
			},
			redirectUri: `${origin}/auth/callback/google`,
			plainHttp: /^http:\/\/(?!(localhost|127\.0\.0\.1|\[::1\])(:|\/|$))/.test(origin),
			adminEmail: s.adminEmail ?? '',
			adminEmailEnv: env.ADMIN_EMAIL?.trim() || null,
			// Google is on, but nobody is let in as the admin with it yet
			needsAdmin: !!google && !googleAdminPossible(),
			mode: rules.mode,
			list: rules.list.join('\n'),
			accessFromEnv: rules.from === 'env',
			local: { on: !!local, username: local?.username ?? s.localAdminUsername ?? 'admin', fromApp: !!local?.fromApp, fromEnv: !!local?.fromEnv }
		},
		// People (#27): the counts the section shows
		people: {
			admins: db.select({ n: count() }).from(users).where(eq(users.isAdmin, true)).get()?.n ?? 0,
			pending: listInvites().filter((i) => i.state === 'pending').length
		},
		server: {
			version: pkg.version,
			data: `${resolve(dataDir)} · ${mb(dirSize(dataDir))}`,
			users: db.select({ n: count() }).from(users).get()?.n ?? 0,
			scheduledEmails: s.scheduledEmails,
			schedulerOff: env.EMAIL_SCHEDULER === 'off',
			updateCheck: s.updateCheck,
			updateCheckOff: env.UPDATE_CHECK === 'off',
			stockPhotos: s.stockPhotos,
			stockPhotosOff: env.STOCK_PHOTOS === 'off',
			// how the species photos are coming along, and why they aren't
			stock: stockPhotosOn() ? stockPhotoStatus() : null,
			// species care data from FishBase (#20): what this server has
			care: careStatus()
		},
		// what went wrong in the last day
		logs: logCounts(new Date(Date.now() - 86_400_000).toISOString())
	};
};

/** Mail settings from the form; blank secret fields keep the saved secret. */
function readForm(form: FormData, saved: MailConfig) {
	const errors: Record<string, string> = {};
	const provider = str(form, 'provider') === 'smtp' ? 'smtp' : 'mailgun';
	const sender = str(form, 'sender').slice(0, 200);
	const addr = sender.match(/<([^>]+)>/)?.[1] ?? sender;
	if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(addr)) errors.sender = 'Enter a sender like tanks@example.com or Waterline <tanks@example.com>.';
	const cfg: MailConfig = { ...saved, emailProvider: provider, sender };
	if (provider === 'mailgun') {
		cfg.mailgunApiKey = str(form, 'mailgunApiKey') || saved.mailgunApiKey;
		cfg.mailgunDomain = str(form, 'mailgunDomain').toLowerCase() || null;
		cfg.mailgunRegion = str(form, 'mailgunRegion') === 'eu' ? 'eu' : 'us';
		if (!cfg.mailgunApiKey) errors.mailgunApiKey = 'Enter your Mailgun API key.';
		if (!cfg.mailgunDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cfg.mailgunDomain)) errors.mailgunDomain = 'Enter the sending domain, e.g. mg.example.com.';
	} else {
		cfg.smtpHost = str(form, 'smtpHost') || null;
		const port = num(form, 'smtpPort');
		cfg.smtpPort = port && Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
		cfg.smtpSecure = form.get('smtpSecure') === 'on';
		cfg.smtpUser = str(form, 'smtpUser') || null;
		// the saved password only ever goes to the server it was saved for
		cfg.smtpPassword = str(form, 'smtpPassword') || (cfg.smtpHost === saved.smtpHost ? saved.smtpPassword : null);
		if (!cfg.smtpHost) errors.smtpHost = 'Enter the SMTP server.';
		if (!cfg.smtpPort) errors.smtpPort = 'Enter a port, usually 587 or 465.';
	}
	return { cfg, errors };
}

const setSettings = (patch: Partial<typeof serverSettings.$inferInsert>) => {
	getServerSettings();
	db.update(serverSettings).set(patch).where(eq(serverSettings.id, 1)).run();
};

export const actions: Actions = {
	/** Google sign-in's OAuth client. An empty client ID turns it off, unless that leaves no way in. */
	saveGoogle: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const s = getServerSettings();
		const clientId = str(form, 'googleClientId');
		const secret = str(form, 'googleClientSecret');
		const errors: Record<string, string> = {};
		if (clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) errors.googleClientId = 'Client IDs end in .apps.googleusercontent.com.';
		// a saved secret only goes with the client it was saved for
		else if (clientId && !secret && (clientId !== s.googleClientId || !s.googleClientSecretEnc)) errors.googleClientSecret = 'Paste the client secret too.';
		if (!clientId && !localAdminLogin() && !(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)) {
			errors.googleClientId = "Set a local admin password first: without Google sign-in it's the only way in.";
		}
		if (Object.keys(errors).length) return fail(400, { googleErrors: errors });
		setSettings(
			clientId
				? { googleClientId: clientId, googleClientSecretEnc: secret ? encrypt(secret) : s.googleClientSecretEnc }
				: { googleClientId: null, googleClientSecretEnc: null }
		);
		logger.info('settings', clientId ? 'Google sign-in client saved' : 'Google sign-in turned off in the app', { userId: locals.user!.id });
		// the next step, when nobody could be let in as the admin with it yet
		return { googleSaved: true, needsAdmin: !!clientId && !googleAdminPossible() };
	},
	/** Who may sign in with Google, and the admin's own account. */
	saveAccess: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const adminEmail = str(form, 'adminEmail').toLowerCase();
		const raw = str(form, 'signupMode');
		const mode: SignupMode = raw === 'list' || raw === 'open' || raw === 'invited' ? raw : 'admin';
		const entries = parseAllowed(String(form.get('allowedEmails') ?? ''));
		const errors: Record<string, string> = {};
		if (adminEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) errors.adminEmail = "Enter the Google account's email address.";
		const bad = entries.filter((e) => !validAllowed(e));
		if (bad.length) errors.allowedEmails = `Not an email or @domain: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`;
		else if (mode === 'list' && !entries.length) errors.allowedEmails = 'Add someone, or choose Only the admin.';
		if (Object.keys(errors).length) return fail(400, { accessErrors: errors });
		setSettings({ adminEmail: adminEmail || null, signupMode: mode, allowedEmails: entries.join('\n') || null });
		logger.info('settings', 'Who can sign in saved', { userId: locals.user!.id, mode, listed: entries.length });
		return { accessSaved: true };
	},
	/** The local admin login: a new username or password, or off (while Google can still let an admin in). */
	saveLocal: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		if (form.get('off')) {
			if (!googleAdminPossible()) {
				return fail(400, { localErrors: { password: "Set up Google sign-in for the admin's account first: otherwise nobody could sign in as the admin." } });
			}
			setSettings({ localAdminPasswordHash: null });
			logger.info('settings', 'Local admin login turned off', { userId: locals.user!.id });
			return { localSaved: 'off' };
		}
		const s = getServerSettings();
		const username = str(form, 'username') || 'admin';
		const password = String(form.get('password') ?? '');
		const errors: Record<string, string> = {};
		if (!USERNAME.test(username)) errors.username = 'Use letters, numbers, dots, dashes or underscores.';
		if (!password && !s.localAdminPasswordHash) errors.password = 'Choose a password.';
		else if (password && passwordProblem(password, [username, s.adminEmail ?? ''])) errors.password = passwordProblem(password, [username, s.adminEmail ?? ''])!;
		else if (password && password !== String(form.get('confirm') ?? '')) errors.confirm = "The passwords don't match.";
		if (Object.keys(errors).length) return fail(400, { localErrors: errors });
		setSettings({ localAdminUsername: username, ...(password ? { localAdminPasswordHash: hashPassword(password) } : {}) });
		logger.info('settings', password ? 'Local admin password changed' : 'Local admin username saved', { userId: locals.user!.id });
		return { localSaved: true };
	},
	/** Scheduled emails and the update check; a switch forced off by the environment keeps its saved value. */
	saveServer: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		setSettings({
			...(env.EMAIL_SCHEDULER === 'off' ? {} : { scheduledEmails: form.get('scheduledEmails') === 'on' }),
			...(env.UPDATE_CHECK === 'off' ? {} : { updateCheck: form.get('updateCheck') === 'on' }),
			...(env.STOCK_PHOTOS === 'off' ? {} : { stockPhotos: form.get('stockPhotos') === 'on' }),
			...(env.SPECIES_CARE === 'off' ? {} : { speciesCare: form.get('speciesCare') === 'on' })
		});
		logger.info('settings', 'Server switches saved', { userId: locals.user!.id, scheduledEmails: form.get('scheduledEmails') === 'on', updateCheck: form.get('updateCheck') === 'on' });
		return { serverSaved: true };
	},
	/** Species care data (#20): download FishBase's snapshot now, or again for a newer release. */
	careDownload: async ({ locals }) => {
		requireAdmin(locals);
		if (!careStatus().on) return fail(400, { care: { ok: false, message: 'Species care data is off.' } });
		try {
			const f = await downloadCare();
			logger.info('settings', `Species care data downloaded: FishBase ${f.version}, ${f.count} species`, { userId: locals.user!.id });
			return { care: { ok: true, message: `✓ FishBase ${f.version}: care ranges for ${f.count} of the bundled fish` } };
		} catch (e) {
			return fail(502, { care: { ok: false, message: `✕ Couldn't download: ${e instanceof Error ? e.message : String(e)}` } });
		}
	},
	/** Species photos: forget the ones not found, and see whether Wikipedia can be reached. */
	stockLookAgain: async ({ locals }) => {
		requireAdmin(locals);
		if (!stockPhotosOn()) return fail(400, { stock: { ok: false, message: 'Species photos are off.' } });
		const found = await lookAgain();
		const who = TEST_SPECIES.common;
		if (found.status === 'ok') return { stock: { ok: true, message: `✓ Wikipedia works: found a photo of ${who}. The rest come in as you open Plants and Livestock.` } };
		if (found.status === 'none') return { stock: { ok: true, message: `Wikipedia answered, but has no photo of ${who} to use (${found.reason}). The rest are looked up again as you open Plants and Livestock.` } };
		return fail(502, { stock: { ok: false, message: `✕ This server couldn't reach Wikipedia. (${found.reason})` } });
	},
	save: async ({ request, locals }) => {
		requireAdmin(locals);
		const { cfg, errors } = readForm(await request.formData(), storedConfig());
		if (Object.keys(errors).length) return fail(400, { errors, saved: false });
		getServerSettings();
		db.update(serverSettings)
			.set({
				emailProvider: cfg.emailProvider,
				mailgunApiKeyEnc: cfg.mailgunApiKey ? encrypt(cfg.mailgunApiKey) : null,
				mailgunDomain: cfg.mailgunDomain,
				mailgunRegion: cfg.mailgunRegion,
				smtpHost: cfg.smtpHost,
				smtpPort: cfg.smtpPort,
				smtpSecure: cfg.smtpSecure,
				smtpUser: cfg.smtpUser,
				smtpPasswordEnc: cfg.smtpPassword ? encrypt(cfg.smtpPassword) : null,
				sender: cfg.sender
			})
			.where(eq(serverSettings.id, 1))
			.run();
		logger.info('settings', 'Email delivery settings saved', { userId: locals.user!.id, provider: cfg.emailProvider });
		return { saved: true };
	},
	savePublic: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const errors: Record<string, string> = {};
		const baseUrl = str(form, 'publicBaseUrl').replace(/\/+$/, '');
		if (baseUrl && !/^https?:\/\/[^\s/]+(:\d+)?$/.test(baseUrl)) errors.publicBaseUrl = 'Use a URL like https://tanks.example.com (no path).';
		const ga4 = str(form, 'ga4Id').toUpperCase();
		if (ga4 && !/^G-[A-Z0-9]{4,16}$/.test(ga4)) errors.ga4Id = 'GA4 measurement IDs look like G-XXXXXXXXXX.';
		// Accept either the whole <meta> tag or just its content value.
		const tagRaw = str(form, 'searchConsoleTag');
		const tag = tagRaw.match(/content=["']([^"']+)["']/)?.[1] ?? tagRaw;
		if (tag && !/^[A-Za-z0-9_-]{10,100}$/.test(tag)) errors.searchConsoleTag = 'Paste the verification meta tag or its content value.';
		if (Object.keys(errors).length) return fail(400, { publicErrors: errors });
		getServerSettings();
		db.update(serverSettings)
			.set({
				allowPublicPages: form.get('allowPublicPages') === 'on',
				publicHomeEnabled: form.get('publicHomeEnabled') === 'on',
				publicBaseUrl: baseUrl || null,
				ga4Id: ga4 || null,
				consentBanner: form.get('consentBanner') === 'on',
				searchConsoleTag: tag || null
			})
			.where(eq(serverSettings.id, 1))
			.run();
		logger.info('settings', 'Public page settings saved', { userId: locals.user!.id });
		return { publicSaved: true };
	},
	// Sends E5 with what's in the form right now, saved or not.
	test: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const { cfg, errors } = readForm(await request.formData(), storedConfig());
		if (Object.keys(errors).length) return fail(400, { errors, test: null });
		const to = recipient(user, prefsFor(user.id)) ?? (/@.+\./.test(user.email) ? user.email : null);
		if (!to) return fail(400, { errors: {}, test: { ok: false, message: 'Add a notification email in Settings first — this account has no real address.' } });
		const base = baseUrl() ?? '';
		const t = outboxMode() ? { transport: outboxTransport(), from: 'Waterline <waterline@localhost>' } : transportFrom(cfg);
		if (!t) return fail(400, { errors: {}, test: { ok: false, message: 'Fill in the delivery settings first.' } });
		const sent = new Date().toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZoneName: 'short',
			timeZone: user.timeZone
		});
		const r = testEmail({
			host: base ? new URL(base).host : 'this server',
			via: t.transport.describe,
			sent,
			footer: {
				reason: 'Sent because an admin clicked "Send test email".',
				settingsUrl: `${base}/settings#notifications`,
				unsubscribeUrl: `${base}/unsubscribe/${unsubscribeToken(user.id)}`,
				host: base ? new URL(base).host : ''
			}
		});
		try {
			await t.transport.send(t.from, { to, subject: r.subject, html: r.html, text: r.text });
		} catch (e) {
			const message = e instanceof MailError ? e.message : `Sending failed. (${(e as Error).message})`;
			logger.error('email', "The test email didn't send", { userId: user.id, via: t.transport.describe, error: e });
			return fail(502, { errors: {}, test: { ok: false, message } });
		}
		const via = cfg.emailProvider === 'smtp' ? 'your SMTP server' : 'Mailgun';
		logger.info('email', 'Sent a test email', { userId: user.id, via: t.transport.describe });
		return { test: { ok: true, message: `Sent via ${outboxMode() ? 'the outbox' : via} to ${to}. Check your inbox.` } };
	}
};
