import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { signOut } from '../../../auth';
import { saveOwnAvatar, setAvatarChoice } from '$lib/server/avatar';
import { db } from '$lib/server/db';
import { notificationPrefs } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { parseTimeZone, str } from '$lib/server/forms';
import { emailConfigured } from '$lib/server/mail';
import { prefsFor } from '$lib/server/notifications';
import { listProducts } from '$lib/server/products';
import { listAssistantTokens } from '$lib/server/assistant/tokens';
import { getFeed, makeFeed, removeFeed } from '$lib/server/calendar';
import { listTanks } from '$lib/server/tanks';
import { updateUser } from '$lib/server/users';
import { isCurrency } from '$lib/money';
import { LEAD_OPTIONS } from '$lib/notify-options';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const prefs = prefsFor(locals.user!.id);
	const feed = getFeed(locals.user!.id);
	return {
		timeZones: Intl.supportedValuesOf('timeZone'),
		prefs: {
			taskReminders: prefs.taskReminders,
			overdueAlerts: prefs.overdueAlerts,
			outOfRangeAlerts: prefs.outOfRangeAlerts,
			delivery: prefs.delivery,
			leadDays: prefs.leadDays,
			sendTime: prefs.sendTime,
			notifyEmail: prefs.notifyEmail ?? '',
			unsubscribedAt: prefs.unsubscribedAt
		},
		emailReady: emailConfigured(),
		products: listProducts(locals.user!.id).length,
		assistants: listAssistantTokens(locals.user!.id).length,
		// the tasks calendar link (#23), and each tank for a link of its own
		calendar: feed ? { url: `${url.origin}/cal/${feed.token}.ics`, lastFetchedAt: feed.lastFetchedAt } : null,
		calendarTanks: listTanks(locals.user!.id).map((t) => ({ id: t.id, name: t.name }))
	};
};

export const actions: Actions = {
	save: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const displayName = str(form, 'displayName').slice(0, 80);
		if (!displayName) return fail(400, { error: 'Enter a display name.' });
		const theme = str(form, 'theme');
		updateUser(user.id, {
			displayName,
			unitSystem: str(form, 'unitSystem') === 'metric' ? 'metric' : 'imperial',
			hardnessUnit: str(form, 'hardnessUnit') === 'ppm' ? 'ppm' : 'dgh',
			currency: isCurrency(str(form, 'currency')) ? str(form, 'currency') : user.currency,
			timeZone: parseTimeZone(str(form, 'timeZone'), user.timeZone),
			theme: theme === 'dark' || theme === 'light' ? theme : 'system'
		});
		cookies.set('wl_theme', theme, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 });
		setFlash(cookies, '✓ Settings saved');
		redirect(303, '/settings');
	},
	// Profile photo: one they upload, back to the Google one, or initials
	photo: async ({ request, locals, cookies }) => {
		const file = (await request.formData()).get('photo');
		const failed = await saveOwnAvatar(locals.user!.id, file instanceof File ? file : new File([], ''));
		if (failed) return fail(400, { photoError: failed.error });
		setFlash(cookies, '✓ Photo saved');
		redirect(303, '/settings#profile');
	},
	googlePhoto: async ({ locals, cookies }) => {
		if (!locals.user!.avatarAt) return fail(400, { photoError: "There's no Google photo for this account." });
		setAvatarChoice(locals.user!.id, 'google');
		setFlash(cookies, '✓ Using your Google photo');
		redirect(303, '/settings#profile');
	},
	removePhoto: async ({ locals, cookies }) => {
		setAvatarChoice(locals.user!.id, 'none');
		setFlash(cookies, '✓ Photo removed');
		redirect(303, '/settings#profile');
	},
	notifications: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const notifyEmail = str(form, 'notifyEmail').slice(0, 200);
		if (notifyEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(notifyEmail)) {
			return fail(400, { notifyError: 'Enter a valid email address.' });
		}
		const delivery = str(form, 'delivery');
		const lead = Number(str(form, 'leadDays'));
		const sendTime = str(form, 'sendTime');
		const on = (k: string) => form.get(k) === 'on';
		const any = on('taskReminders') || on('overdueAlerts') || on('outOfRangeAlerts');
		prefsFor(user.id);
		db.update(notificationPrefs)
			.set({
				taskReminders: on('taskReminders'),
				overdueAlerts: on('overdueAlerts'),
				outOfRangeAlerts: on('outOfRangeAlerts'),
				delivery: delivery === 'daily' || delivery === 'weekly' ? delivery : 'individual',
				leadDays: LEAD_OPTIONS.some((o) => o.days === lead) ? lead : 1,
				sendTime: /^\d{2}:\d{2}$/.test(sendTime) ? sendTime : '08:00',
				notifyEmail: notifyEmail || null,
				// turning any email back on resubscribes
				...(any ? { unsubscribedAt: null } : {})
			})
			.where(eq(notificationPrefs.userId, user.id))
			.run();
		setFlash(cookies, '✓ Notification settings saved');
		redirect(303, '/settings#notifications');
	},
	calendarOn: ({ locals, cookies }) => {
		makeFeed(locals.user!.id);
		setFlash(cookies, '✓ Calendar link made');
		redirect(303, '/settings#calendar');
	},
	calendarNew: ({ locals, cookies }) => {
		makeFeed(locals.user!.id);
		setFlash(cookies, '✓ New calendar link: the old one no longer works');
		redirect(303, '/settings#calendar');
	},
	calendarOff: ({ locals, cookies }) => {
		removeFeed(locals.user!.id);
		setFlash(cookies, 'Calendar link turned off');
		redirect(303, '/settings#calendar');
	},
	signout: (event) => signOut(event)
};
