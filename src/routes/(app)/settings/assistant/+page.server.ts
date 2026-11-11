import { listTanks } from '$lib/server/tanks';
import { listAssistantTokens } from '$lib/server/assistant/tokens';
import { tokenActions } from '$lib/server/assistant/token-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const tanks = // a token reads the keeper's own tanks only, so those are the ones to pick from
[...listTanks(user.id, { own: true }), ...listTanks(user.id, { own: true, archived: true })].map((t) => ({ id: t.id, name: t.name, archived: !!t.archivedAt }));
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

export const actions: Actions = tokenActions({
	kind: 'assistant',
	page: '/settings/assistant',
	label: 'Access token',
	revoked: (name) => `${name} can't read your tanks any more`
});
