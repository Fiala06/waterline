import { fail, redirect } from '@sveltejs/kit';
import { effectiveDue, intervalText } from '$lib/tasks';
import { addDays, fmtDate, todayInZone } from '$lib/time';
import { consumeActionToken, readActionToken } from '$lib/server/action-tokens';
import { completeTask, snoozeTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// Mark done / Snooze links from reminder emails. GET only shows a confirm page,
// because mail scanners open links; the POST does the work. No sign-in needed.
export const load: PageServerLoad = ({ params }) => {
	const { state, row } = readActionToken(params.token);
	if (!row) return { state, task: null };
	const due = effectiveDue(row.task);
	return {
		state,
		action: row.t.action,
		task: {
			name: row.task.name,
			tankName: row.tank.name,
			due: due ? fmtDate(due) : null,
			repeats: intervalText(row.task)
		}
	};
};

export const actions: Actions = {
	default: ({ params }) => {
		const { state, row } = readActionToken(params.token);
		if (!row || state !== 'ok') return fail(410, { error: state });
		// the setup review (#30) is done on its page, after checking: a Mark done link for one opens it
		if (row.t.action === 'done' && row.task.kind === 'review') redirect(303, `/tanks/${row.task.tankId}/review`);
		if (!consumeActionToken(params.token)) return fail(410, { error: 'used' });
		const tz = row.user.timeZone;
		if (row.t.action === 'done') {
			const done = completeTask(row.user.id, row.task.id, { timeZone: tz });
			return { done: true, message: `✓ ${row.task.name} done`, next: done.nextDue ? fmtDate(done.nextDue) : null };
		}
		const today = todayInZone(tz);
		const due = effectiveDue(row.task) ?? today;
		const until = addDays(due > today ? due : today, 1);
		snoozeTask(row.user.id, row.task.id, until);
		return { done: true, message: `Snoozed ${row.task.name}`, next: fmtDate(until) };
	}
};
