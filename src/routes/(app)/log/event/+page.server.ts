import { error, fail, redirect } from '@sveltejs/kit';
import { taskKindFor } from '$lib/events';
import { addDays, dateInZone, fmtDate } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { num, optStr, parseWhen } from '$lib/server/forms';
import {
	completableTask,
	eventFormContext,
	parseCategory,
	parseEventData
} from '$lib/server/log-forms';
import { createEvent, recentDosingProducts } from '$lib/server/logs';
import { photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import { createTask, getTask } from '$lib/server/tasks';
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
	const category = parseCategory(url.searchParams.get('category'));
	const date = url.searchParams.get('date');
	const time = url.searchParams.get('time');
	return {
		tank: { id: tank.id, name: tank.name },
		category,
		context: eventFormContext(tank, user),
		when: date && time ? { date, time } : null,
		task: completableTask(user, tank.id, taskKindFor(category), url.searchParams.get('task')),
		recentProducts: category === 'dosing' ? recentDosingProducts(tank.id) : []
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url, cookies }) => {
		const user = locals.user!;
		const tankId = url.searchParams.get('tank');
		if (!tankId) error(400, 'No tank');
		const tank = getTank(user.id, tankId);
		const category = parseCategory(url.searchParams.get('category'));
		const form = await request.formData();
		const values: Record<string, string | string[]> = {};
		for (const k of new Set(form.keys())) {
			const all = form.getAll(k).map(String);
			values[k] = ['actions', 'tags', 'reasons'].includes(k) ? all : all[0];
		}

		const files = photoFiles(form);
		const { data, errors } = parseEventData(category, form, tank, user);
		// A photo on its own is enough for a note.
		if (files.length) {
			delete errors.note;
			delete errors.tags;
			delete errors.actions;
		}
		if (Object.keys(errors).length) return fail(400, { errors, values, error: null });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors, values, error: when.error });
		const prepared = await preparePhotos(files);
		if ('error' in prepared) return fail(400, { errors, values, error: prepared.error });

		const completeTaskId = optStr(form, 'completeTask', 64);
		if (completeTaskId && getTask(user.id, completeTaskId).tankId !== tank.id) error(400, 'Task belongs to another tank');

		// Observation: "Remind me to check again" creates a one-off task.
		const recheck = category === 'observation' ? num(form, 'recheck') : null;
		if (recheck && recheck > 0) data.recheck_at = addDays(dateInZone(when.at, user.timeZone), recheck);

		const { event, duplicate } = createEvent(
			user.id,
			tank.id,
			{ category, occurredAt: when.at, note: optStr(form, 'note'), data, clientId: optStr(form, 'clientId', 64) },
			{ completeTaskId, timeZone: user.timeZone }
		);

		if (!duplicate) storePhotos(tank.id, prepared, { eventId: event.id, takenAt: when.at });

		if (!duplicate && typeof data.recheck_at === 'string') {
			const tags = (data.tags as string[] | undefined) ?? [];
			createTask(user.id, tank.id, {
				name: `Check again: ${tags.length ? tags.join(', ').toLowerCase() : 'observation'}`,
				kind: 'other',
				recurring: false,
				intervalDays: null,
				scheduleMode: 'completion',
				nextDue: data.recheck_at,
				openFormOnDone: false
			});
		}

		let message = '✓ Saved';
		if (category === 'water_change') {
			const next = completeTaskId ? getTask(user.id, completeTaskId).nextDue : null;
			message = `✓ Water change logged${next ? ` · next due ${fmtDate(next)}` : ''}`;
		} else if (category === 'observation' && data.recheck_at) {
			message = `✓ Observation saved · check again ${fmtDate(data.recheck_at as string)}`;
		} else if (category === 'note') {
			message = files.length && !optStr(form, 'note') ? `✓ Photo${files.length === 1 ? '' : 's'} added` : '✓ Note saved';
		} else if (completeTaskId) {
			message = `✓ Saved · task done`;
		}
		setFlash(cookies, message);
		redirect(303, `/?tank=${tank.id}`);
	}
};
