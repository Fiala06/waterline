import { redirect } from '@sveltejs/kit';
import { addDays, todayInZone } from '$lib/time';
import { isSuggestionRule, SUGGESTION_RULES } from '$lib/suggestions';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { latestReadings } from '$lib/server/logs';
import { safeReturn } from '$lib/server/redirect';
import { setSuggestion, tankSuggestions } from '$lib/server/suggestions';
import { getTank } from '$lib/server/tanks';
import { getTask, setTempCadence } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// Suggested steps (#179): the rules behind them with their sources, each on or
// off for this tank; and the steps themselves, taken with a tap from a test's
// page or Needs attention, never on their own.

/** How long a water change every 2 days runs at most when the reading never clears. */
const CLEAR_WITHIN = 14;

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	return {
		tank: { id: tank.id, name: tank.name },
		rules: SUGGESTION_RULES.map((r) => ({ ...r, on: !tank.suggestionsOff.includes(r.id) })),
		from: safeReturn(url.searchParams.get('from'), `/tanks/${tank.id}/settings`)
	};
};

export const actions: Actions = {
	/** The rules on and off for this tank, from the page */
	save: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'owner');
		const on = new Set((await request.formData()).getAll('rule').map(String));
		for (const r of SUGGESTION_RULES) setSuggestion(tank.id, r.id, on.has(r.id));
		setFlash(cookies, '✓ Suggested steps saved');
		redirect(303, `/tanks/${tank.id}/suggestions`);
	},
	/** Take a suggested step: the water change every 2 days until the reading clears */
	apply: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const back = safeReturn(form.get('from'), `/?tank=${tank.id}`);
		const latest = new Map([...latestReadings(tank.id)].map(([id, r]) => [id, r.value]));
		// still suggested on the latest readings, or it's no longer the step to take
		const s = tankSuggestions(user, tank, latest).find((x) => x.rule === str(form, 'rule') && x.paramId === str(form, 'param'));
		if (!s || !('action' in s)) {
			setFlash(cookies, 'That step no longer applies');
			redirect(303, back);
		}
		const today = todayInZone(user.timeZone);
		setTempCadence(user.id, s.action.taskId, { intervalDays: s.action.every, until: addDays(today, CLEAR_WITHIN), untilParamId: s.paramId }, user.timeZone);
		setFlash(cookies, `✓ ${getTask(user.id, s.action.taskId).name}: ${s.action.label.replace(/^Water change /, '')}`);
		redirect(303, back);
	},
	/** Don't suggest this for the tank, with Undo */
	off: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'owner');
		const form = await request.formData();
		const rule = str(form, 'rule');
		if (isSuggestionRule(rule)) setSuggestion(tank.id, rule, false);
		setFlash(cookies, `Won’t suggest that for ${tank.name}`, { undo: { action: `/tanks/${tank.id}/suggestions?/on`, name: 'rule', value: rule } });
		redirect(303, safeReturn(form.get('from'), `/?tank=${tank.id}`));
	},
	on: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'owner');
		const form = await request.formData();
		const rule = str(form, 'rule');
		if (isSuggestionRule(rule)) setSuggestion(tank.id, rule, true);
		setFlash(cookies, 'Undid it');
		redirect(303, safeReturn(form.get('from'), `/?tank=${tank.id}`));
	}
};
