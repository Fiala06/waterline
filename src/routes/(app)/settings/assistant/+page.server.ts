import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { listTanks } from '$lib/server/tanks';
import { createAssistantToken, listAssistantTokens, MAX_TOKENS, revokeAssistantToken, setTokenTanks } from '$lib/server/assistant/tokens';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const tanks = [...listTanks(user.id), ...listTanks(user.id, { archived: true })].map((t) => ({ id: t.id, name: t.name, archived: !!t.archivedAt }));
	const names = new Map(tanks.map((t) => [t.id, t.name]));
	return {
		tanks,
		tokens: listAssistantTokens(user.id).map((t) => ({
			id: t.id,
			name: t.name,
			hint: t.hint,
			// connected by signing in (OAuth), rather than a pasted token
			bySignIn: !!t.clientId,
			createdAt: t.createdAt,
			lastUsedAt: t.lastUsedAt,
			tankIds: t.tankIds.filter((id) => names.has(id)),
			tankNames: t.tankIds.flatMap((id) => names.get(id) ?? [])
		})),
		mcpUrl: `${url.origin}/mcp`,
		apiUrl: `${url.origin}/api/v1`,
		// without scripts, "Tanks" is a link that opens that token's tanks
		edit: url.searchParams.get('edit')
	};
};

const picked = (form: FormData) => form.getAll('tank').map(String);

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 60);
		const tankIds = picked(form);
		const errors: Record<string, string> = {};
		if (!tankIds.length) errors.tanks = 'Pick at least one tank.';
		if (listAssistantTokens(user.id).length >= MAX_TOKENS) errors.name = `That's ${MAX_TOKENS} already: revoke one you don't use first.`;
		if (Object.keys(errors).length) return fail(400, { create: { errors, name, tankIds } });
		const { token, row } = createAssistantToken(user.id, name, tankIds);
		logger.info('assistant', `Access token "${row.name}" made`, { userId: user.id });
		// shown this once: the page renders it from the action's result
		return { created: { id: row.id, name: row.name, token } };
	},
	tanks: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		const tankIds = picked(form);
		if (!tankIds.length) return fail(400, { edit: { id, errors: { tanks: 'Pick at least one tank, or revoke it.' } } });
		const row = setTokenTanks(locals.user!.id, id, tankIds);
		if (row) setFlash(cookies, `✓ ${row.name} saved`);
		redirect(303, '/settings/assistant');
	},
	revoke: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const row = revokeAssistantToken(locals.user!.id, str(form, 'id'));
		if (row) {
			logger.info('assistant', `Access token "${row.name}" revoked`, { userId: locals.user!.id });
			setFlash(cookies, `${row.name} can't read your tanks any more`);
		}
		redirect(303, '/settings/assistant');
	}
};
