import { fail, redirect } from '@sveltejs/kit';
import { addDays, fmtDate, isDate, todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { safeReturn } from '$lib/server/redirect';
import { clearText } from '$lib/suggestions';
import { getTank, listParams } from '$lib/server/tanks';
import { listTasks, pauseTasks } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// Pause tasks (#172): a blackout, a trip, a dose held back. The tank's tasks,
// all ticked (or the one it was opened for), until a day: not due, not notified,
// and back on their dates moved on when the day comes.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	const today = todayInZone(user.timeZone);
	const only = url.searchParams.get('task');
	const tasks = listTasks(user.id, tank.id).map(({ task }) => ({ id: task.id, name: task.name, due: task.due, checked: !only || only === task.id }));
	// or sooner, until a reading clears (#179): the tank's parameters, "Until ammonia reads 0"
	const clears = listParams(tank.id).map((p) => ({ id: p.id, text: `Until ${clearText(p)}` }));
	return {
		clears,
		param: clears.find((p) => p.id === url.searchParams.get('param'))?.id ?? '',
		tank: { id: tank.id, name: tank.name },
		today,
		until: addDays(today, 3),
		tasks,
		from: safeReturn(url.searchParams.get('from'), '/tasks')
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const today = todayInZone(user.timeZone);
		const until = str(form, 'until');
		const ids = form.getAll('task').map(String);
		const param = str(form, 'param');
		const values = { until, ids, param };
		if (!isDate(until) || until <= today) return fail(400, { error: `Pick a day after ${fmtDate(today)}.`, values });
		const mine = new Set(listTasks(user.id, tank.id).map((r) => r.task.id));
		const chosen = ids.filter((id) => mine.has(id));
		if (!chosen.length) return fail(400, { error: 'Tick the tasks to pause.', values });
		const clears = listParams(tank.id).find((p) => p.id === param);
		const { noteIds } = pauseTasks(user.id, chosen, until, user.timeZone, clears?.id ?? null);
		setFlash(cookies, `Paused ${chosen.length === 1 ? '1 task' : `${chosen.length} tasks`} until ${clears ? clearText(clears) : fmtDate(until)}`, {
			undo: { action: '/tasks?/unpause', name: 'notes', value: noteIds.join(',') }
		});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	}
};
