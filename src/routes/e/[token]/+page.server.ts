import { fail, redirect } from '@sveltejs/kit';
import { effectiveDue, intervalText } from '$lib/tasks';
import { addDays, fmtDate, todayInZone } from '$lib/time';
import { consumeActionToken, readActionToken } from '$lib/server/action-tokens';
import { completeTask, snoozeTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// Mark done / Snooze links from reminder emails. GET only shows a confirm page,
// because mail scanners open links; the POST does the work. No sign-in needed.
// The link acts as the person the reminder was sent to (#216), for as long as
// they may still log on the tank: History says who marked it done.
// A tank's grouped push (#180) joins its tasks' Snooze links with "." (never in
// a token): Snooze all snoozes each that's still current, and nothing else.

/** The links a joined address carries: snooze links only, the ones still good, and how the rest stand. */
function joined(token: string) {
	const reads = token
		.split('.')
		.slice(0, 50)
		.map((t) => ({ t, ...readActionToken(t) }));
	const ok = reads.filter((r) => r.state === 'ok' && r.row?.t.action === 'snooze');
	return { ok, first: reads.find((r) => r.row)?.state ?? 'missing' };
}

export const load: PageServerLoad = ({ params }) => {
	if (params.token.includes('.')) {
		const { ok, first } = joined(params.token);
		if (!ok.length) return { state: first === 'ok' ? 'stale' : first, task: null };
		return {
			state: 'ok' as const,
			action: 'snooze' as const,
			many: ok.map((r) => r.row!.task.name),
			task: { name: `${ok.length} tasks`, tankName: ok[0].row!.tank.name, due: null, repeats: '' }
		};
	}
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
		if (params.token.includes('.')) {
			const { ok, first } = joined(params.token);
			let n = 0;
			for (const { t, row } of ok) {
				if (!consumeActionToken(t)) continue;
				const today = todayInZone(row!.user.timeZone);
				const due = effectiveDue(row!.task) ?? today;
				snoozeTask(row!.user.id, row!.task.id, addDays(due > today ? due : today, 1));
				n++;
			}
			if (!n) return fail(410, { error: ok.length ? 'used' : first === 'ok' ? 'stale' : first });
			return { done: true, message: `Snoozed ${n} task${n === 1 ? '' : 's'} for a day`, next: null };
		}
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
