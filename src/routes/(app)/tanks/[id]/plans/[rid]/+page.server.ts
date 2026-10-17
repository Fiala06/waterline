import { redirect } from '@sveltejs/kit';
import { dueInfo } from '$lib/tasks';
import { fmtDate, isDate, todayInZone } from '$lib/time';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { endPlanEarly, extendPlan, getPlanRun, planStatus, planSteps } from '$lib/server/plans';
import { getTank } from '$lib/server/tanks';
import { inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

// A plan (#177): where it stands, its steps (each a task) and what it held back, with End early and Extend.

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const run = getPlanRun(user.id, params.rid);
	if (run.tankId !== tank.id) redirect(303, `/tanks/${run.tankId}/plans/${run.id}`);
	const today = todayInZone(user.timeZone);
	const steps = planSteps(run.id).map((t) => {
		const due = t.snoozedUntil ?? t.nextDue;
		return { id: t.id, name: t.name, when: due ? dueInfo(due, today, t.graceDays).text : 'Done', level: due ? dueInfo(due, today, t.graceDays).level : 'ok', ends: t.endsOn ? fmtDate(t.endsOn) : null };
	});
	const held = run.pausedTaskIds.length ? db.select({ id: tasks.id, name: tasks.name, until: tasks.pausedUntil }).from(tasks).where(inArray(tasks.id, run.pausedTaskIds)).all() : [];
	return {
		tank: { id: tank.id, name: tank.name },
		run: { ...run, status: planStatus(run, today), started: fmtDate(run.startedOn), ends: fmtDate(run.endsOn) },
		steps,
		held: held.map((h) => ({ ...h, until: h.until ? fmtDate(h.until) : null })),
		today
	};
};

export const actions: Actions = {
	end: async ({ locals, params, cookies }) => {
		const run = endPlanEarly(locals.user!, params.rid);
		setFlash(cookies, `${run.name} ended early`);
		redirect(303, `/tanks/${params.id}/plans/${params.rid}`);
	},
	extend: async ({ request, locals, params, cookies }) => {
		const until = str(await request.formData(), 'until');
		if (!isDate(until)) redirect(303, `/tanks/${params.id}/plans/${params.rid}`);
		extendPlan(locals.user!, params.rid, until);
		setFlash(cookies, `Extended to ${fmtDate(until)}`);
		redirect(303, `/tanks/${params.id}/plans/${params.rid}`);
	}
};
