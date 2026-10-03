import { fail, redirect } from '@sveltejs/kit';
import { fmtValue } from '$lib/params';
import { dateInZone, fmtDate, loggedLine, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, parseWhen, str } from '$lib/server/forms';
import { parseReadings, testFormParams } from '$lib/server/log-forms';
import { getTest, updateTest } from '$lib/server/logs';
import { deleteEntryPhotos, entryPhotos, photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { getTank, listParams } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

function editableParams(tankId: string, readings: Map<string, number>) {
	return listParams(tankId, { all: true }).filter((p) => p.tracked || readings.has(p.id));
}

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const { test, readings, previous } = getTest(user.id, params.id);
	const tank = getTank(user.id, test.tankId, 'log');
	const ps = editableParams(tank.id, readings);
	return {
		entry: { id: test.id, tankId: tank.id, tankName: tank.name, note: test.note ?? '', day: fmtDate(dateInZone(test.takenAt, user.timeZone)) },
		params: testFormParams(ps, new Map(), user, tank.type),
		values: Object.fromEntries(ps.filter((p) => readings.has(p.id)).map((p) => [p.id, fmtValue(p, readings.get(p.id)!, user)])),
		previous: Object.fromEntries(ps.filter((p) => previous.has(p.id)).map((p) => [p.id, fmtValue(p, previous.get(p.id)!, user)])),
		when: utcToZoned(test.takenAt, user.timeZone),
		photos: entryPhotos({ testId: test.id }).map((p) => ({ id: p.id })),
		meta: loggedLine(test.takenAt, test.editedAt, user.timeZone)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const { test, readings: existing } = getTest(user.id, params.id);
		const form = await request.formData();
		const ps = editableParams(test.tankId, existing);
		const { readings, errors } = parseReadings(form, ps, user);
		// A field left as shown keeps its exact stored value (the form shows it rounded).
		for (const p of ps) {
			const old = existing.get(p.id);
			if (old != null && readings.has(p.id) && str(form, `v_${p.id}`) === fmtValue(p, old, user)) readings.set(p.id, old);
		}
		const values = Object.fromEntries(ps.map((p) => [p.id, str(form, `v_${p.id}`)]));
		if (Object.keys(errors).length) return fail(400, { errors, values, error: null });
		if (!readings.size) return fail(400, { errors, values, error: 'Keep at least one reading, or delete the entry.' });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors, values, error: when.error });
		const prepared = await preparePhotos(photoFiles(form));
		if ('error' in prepared) return fail(400, { errors, values, error: prepared.error });
		updateTest(user.id, params.id, { takenAt: when.at, note: optStr(form, 'note'), readings });
		deleteEntryPhotos(user.id, form.getAll('removePhoto').map(String), { testId: test.id });
		storePhotos(test.tankId, prepared, { testId: test.id, takenAt: when.at });
		setFlash(cookies, '✓ Changes saved');
		redirect(303, `/entries/test/${params.id}`);
	}
};
