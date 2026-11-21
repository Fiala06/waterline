// A test of a source (#315): the tank's tracked parameters, in its units,
// every field optional. It's kept with the source, never as a tank reading.
import { redirect } from '@sveltejs/kit';
import { paramDecimals, paramUnit, shortName } from '$lib/params';
import { isDate, todayInZone, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, refuse, str } from '$lib/server/forms';
import { parseReadings } from '$lib/server/log-forms';
import { listParams } from '$lib/server/tanks';
import { SOURCE_KIND_LABEL, addSourceTest, getSource } from '$lib/server/water-sources';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const source = getSource(user.id, params.id, params.sid);
	return {
		back: `/tanks/${params.id}/source-water`,
		source: { id: source.id, name: source.name, kind: SOURCE_KIND_LABEL[source.kind] },
		today: todayInZone(user.timeZone),
		params: listParams(params.id).map((p) => ({ id: p.id, name: shortName(p), unit: paramUnit(p, user), decimals: paramDecimals(p, user) }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const source = getSource(user.id, params.id, params.sid);
		const form = await request.formData();
		const { readings, errors } = parseReadings(form, listParams(params.id), user);
		const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
		if (Object.keys(errors).length) return refuse('test', errors, values);
		if (!readings.size) return refuse('test', 'Enter at least one reading.', values);
		// the day it was tested: today is now, an earlier day its midday
		const date = str(form, 'date');
		const today = todayInZone(user.timeZone);
		if (date && (!isDate(date) || date > today)) return refuse('test', "Choose today or a day that's passed.", values);
		const takenAt = !date || date === today ? new Date().toISOString() : zonedToUtc(date, '12:00', user.timeZone).toISOString();
		addSourceTest(user.id, params.id, source.id, { takenAt, note: optStr(form, 'note', 2000), readings });
		setFlash(cookies, `✓ ${source.name} tested · ${readings.size} reading${readings.size === 1 ? '' : 's'}`);
		redirect(303, `/tanks/${params.id}/source-water`);
	}
};
