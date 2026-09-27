import { error, fail, redirect } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, parseWhen, str } from '$lib/server/forms';
import { completableTask, parseEventData, parseReadings, testFormParams, testWaterChange } from '$lib/server/log-forms';
import { createEvent, createTest, latestReadings } from '$lib/server/logs';
import { photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { alertOutOfRange } from '$lib/server/notifications';
import { getTank, listParams } from '$lib/server/tanks';
import { getTask } from '$lib/server/tasks';
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
	const params = testFormParams(listParams(tank.id), latestReadings(tank.id), user);
	return {
		tank: { id: tank.id, name: tank.name },
		params,
		// "Use last readings" without scripts: the form comes back filled in
		filled:
			url.searchParams.get('fill') === 'last'
				? Object.fromEntries(params.filter((p) => p.lastInput != null).map((p) => [p.id, p.lastInput!]))
				: null,
		when: date && time ? { date, time } : null,
		task: completableTask(user, tank.id, 'test', url.searchParams.get('task')),
		waterChange: testWaterChange(tank, user),
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
		// "Also log a water change" (05, 08): its own entry, at the time of the test
		const withWc = form.get('wc') === '1';
		const wc = withWc ? parseEventData('water_change', form, tank, user) : null;
		const back = {
			values,
			wc: { on: withWc, amountMode: str(form, 'amountMode') || 'percent', amount: str(form, 'amount'), source: str(form, 'source') || 'tap' }
		};
		if (wc) Object.assign(errors, wc.errors);
		if (Object.keys(errors).length) return fail(400, { ...back, errors, error: null });
		if (!readings.size) return fail(400, { ...back, errors, error: 'Enter at least one reading.' });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { ...back, errors, error: when.error });
		const prepared = await preparePhotos(photoFiles(form));
		if ('error' in prepared) return fail(400, { ...back, errors, error: prepared.error });
		const wcTaskId = wc ? optStr(form, 'wcCompleteTask', 64) : null;
		if (wcTaskId && getTask(user.id, wcTaskId).tankId !== tank.id) error(400, 'Task belongs to another tank');

		const clientId = optStr(form, 'clientId', 64);
		const result = createTest(
			user.id,
			tank.id,
			{ takenAt: when.at, note: optStr(form, 'note'), readings, clientId },
			{ completeTaskId: optStr(form, 'completeTask', 64), timeZone: user.timeZone }
		);
		if (!result.duplicate) {
			storePhotos(tank.id, prepared, { testId: result.test.id, takenAt: when.at });
			// E4 goes out in the background; a mail problem never blocks saving.
			if (result.outOfRange) alertOutOfRange(user, tank.id, result.test.id).catch((e) => console.error(e));
		}
		if (wc) {
			// a replayed offline entry finds the change it already made by the same id
			createEvent(
				user.id,
				tank.id,
				{ category: 'water_change', occurredAt: when.at, note: null, data: wc.data, clientId: clientId && `${clientId}:wc` },
				{ completeTaskId: wcTaskId, timeZone: user.timeZone }
			);
		}
		const n = result.count;
		setFlash(
			cookies,
			`✓ Saved ${n} reading${n === 1 ? '' : 's'}${wc ? ' + water change' : ''}${result.outOfRange ? ` · ${result.outOfRange} out of range` : ''}`,
			{ view: `/entries/test/${result.test.id}` }
		);
		redirect(303, `/?tank=${tank.id}`);
	}
};
