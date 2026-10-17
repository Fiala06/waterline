import { error, fail, redirect } from '@sveltejs/kit';
import { planTemplate, validStep, type PlanStep } from '$lib/plans';
import { todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { num, str } from '$lib/server/forms';
import { startPlan } from '$lib/server/plans';
import { getTank } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// Start a plan (#177): the starter's steps to keep, rename or re-time, and the
// tank's routines to hold back for its first days. Nothing is saved until Start.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const t = planTemplate(url.searchParams.get('t'));
	if (!t) redirect(303, `/tanks/${tank.id}/plans`);
	const entry = url.searchParams.get('entry');
	return {
		tank: { id: tank.id, name: tank.name },
		today: todayInZone(user.timeZone),
		template: t,
		// the routines it can hold back, ticked when they're of the kinds it pauses
		routines: listTasks(user.id, tank.id).map(({ task }) => ({ id: task.id, name: task.name, checked: !!t.pause?.kinds.includes(task.kind) })),
		entry: entry && /^[\w-]{1,64}$/.test(entry) ? entry : null
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const t = planTemplate(str(form, 't'));
		if (!t) error(400, 'Pick a plan');
		const kept = new Set(form.getAll('keep').map(String));
		const names = form.getAll('name').map(String);
		const froms = form.getAll('from').map(Number);
		const tos = form.getAll('to').map(Number);
		const everys = form.getAll('every').map(Number);
		const steps: PlanStep[] = t.steps
			.map((s, i) => ({ ...s, name: (names[i] ?? s.name).slice(0, 80), from: froms[i], to: tos[i], every: everys[i], i }))
			.filter((s) => kept.has(String(s.i)))
			.map(({ i: _i, ...s }) => s);
		if (!steps.length) return fail(400, { error: 'Keep at least one step.' });
		if (!steps.every(validStep)) return fail(400, { error: 'Each step needs a name, and days from 1 with the last on or after the first.' });
		const pauseDays = num(form, 'pauseDays') ?? 0;
		if (pauseDays < 0 || pauseDays > 60 || !Number.isInteger(pauseDays)) return fail(400, { error: 'Hold routines back for 0 to 60 days.' });
		const run = startPlan(user, tank.id, {
			template: t.key,
			name: str(form, 'planName').slice(0, 80) || t.name,
			steps,
			pauseIds: form.getAll('pause').map(String),
			pauseDays,
			fromEventId: str(form, 'entry') || null
		});
		setFlash(cookies, `✓ ${run.name} started`);
		redirect(303, `/tanks/${tank.id}/plans/${run.id}`);
	}
};
