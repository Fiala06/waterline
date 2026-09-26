import { fail } from '@sveltejs/kit';
import { str } from '$lib/server/forms';
import { estimateBackupBytes, listExports, startExport } from '$lib/server/export';
import { listTanks } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const tanks = [...listTanks(user.id), ...listTanks(user.id, { archived: true })].map((t) => ({ id: t.id, name: t.name }));
	return {
		exportTanks: tanks,
		defaultTank: currentTankId ?? tanks[0]?.id ?? null,
		estimates: {
			account: estimateBackupBytes(user, 'account', null),
			...Object.fromEntries(tanks.map((t) => [t.id, estimateBackupBytes(user, 'tank', t.id)]))
		} as Record<string, number>,
		exports: listExports(user.id).map((e) => ({
			id: e.id,
			scope: e.scope,
			tankName: tanks.find((t) => t.id === e.tankId)?.name ?? null,
			format: e.format,
			status: e.status,
			progress: e.progress,
			progressText: e.progressText,
			fileName: e.fileName,
			size: e.size,
			summary: e.summary,
			error: e.error,
			createdAt: e.createdAt,
			expiresAt: e.expiresAt
		}))
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const scope = str(form, 'scope') === 'tank' ? 'tank' : 'account';
		const format = str(form, 'format') === 'csv' ? 'csv' : 'zip';
		const tankId = scope === 'tank' ? str(form, 'tankId') : null;
		if (scope === 'tank' && !tankId) return fail(400, { error: 'Choose a tank.' });
		const row = startExport(user, scope, tankId, format);
		return { started: row.id };
	}
};
