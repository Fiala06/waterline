// Setup › Sharing (#22, redesign README § 13): invite someone to help look
// after this tank, the people with access, and whom reminders and alerts go to.
import { error, fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { TANK_ROLES, type TankRole } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { createInvite, validEmail } from '$lib/server/invites';
import { logger } from '$lib/server/log';
import { emailConfigured, getServerSettings, MailError, sendMail } from '$lib/server/mail';
import { shareEmail } from '$lib/server/mail/templates';
import { getMember, hasAccess, inviteMember, listMembers, MEMBER_INVITE_DAYS, removeMember, resendMember, restoreMember, setMemberRole } from '$lib/server/members';
import { signupRules } from '$lib/server/sign-in';
import { getTank, updateTank } from '$lib/server/tanks';
import { getUser, isEmailAllowed } from '$lib/server/users';
import { dateInZone, fmtDateLong, fmtWhen } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const tz = user.timeZone;
	return {
		tank: { id: tank.id, name: tank.name, remindTo: tank.remindTo, alertTo: tank.alertTo },
		owner: { name: user.displayName || user.email, email: user.email },
		members: listMembers(tank.id).map((m) => ({
			id: m.member.id,
			email: m.member.email,
			name: m.name || null,
			role: m.member.role,
			state: m.state,
			sent: fmtWhen(m.member.createdAt, tz),
			expires: fmtDateLong(dateInZone(m.member.expiresAt, tz))
		})),
		emailOn: emailConfigured(),
		inviteDays: MEMBER_INVITE_DAYS,
		// whether someone not on the server yet could sign in through the share
		signupOpen: signupRules(getServerSettings()).mode !== 'admin',
		origin: (env.ORIGIN || url.origin).replace(/\/+$/, '')
	};
};

async function sendShare(origin: string, to: string, token: string, inviter: string, tankName: string, role: TankRole, newToServer: boolean): Promise<'sent' | string | null> {
	if (!emailConfigured()) return null;
	const host = origin.replace(/^https?:\/\//, '');
	const mail = shareEmail({
		host,
		inviter,
		tankName,
		can: role,
		acceptUrl: `${origin}/share/${token}`,
		expires: fmtDateLong(new Date(Date.now() + MEMBER_INVITE_DAYS * 86_400_000).toISOString().slice(0, 10)),
		newToServer,
		footer: { reason: `${inviter} shared a tank with you on ${host}.`, settingsUrl: `${origin}/signin`, settingsLabel: 'Sign in', unsubscribeUrl: null, host }
	});
	try {
		await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
		return 'sent';
	} catch (e) {
		logger.error('email', `Couldn't send the share invitation to ${to}`, { error: e });
		return e instanceof MailError ? e.message : "Couldn't send the invitation.";
	}
}

const parseRole = (v: string): TankRole => (TANK_ROLES.includes(v as TankRole) ? (v as TankRole) : 'log');

export const actions: Actions = {
	invite: async ({ request, locals, params, url }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const email = str(form, 'email').toLowerCase().slice(0, 200);
		const role = parseRole(str(form, 'role'));
		if (!validEmail(email)) return fail(400, { inviteError: 'Enter an email address.', email, role });
		if (email === user.email) return fail(400, { inviteError: "That's you.", email, role });
		if (hasAccess(tank.id, email)) return fail(400, { inviteError: `${email} already has access.`, email, role });
		const { member, token } = inviteMember(tank, email, role, user.id);
		const origin = (env.ORIGIN || url.origin).replace(/\/+$/, '');
		const inviter = user.displayName || user.email;
		if (!token) {
			// on the server already: the tank is in their list from now
			logger.info('settings', `${tank.name} shared with ${email} (${role})`, { userId: user.id, tankId: tank.id });
			return { invited: { id: member.id, email, link: null, sent: false, error: null, joined: true } };
		}
		// not on the server yet: the share link lets them sign in too, when sign-in isn't the admin's alone
		const newToServer = !getUser(member.userId ?? '') && !isEmailAllowed(email);
		if (newToServer && signupRules(getServerSettings()).mode !== 'admin') createInvite(email, user.id);
		const sent = await sendShare(origin, email, token, inviter, tank.name, role, newToServer);
		logger.info('settings', `${tank.name} shared with ${email} (${role})${sent === 'sent' ? ' by email' : ' (link to copy)'}`, { userId: user.id, tankId: tank.id });
		return { invited: { id: member.id, email, link: `${origin}/share/${token}`, sent: sent === 'sent', error: sent && sent !== 'sent' ? sent : null, joined: false } };
	},
	resend: async ({ request, locals, params, url }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const old = getMember(tank.id, str(await request.formData(), 'id'));
		const { member, token } = resendMember(tank, old.id, user.id);
		const origin = (env.ORIGIN || url.origin).replace(/\/+$/, '');
		if (!token) return { invited: { id: member.id, email: member.email, link: null, sent: false, error: null, joined: true } };
		const sent = await sendShare(origin, member.email, token, user.displayName || user.email, tank.name, member.role, !isEmailAllowed(member.email));
		return { invited: { id: member.id, email: member.email, link: `${origin}/share/${token}`, sent: sent === 'sent', error: sent && sent !== 'sent' ? sent : null, joined: false } };
	},
	role: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const m = setMemberRole(tank.id, str(form, 'id'), parseRole(str(form, 'role')));
		logger.info('settings', `${m.email} can now ${m.role === 'log' ? 'log care on' : 'view'} ${tank.name}`, { userId: user.id, tankId: tank.id });
		setFlash(cookies, `✓ ${m.email} can ${m.role === 'log' ? 'log care' : 'view'}`);
		redirect(303, `/tanks/${tank.id}/sharing`);
	},
	remove: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const m = removeMember(tank.id, str(await request.formData(), 'id'));
		logger.info('settings', `${m.email} removed from ${tank.name}`, { userId: user.id, tankId: tank.id });
		setFlash(cookies, m.acceptedAt ? `${m.email} removed` : `Invitation to ${m.email} cancelled`, { undo: { action: `/tanks/${tank.id}/sharing?/restore`, name: 'id', value: m.id } });
		redirect(303, `/tanks/${tank.id}/sharing`);
	},
	restore: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const m = restoreMember(tank.id, str(await request.formData(), 'id'));
		setFlash(cookies, `✓ ${m.email} is back`);
		redirect(303, `/tanks/${tank.id}/sharing`);
	},
	/** Reminders & alerts: everyone who can log, or only the owner. */
	routing: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const pick = (k: string) => (str(form, k) === 'owner' ? ('owner' as const) : ('all' as const));
		updateTank(user.id, tank.id, { remindTo: pick('remindTo'), alertTo: pick('alertTo') });
		setFlash(cookies, '✓ Saved');
		redirect(303, `/tanks/${tank.id}/sharing`);
	}
};
