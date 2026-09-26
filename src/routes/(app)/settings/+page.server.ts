import { fail, redirect } from '@sveltejs/kit';
import { signOut } from '../../../auth';
import { setFlash } from '$lib/server/flash';
import { parseTimeZone, str } from '$lib/server/forms';
import { updateUser } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ timeZones: Intl.supportedValuesOf('timeZone') });

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
			timeZone: parseTimeZone(str(form, 'timeZone'), user.timeZone),
			theme: theme === 'dark' || theme === 'light' ? theme : 'system'
		});
		cookies.set('wl_theme', theme, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 });
		setFlash(cookies, '✓ Settings saved');
		redirect(303, '/settings');
	},
	signout: (event) => signOut(event)
};
