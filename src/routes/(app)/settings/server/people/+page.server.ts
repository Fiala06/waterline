// Server settings › People (#27): everyone on the server, invitations with
// Resend and Revoke, and what an admin can do about a person.
import { error, fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { fmtDateLong, fmtWhen, dateInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { createInvite, getInvite, INVITE_DAYS, listInvites, resendInvite, revokeInvite, validEmail } from '$lib/server/invites';
import { logger } from '$lib/server/log';
import { emailConfigured, getServerSettings, MailError, sendMail } from '$lib/server/mail';
import { inviteEmail } from '$lib/server/mail/templates';
import { adminCount, listPeople, personFootprint, removePerson, setAdmin, signOutEverywhere } from '$lib/server/people';
import { signupRules } from '$lib/server/sign-in';
import { getUser } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404, 'Not found');
	return locals.user;
}

const KIND = { google: 'Google', local: 'Local admin login', invited: 'Invited', none: '—' } as const;

export const load: PageServerLoad = ({ locals, url }) => {
	const me = requireAdmin(locals);
	const tz = me.timeZone;
	const rules = signupRules(getServerSettings());
	const admins = adminCount();
	return {
		mode: rules.mode,
		emailOn: emailConfigured(),
		inviteDays: INVITE_DAYS,
		people: listPeople().map(({ user: u, tanks, signIn }) => ({
			id: u.id,
			name: u.displayName || u.email.split('@')[0],
			email: u.email,
			isAdmin: u.isAdmin,
			me: u.id === me.id,
			signIn: KIND[signIn],
			joined: fmtDateLong(dateInZone(u.createdAt, tz)),
			lastSeen: u.lastSeenAt ? fmtWhen(u.lastSeenAt, tz) : 'Never',
			tanks,
			// never the last admin, never yourself
			canDemote: u.isAdmin && admins > 1 && u.id !== me.id,
			canRemove: u.id !== me.id && !(u.isAdmin && admins <= 1)
		})),
		// accepted ones stay listed: Revoke there takes the person's access away without removing their tanks
		invites: listInvites().map((i) => ({
				id: i.invite.id,
				email: i.invite.email,
				state: i.state,
				by: i.inviter || 'the server',
				sent: fmtWhen(i.invite.createdAt, tz),
				expires: fmtDateLong(dateInZone(i.invite.expiresAt, tz))
		})),
		origin: (env.ORIGIN || url.origin).replace(/\/+$/, '')
	};
};

const listPeopleEmails = () => new Set(listPeople().map((p) => p.user.email));

/** Send the invitation email; a failure is reported, and the admin can copy the link instead. */
async function sendInvite(origin: string, to: string, token: string, inviter: string): Promise<string | null> {
	if (!emailConfigured()) return null;
	const host = origin.replace(/^https?:\/\//, '');
	const mail = inviteEmail({
		host,
		inviter,
		acceptUrl: `${origin}/invite/${token}`,
		expires: fmtDateLong(new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString().slice(0, 10)),
		footer: { reason: `An admin of ${host} invited you.`, settingsUrl: `${origin}/signin`, settingsLabel: 'Sign in', unsubscribeUrl: null, host }
	});
	try {
		await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
		return 'sent';
	} catch (e) {
		logger.error('email', `Couldn't send the invitation to ${to}`, { error: e });
		return e instanceof MailError ? e.message : "Couldn't send the invitation.";
	}
}

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		const me = requireAdmin(locals);
		const form = await request.formData();
		const email = str(form, 'email').toLowerCase().slice(0, 200);
		if (!validEmail(email)) return fail(400, { inviteError: 'Enter an email address.', email });
		if (listPeopleEmails().has(email)) return fail(400, { inviteError: `${email} is on the server already.`, email });
		const { invite, token } = createInvite(email, me.id);
		const origin = (env.ORIGIN || url.origin).replace(/\/+$/, '');
		const sent = await sendInvite(origin, email, token, me.displayName || 'An admin');
		logger.info('sign-in', `${email} invited to the server${sent === 'sent' ? ' by email' : ' (link to copy)'}`, { userId: me.id });
		// the link is shown once; it isn't stored
		return { invited: { id: invite.id, email, link: `${origin}/invite/${token}`, sent: sent === 'sent', error: sent && sent !== 'sent' ? sent : null } };
	},
	resend: async ({ request, locals, url }) => {
		const me = requireAdmin(locals);
		const id = str(await request.formData(), 'id');
		const r = resendInvite(id, me.id);
		if (!r) error(404, 'Invitation not found');
		const origin = (env.ORIGIN || url.origin).replace(/\/+$/, '');
		const sent = await sendInvite(origin, r.invite.email, r.token, me.displayName || 'An admin');
		logger.info('sign-in', `Invitation to ${r.invite.email} sent again`, { userId: me.id });
		return { invited: { id: r.invite.id, email: r.invite.email, link: `${origin}/invite/${r.token}`, sent: sent === 'sent', error: sent && sent !== 'sent' ? sent : null } };
	},
	revoke: async ({ request, locals, cookies }) => {
		const me = requireAdmin(locals);
		const id = str(await request.formData(), 'id');
		const before = getInvite(id);
		const i = revokeInvite(id);
		if (!i && !before) error(404, 'Invitation not found');
		logger.info('sign-in', `Invitation to ${before!.email} revoked`, { userId: me.id });
		setFlash(cookies, `Invitation to ${before!.email} revoked`);
		redirect(303, '/settings/server/people');
	},
	admin: async ({ request, locals, cookies }) => {
		const me = requireAdmin(locals);
		const form = await request.formData();
		const u = setAdmin(me, str(form, 'id'), form.get('on') === '1');
		setFlash(cookies, u.isAdmin ? `✓ ${u.displayName || u.email} is an admin` : `${u.displayName || u.email} is no longer an admin`);
		redirect(303, '/settings/server/people');
	},
	signout: async ({ request, locals, cookies }) => {
		const me = requireAdmin(locals);
		const u = signOutEverywhere(me, str(await request.formData(), 'id'));
		setFlash(cookies, `✓ ${u.displayName || u.email} signed out everywhere`);
		redirect(303, '/settings/server/people');
	},
	remove: async ({ request, locals, cookies }) => {
		const me = requireAdmin(locals);
		const id = str(await request.formData(), 'id');
		const u = getUser(id);
		if (!u) error(404, 'Person not found');
		const { tanks, photos } = personFootprint(id);
		await removePerson(me, id);
		setFlash(cookies, `${u.displayName || u.email} removed with ${tanks} tank${tanks === 1 ? '' : 's'} and ${photos} photo${photos === 1 ? '' : 's'}`);
		redirect(303, '/settings/server/people');
	}
};
