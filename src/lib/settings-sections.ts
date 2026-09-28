// Settings' sections, each with its own address (/settings#units,
// /settings/server#species-photos), for the desktop menu, the phone's jump
// list and links shared from them.

export interface Section {
	id: string;
	label: string;
}

/** The settings page, in order. */
export const SETTINGS_SECTIONS: Section[] = [
	{ id: 'profile', label: 'Profile' },
	{ id: 'units', label: 'Units' },
	{ id: 'notifications', label: 'Notifications' },
	{ id: 'calendar', label: 'Calendar' },
	{ id: 'theme', label: 'Theme' }
];

/** Server settings, in the order a new server is set up. Inside them: #google, #who-can-sign-in, #local-admin, #analytics, #species-photos. */
export const SERVER_SECTIONS: Section[] = [
	{ id: 'sign-in', label: 'Sign-in' },
	{ id: 'email', label: 'Email' },
	{ id: 'public-pages', label: 'Public pages' },
	{ id: 'features', label: 'Features' },
	{ id: 'about', label: 'Logs & version' }
];
