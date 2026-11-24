import { redirect } from '@sveltejs/kit';
import { BACKUP_EXCLUDES, BACKUP_INCLUDES, BACKUP_NOT_RESTORED } from '$lib/backup';
import { setFlash } from '$lib/server/flash';
import { discardRestore, previewRestore, restoreBackup, RestoreError } from '$lib/server/restore';
import { refuse, str } from '$lib/server/forms';
import { estimateBackupSizes, listExports, startExport } from '$lib/server/export';
import { listTanks } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const tanks = [...listTanks(user.id, { own: true }), ...listTanks(user.id, { archived: true, own: true })].map((t) => ({ id: t.id, name: t.name }));
	const sizes = await estimateBackupSizes(user);
	return {
		// what a backup holds, restores and leaves out (#306)
		manifest: { includes: BACKUP_INCLUDES, notRestored: BACKUP_NOT_RESTORED, excludes: BACKUP_EXCLUDES },
		exportTanks: tanks,
		// ?tank=: a backup of that tank, as Delete tank links it (#304)
		pickedTank: tanks.find((t) => t.id === url.searchParams.get('tank'))?.id ?? null,
		defaultTank: currentTankId ?? tanks[0]?.id ?? null,
		estimates: { account: sizes.account, ...Object.fromEntries(tanks.map((t) => [t.id, sizes.tanks.get(t.id) ?? 0])) } as Record<string, number>,
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
	// Restore a backup (#306): the ZIP is read and kept, and what's in it shown, before anything is added
	restorePreview: async ({ request, locals }) => {
		const file = (await request.formData()).get('backup');
		if (!(file instanceof File) || !file.size) return refuse('restore', 'Choose a backup ZIP.');
		try {
			return { restore: previewRestore(locals.user!, Buffer.from(await file.arrayBuffer())) };
		} catch (e) {
			if (e instanceof RestoreError) return refuse('restore', e.message);
			throw e;
		}
	},
	restore: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const token = str(form, 'token');
		const picked = form.getAll('tank').map(String);
		let made: { id: string; name: string }[];
		try {
			made = await restoreBackup(locals.user!, token, picked);
		} catch (e) {
			if (e instanceof RestoreError) return refuse('restore', e.message);
			throw e;
		}
		setFlash(cookies, `✓ Restored ${made.length === 1 ? made[0].name : `${made.length} tanks`}`);
		redirect(303, `/?tank=${made[0].id}`);
	},
	restoreCancel: async ({ request, locals }) => {
		discardRestore(locals.user!, str(await request.formData(), 'token'));
		return { restoreCancelled: true };
	},
	build: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const scope = str(form, 'scope') === 'tank' ? 'tank' : 'account';
		const format = str(form, 'format') === 'csv' ? 'csv' : 'zip';
		const tankId = scope === 'tank' ? str(form, 'tankId') : null;
		if (scope === 'tank' && !tankId) return refuse('export', 'Choose a tank.');
		const row = startExport(user, scope, tankId, format);
		return { started: row.id };
	}
};
