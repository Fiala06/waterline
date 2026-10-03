// Settings › Test kits (#21): the steps of each test and its waits, from a
// preset or typed in, which the water test form runs with a timer.
import { fail, redirect } from '@sveltejs/kit';
import { fmtDuration, KIT_PARAMS, KIT_PRESETS, kitLine, kitParamName, kitSeconds, stepsText } from '$lib/kits';
import { setFlash } from '$lib/server/flash';
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

export const actions: Actions = {
	add: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const { errors, input } = parseKit(form);
		if (Object.keys(errors).length) return fail(400, { add: { errors, values: values(form) } });
		const k = addKit(locals.user!.id, input);
		setFlash(cookies, `✓ ${k.name} saved`);
		redirect(303, '/settings/test-kits');
	},
	update: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		const { errors, input } = parseKit(form);
		if (Object.keys(errors).length) return fail(400, { edit: { id, errors, values: values(form) } });
		const k = updateKit(locals.user!.id, id, input);
		setFlash(cookies, `✓ ${k.name} saved`);
		redirect(303, '/settings/test-kits');
	},
	delete: async ({ request, locals, cookies }) => {
		const id = str(await request.formData(), 'id');
		const k = deleteKit(locals.user!.id, getKit(locals.user!.id, id).id);
		setFlash(cookies, `${k.name} deleted`);
		redirect(303, '/settings/test-kits');
	}
};
