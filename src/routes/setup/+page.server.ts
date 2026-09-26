import { fail, redirect } from '@sveltejs/kit';
import { parseTimeZone, str } from '$lib/server/forms';
import { updateUser } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const u = locals.user!;
	return {
		displayName: u.displayName,
		unitSystem: u.unitSystem,
		hardnessUnit: u.hardnessUnit,
		timeZone: u.timeZone,
		timeZoneSet: u.setupDone,
		timeZones: Intl.supportedValuesOf('timeZone')
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const displayName = str(form, 'displayName').slice(0, 80);
		if (!displayName) return fail(400, { error: 'Enter a display name.' });
		const unitSystem = str(form, 'unitSystem') === 'metric' ? 'metric' : 'imperial';
		const hardnessUnit = str(form, 'hardnessUnit') === 'ppm' ? 'ppm' : 'dgh';
		const timeZone = parseTimeZone(str(form, 'timeZone'), user.timeZone);
		updateUser(user.id, { displayName, unitSystem, hardnessUnit, timeZone, setupDone: true });
		redirect(303, str(form, 'next') === 'skip' ? '/' : '/setup/tank');
	}
};
