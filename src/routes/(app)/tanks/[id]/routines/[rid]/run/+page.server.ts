import { FAVORITE_KIND_LABEL } from '$lib/favorites';
import { afterStep, runHref, runState, runSummary, stepHref, stepSub } from '$lib/routines';
import { getRoutine, stepsOf } from '$lib/server/routines';
import { getTank } from '$lib/server/tanks';
import { unitLabel } from '$lib/units';
import type { PageServerLoad } from './$types';

// Running a maintenance routine (#92): one step at a time, Log it or Skip,
// the run's state in the address (so it works without scripts and comes back
// right after the form). Each logged step is an ordinary History entry.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	const routine = getRoutine(tank.id, params.rid);
	const steps = stepsOf(routine);
	const base = `/tanks/${tank.id}/routines/${routine.id}/run`;
	const state = runState(url.searchParams, steps.length);
	const volUnit = unitLabel('volume', user);
	const current = steps[state.i];
	return {
		tank: { id: tank.id, name: tank.name },
		routine: { id: routine.id, name: routine.name },
		summary: runSummary(state, steps.length),
		over: state.i >= steps.length,
		current: current
			? {
					label: current.label,
					kind: current.kind,
					kindLabel: FAVORITE_KIND_LABEL[current.kind],
					sub: stepSub(current, volUnit),
					// the log form filled in, coming back here with this step counted as done
					logHref: stepHref(current, tank.id, base, state),
					skipHref: runHref(base, afterStep(state, false))
				}
			: null,
		steps: steps.map((s, i) => ({
			label: s.label,
			kind: s.kind,
			status: state.done.includes(i) ? 'done' : state.skipped.includes(i) ? 'skipped' : i === state.i ? 'next' : 'later'
		})),
		logged: state.done.length,
		skipped: state.skipped.length,
		againHref: base
	};
};
