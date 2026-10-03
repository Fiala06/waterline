// The Accept link from an invitation email (#27): shows who invited them and
// starts Sign in with Google, which accepts the invitation for that address.
// Nothing is changed on GET: mail scanners open links.
import { redirect } from '@sveltejs/kit';
import { devLoginEnabled, googleEnabled } from '../../../auth';
import { readInvite } from '$lib/server/invites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const found = readInvite(params.token);
	// already in: nothing to accept
	if (locals.user && found?.invite.email === locals.user.email) redirect(303, '/');
	return {
		state: found?.state ?? ('missing' as const),
		email: found?.invite.email ?? null,
		inviter: found?.inviter || 'An admin',
		host: url.host,
		google: googleEnabled(),
		dev: devLoginEnabled(),
		signedInAs: locals.user?.email ?? null
	};
};
