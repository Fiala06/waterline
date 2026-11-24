// Settings › Test kits (#21): the steps of each test and its waits, from a
// preset or typed in, which the water test form runs with a timer.
import { crudActions } from '$lib/server/crud-actions';
import { fmtDuration, KIT_PARAMS, KIT_PRESETS, kitLine, kitParamName, kitSeconds, stepsText } from '$lib/kits';
import { str } from '$lib/server/forms';
import { addKit, deleteKit, getKit, listKits, parseKit, updateKit } from '$lib/server/kits';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const preset = KIT_PRESETS.find((k) => k.id === url.searchParams.get('preset'));
	return {
		kits: listKits(user.id).map((k) => ({
			id: k.id,
			name: k.name,
			paramKey: k.paramKey,
			param: kitParamName(k.paramKey),
			line: kitLine(k),
			takes: kitSeconds(k) ? fmtDuration(kitSeconds(k)) : null,
			stepsText: stepsText(k.steps)
		})),
		presets: KIT_PRESETS.map((k) => ({ id: k.id, name: k.name, maker: k.maker, param: kitParamName(k.paramKey), takes: kitSeconds(k) ? fmtDuration(kitSeconds(k)) : null })),
		params: KIT_PARAMS,
		// ?preset=api-no3 fills the add form from a preset (a link, so it works without scripts)
		prefill: preset ? { name: preset.name, paramKey: preset.paramKey, stepsText: stepsText(preset.steps) } : null,
		edit: url.searchParams.get('edit')
	};
};

const values = (form: FormData) => ({ name: str(form, 'name'), paramKey: str(form, 'paramKey'), customName: str(form, 'customName'), stepsText: String(form.get('steps') ?? '') });

export const actions: Actions = crudActions({
	page: '/settings/test-kits',
	parse: (form) => parseKit(form),
	values,
	add: addKit,
	update: updateKit,
	remove: (userId, id) => deleteKit(userId, getKit(userId, id).id),
	name: (k) => k.name
});
