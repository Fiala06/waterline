// About this server (#302): what this Waterline server keeps and which outside
// services it uses, worked out from how it's actually set up, beside what its
// admin writes about who runs it, how to reach them and its terms. Every self-
// hosted server is set up differently, so nothing here is assumed.
import { env } from '$env/dynamic/private';
import { emailConfigured, getServerSettings, outboxMode } from './mail';
import { googleClient } from './sign-in';
import { barcodeLookupOn } from './barcode-lookup';
import { speciesCareOn } from './species-care';
import { stockPhotosOn } from './stock-photos';

export interface Service {
	name: string;
	what: string;
}

export function aboutServer() {
	const s = getServerSettings();
	const email = emailConfigured() && !outboxMode() ? s.emailProvider : null;
	const services: Service[] = [];
	if (googleClient())
		services.push({ name: 'Google sign-in', what: 'Signing in with Google gives this server your name, email address and profile photo. It never sees your Google password.' });
	if (email === 'mailgun')
		services.push({ name: `Mailgun (${s.mailgunRegion === 'eu' ? 'EU' : 'US'} region)`, what: 'Sends the emails you choose: reminders, alerts, digests and invitations, with your email address and what the email is about.' });
	else if (email === 'smtp') services.push({ name: 'An email server (SMTP)', what: 'Sends the emails you choose: reminders, alerts, digests and invitations, with your email address and what the email is about.' });
	services.push({
		name: 'Your browser’s push service',
		what: 'Only if you turn on push notifications on a device: the notification goes through that browser’s own service (Google, Apple or Mozilla), as every web push does.'
	});
	services.push({ name: 'ntfy', what: 'Only if you add an ntfy topic: notifications go to the ntfy server you chose.' });
	services.push({
		name: 'AI assistants',
		what: 'Only if you create an access token or connect an assistant: it can read the tanks you picked, never change them, and what it reads goes to that assistant’s provider.'
	});
	if (s.allowPublicPages && s.ga4Id)
		services.push({
			name: 'Google Analytics',
			what: `On public tank pages only, never inside the app${s.consentBanner ? ', and only after a visitor agrees' : ''}.`
		});
	if (stockPhotosOn()) services.push({ name: 'Wikimedia Commons', what: 'Species photos for livestock and plants, fetched by this server by species name. Nothing about you is sent.' });
	if (barcodeLookupOn())
		services.push({ name: 'Open Products Facts and UPCitemdb', what: 'Looks up a barcode you scan, by this server. Only the barcode’s number is sent.' });
	if (speciesCareOn()) services.push({ name: 'FishBase', what: 'Fish care data, downloaded once by this server. Nothing about you is sent.' });
	if (s.updateCheck && env.UPDATE_CHECK !== 'off')
		services.push({
		name: 'GitHub',
		what: `This server checks ${env.UPDATE_CHECK_URL ? 'a changelog' : 'Waterline’s changelog on GitHub'} for new versions. Nothing about you is sent.`
	});
	return {
		operator: s.aboutOperator,
		contact: s.aboutContact,
		terms: s.aboutTerms,
		updatedAt: s.aboutUpdatedAt,
		access: s.landingAccess,
		publicPages: s.allowPublicPages,
		services
	};
}
