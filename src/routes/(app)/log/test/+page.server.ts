import { error, fail, redirect } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, parseWhen, str } from '$lib/server/forms';
import { completableTask, parseReadings, testFormParams } from '$lib/server/log-forms';
import { createTest, latestReadings } from '$lib/server/logs';
import { photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { alertOutOfRange } from '$lib/server/notifications';
import { getTank, listParams } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const tankId = url.searchParams.get('tank');
	if (!tankId) {
		if (!currentTankId) redirect(303, '/tanks/new');
		url.searchParams.set('tank', currentTankId);
		redirect(303, `${url.pathname}?${url.searchParams}`);
	}
	const tank = getTank(user.id, tankId);
	const date = url.searchParams.get('date');
	const time = url.searchParams.get('time');
	return {
		tank: { id: tank.id, name: tank.name },
		params: testFormParams(listParams(tank.id), latestReadings(tank.id), user),
		when: date && time ? { date, time } : null,
		task: completableTask(user, tank.id, 'test', url.searchParams.get('task')),
		today: todayInZone(user.timeZone)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url, cookies }) => {
		const user = locals.user!;
		const tankId = url.searchParams.get('tank');
		if (!tankId) error(400, 'No tank');
		const tank = getTank(user.id, tankId);
		const form = await request.formData();
		const params = listParams(tank.id);
		const { readings, errors } = parseReadings(form, params, user);
		const values = Object.fromEntries(params.map((p) => [p.id, str(form, `v_${p.id}`)]));
		if (Object.keys(errors).length) return fail(400, { errors, values, error: null });
		if (!readings.size) return fail(400, { errors, values, error: 'Enter at least one reading.' });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors, values, error: when.error });
		const prepared = await preparePhotos(photoFiles(form));
		if ('error' in prepared) return fail(400, { errors, values, error: prepared.error });

		const result = createTest(
			user.id,
			tank.id,
			{ takenAt: when.at, note: optStr(form, 'note'), readings, clientId: optStr(form, 'clientId', 64) },
			{ completeTaskId: optStr(form, 'completeTask', 64), timeZone: user.timeZone }
		);
		if (!result.duplicate) {
			storePhotos(tank.id, prepared, { testId: result.test.id, takenAt: when.at });
			// E4 goes out in the background; a mail problem never blocks saving.
			if (result.outOfRange) alertOutOfRange(user, tank.id, result.test.id).catch((e) => console.error(e));
		}
		const n = result.count;
		setFlash(
			cookies,
			`✓ Saved ${n} reading${n === 1 ? '' : 's'}${result.outOfRange ? ` · ${result.outOfRange} out of range` : ''}`,
			{ view: `/entries/test/${result.test.id}` }
		);
		redirect(303, `/?tank=${tank.id}`);
	}
};
