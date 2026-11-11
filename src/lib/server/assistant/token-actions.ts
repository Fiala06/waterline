// The Create, Tanks and Revoke actions of a page of tokens (#268): AI assistant
// access tokens and sensor tokens are the same rows of a different kind, so their
// pages share these. A token only ever reaches the keeper's own tanks.
import { fail, redirect, type Cookies } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { createAssistantToken, listAssistantTokens, MAX_TOKENS, ownTanks, revokeAssistantToken, setTokenTanks } from './tokens';

interface Options {
	kind: 'assistant' | 'sensor';
	/** the page the actions come back to */
	page: string;
	/** "Access token", "Sensor token": for the log */
	label: string;
	/** a device must be named (sensors): what to say when it isn't */
	nameRequired?: string;
	/** the note once it's revoked: "Claude can't read your tanks any more" */
	revoked: (name: string) => string;
}

/** What an action is called with, as much of it as these need. */
interface Event {
	request: Request;
	locals: App.Locals;
	cookies: Cookies;
}

/** The ticked tanks that are the keeper's own: the only ones a token can reach. */
const picked = (form: FormData, userId: string) => ownTanks(userId, form.getAll('tank').map(String));

export function tokenActions(o: Options) {
	return {
		create: async ({ request, locals }: Event) => {
			const user = locals.user!;
			const form = await request.formData();
			const name = str(form, 'name').slice(0, 60);
			const tankIds = picked(form, user.id);
			const errors: Record<string, string> = {};
			if (!name && o.nameRequired) errors.name = o.nameRequired;
			if (!tankIds.length) errors.tanks = 'Pick at least one tank.';
			if (listAssistantTokens(user.id, o.kind).length >= MAX_TOKENS) errors.name = `That's ${MAX_TOKENS} already: revoke one you don't use first.`;
			if (Object.keys(errors).length) return fail(400, { create: { errors, name, tankIds } });
			const { token, row } = createAssistantToken(user.id, name, tankIds, o.kind);
			logger.info('assistant', `${o.label} "${row.name}" made`, { userId: user.id });
			// shown this once: the page renders it from the action's result
			return { created: { id: row.id, name: row.name, token, tankId: row.tankIds[0] ?? '' } };
		},
		tanks: async ({ request, locals, cookies }: Event) => {
			const form = await request.formData();
			const id = str(form, 'id');
			const tankIds = picked(form, locals.user!.id);
			if (!tankIds.length) return fail(400, { edit: { id, errors: { tanks: 'Pick at least one tank, or revoke it.' } } });
			const row = setTokenTanks(locals.user!.id, id, tankIds);
			if (row) setFlash(cookies, `✓ ${row.name} saved`);
			redirect(303, o.page);
		},
		revoke: async ({ request, locals, cookies }: Event) => {
			const form = await request.formData();
			const row = revokeAssistantToken(locals.user!.id, str(form, 'id'));
			if (row) {
				logger.info('assistant', `${o.label} "${row.name}" revoked`, { userId: locals.user!.id });
				setFlash(cookies, o.revoked(row.name));
			}
			redirect(303, o.page);
		}
	};
}
