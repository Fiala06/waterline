import { fail, redirect } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { applyImport, previewImport } from '$lib/server/import';
import { importColumns, validValue, type ImportList, type ImportValue, type LivestockValue } from '$lib/server/import-rows';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

const MAX_BYTES = 1_000_000;

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const list = params.list as ImportList;
	return {
		tank: { id: t.id, name: t.name },
		list,
		columns: importColumns(list, user).map((c) => ({ header: c.header, help: c.help }))
	};
};

/** Spreadsheets save UTF-8; Excel on Windows can still save its own "ANSI" CSV. */
function decode(buf: ArrayBuffer) {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buf);
	} catch {
		return new TextDecoder('windows-1252').decode(buf);
	}
}

export const actions: Actions = {
	/** Read the file and show every row before anything is added. */
	check: async ({ request, locals, params }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id);
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || !file.size) return fail(400, { error: 'Choose a CSV file.' });
		if (file.size > MAX_BYTES) return fail(400, { error: 'That file is over 1 MB. Split it into smaller files.' });
		const preview = previewImport(params.list as ImportList, decode(await file.arrayBuffer()), user, tank);
		if ('error' in preview) return fail(400, { error: preview.error });
		return { preview: { file: file.name, ...preview } };
	},

	import: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id);
		const list = params.list as ImportList;
		const form = await request.formData();
		const today = todayInZone(user.timeZone);
		// the rows come back from the preview as it showed them; check them again
		const values = form.getAll('row').map((raw) => {
			try {
				return validValue(list, JSON.parse(String(raw)), today);
			} catch {
				return null;
			}
		});
		if (!values.length) return fail(400, { error: 'Nothing was ticked. Choose the file again and tick the rows to add.' });
		if (values.some((v) => !v)) return fail(400, { error: 'Some rows changed on the way. Choose the file again.' });
		const ok = values as ImportValue[];
		const { reminders } = applyImport(list, ok, user, tank.id, { reminders: form.get('reminders') === 'on' });
		const n = ok.length;
		const animals = list === 'livestock' ? (ok as LivestockValue[]).reduce((s, l) => s + l.count, 0) : 0;
		const message =
			list === 'livestock'
				? `✓ Imported ${animals} animal${animals === 1 ? '' : 's'} · ${n} species`
				: list === 'plants'
					? `✓ Imported ${n} plant${n === 1 ? '' : 's'}`
					: `✓ Imported ${n} item${n === 1 ? '' : 's'}${reminders ? ` · ${reminders} reminder${reminders === 1 ? '' : 's'} added` : ''}`;
		setFlash(cookies, message);
		redirect(303, `/tanks/${tank.id}/${list}`);
	}
};
