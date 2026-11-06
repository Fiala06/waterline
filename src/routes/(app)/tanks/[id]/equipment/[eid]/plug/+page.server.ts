import { error, fail, redirect } from '@sveltejs/kit';
import { equipmentName } from '$lib/equipment';
import { plugText } from '$lib/plugs';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { linkPlug, parsePlugUrl, PlugError, plugOf, plugsOff, pollPlug, reportBase, unlinkPlug } from '$lib/server/plugs';
import { runText } from '$lib/events';
import { getEquipment } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import { fmtWhen } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

// Smart plug (#203): tie an item to the Shelly plug it runs from, so its state
// follows the plug and Pause and Resume switch it. The tank's owner's to set.

function item(locals: App.Locals, params: { id: string; eid: string }) {
	const user = locals.user!;
	getTank(user.id, params.id, 'owner');
	const e = getEquipment(user.id, params.eid);
	if (e.tankId !== params.id || e.removedAt) error(404, 'Equipment not found');
	return e;
}

export const load: PageServerLoad = ({ locals, params }) => {
	const e = item(locals, params);
	const p = plugOf(e.id);
	const tz = locals.user!.timeZone;
	return {
		item: { id: e.id, name: equipmentName(e), tankId: e.tankId, paused: !!e.pausedAt, doser: e.type === 'doser' },
		// where the plug reports each switch (#205): Waterline's own address unless one is given
		origin: reportBase({ reportUrl: null }),
		off: plugsOff(),
		plug: p
			? {
					url: p.url,
					name: p.name,
					hasPassword: p.hasPassword,
					status: plugText(p),
					// its runs reported (#205): set up on the plug, or why not
					reports: p.hooksAt ? '✓ The plug tells Waterline each time it switches' : `✕ ${p.hooksError ?? 'Not set up'}`,
					reportsOk: !!p.hooksAt,
					reportUrl: p.reportUrl,
					autoOff: p.autoOffS ? `Switches itself off after ${runText(p.autoOffS)}` : null,
					error: p.lastError,
					checked: p.lastPolledAt ? fmtWhen(p.lastPolledAt, tz) : null,
					lastOk: p.lastOkAt ? fmtWhen(p.lastOkAt, tz) : null
				}
			: null
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const e = item(locals, params);
		const form = await request.formData();
		const raw = str(form, 'url');
		const password = str(form, 'password');
		const url = parsePlugUrl(raw);
		const rawReport = str(form, 'reportUrl');
		const reportUrl = rawReport ? parsePlugUrl(rawReport) : null;
		const values = { url: raw, reportUrl: rawReport };
		if (!url) return fail(400, { error: 'Enter the plug’s address, such as 192.168.1.40.', values });
		if (rawReport && !reportUrl) return fail(400, { error: 'Enter Waterline’s address as the plug can reach it, such as http://192.168.1.10:3000.', values });
		try {
			const p = await linkPlug(locals.user!.id, e.id, { url, password: password || null, reportUrl });
			setFlash(cookies, `✓ ${equipmentName(e)} runs from ${p.name ?? 'its plug'} · ${plugText(p).text}`);
		} catch (err) {
			if (err instanceof PlugError) return fail(400, { error: `${err.message}. Check the address, and the password if you set one in the Shelly app.`, values });
			throw err;
		}
		redirect(303, `/tanks/${params.id}/equipment/${e.id}/plug`);
	},
	check: async ({ locals, params, cookies }) => {
		const e = item(locals, params);
		const p = plugOf(e.id);
		if (!p) redirect(303, `/tanks/${params.id}/equipment/${e.id}/plug`);
		const r = await pollPlug(p.id);
		setFlash(cookies, r.ok ? `✓ ${plugText(plugOf(e.id)!).text}` : `✕ ${r.error}`);
		redirect(303, `/tanks/${params.id}/equipment/${e.id}/plug`);
	},
	unlink: async ({ locals, params, cookies }) => {
		const e = item(locals, params);
		await unlinkPlug(locals.user!.id, e.id);
		setFlash(cookies, `${equipmentName(e)} no longer follows its plug`);
		redirect(303, `/tanks/${params.id}/equipment`);
	}
};
