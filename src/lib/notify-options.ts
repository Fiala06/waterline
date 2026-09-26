// Choices on the Notifications settings form.
export const LEAD_OPTIONS = [
	{ days: 0, label: 'On the day' },
	{ days: 1, label: '1 day before' },
	{ days: 2, label: '2 days before' },
	{ days: 3, label: '3 days before' },
	{ days: 7, label: '1 week before' }
];

export const SEND_TIMES = Array.from({ length: 24 }, (_, h) => {
	const value = `${String(h).padStart(2, '0')}:00`;
	const label = new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	return { value, label };
});
