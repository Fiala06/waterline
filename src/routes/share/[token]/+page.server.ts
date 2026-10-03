// The Accept link from a shared tank's email (#22): who shared what, and Sign
// in with Google to accept. Signed in as that address already, it's accepted
// here and the tank opens. Nothing changes on GET: mail scanners open links.
import { redirect } from '@sveltejs/kit';
import { devLoginEnabled, googleEnabled } from '../../../auth';
import { acceptMemberInvites, readMemberToken } from '$lib/server/members';
import { logger } from '$lib/server/log';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const found = readMemberToken(params.token);
	if (found && locals.user && found.member.email === locals.user.email && found.state === 'accepted') redirect(303, `/?tank=${found.tank.id}`);
	return {
		state: found?.state ?? ('missing' as const),
		email: found?.member.email ?? null,
		inviter: found?.inviter || 'Someone',
		tankName: found?.tank.name ?? null,
		role: found?.member.role ?? null,
		host: url.host,
		google: googleEnabled(),
		dev: devLoginEnabled(),
		signedInAs: locals.user?.email ?? null,
		// signed in as the invited address: Accept is one tap
		canAccept: !!found && found.state === 'pending' && locals.user?.email === found.member.email,
		here: url.pathname
	};
};

export const actions: Actions = {
	/** Signed in as the invited address: accept and open the tank. */
	accept: ({ params, locals }) => {
		const found = readMemberToken(params.token);
		if (!found || !locals.user || found.member.email !== locals.user.email || found.state !== 'pending') redirect(303, `/share/${params.token}`);
		acceptMemberInvites(locals.user.email, locals.user.id);
		logger.info('sign-in', `${locals.user.email} joined ${found.tank.name}`, { userId: locals.user.id, tankId: found.tank.id });
		redirect(303, `/?tank=${found.tank.id}`);
	}
};
