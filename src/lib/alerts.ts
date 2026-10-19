// Alerts (#195): readings out of range, overdue tasks and an update notice,
// across every tank, for the bell and the Alerts page. A key names an alert
// for as long as it lasts (a reading's stretch out of range, a task's due
// date), so what's been marked read holds on every device until something
// changes. The page sorts them into its sections here, where it's unit-tested.

export interface AlertBase {
	key: string;
	tankId: string | null;
	tankName: string;
	/** "Nitrate high · 45 ppm", "Water change 25%", "Update to 1.9.2" */
	title: string;
	/** the second line: the tank, and when */
	sub: string;
	/** where it opens: the chart, the task, What's new */
	href: string;
}

export interface ReadingAlert extends AlertBase {
	kind: 'reading';
	tankId: string;
	paramId: string;
	direction: 'low' | 'high';
	/** "✕ Low" */
	status: string;
	/** "45 ppm" */
	value: string;
	/** "5–20 ppm", or "" with no target */
	range: string;
	/** "Yesterday, 5:57 PM" */
	when: string;
	takenAt: string;
	/** the sensor that read it, when the sensor is the reading of record */
	sensor: string | null;
	/** the tank's water test form */
	logHref: string;
	/** the target, for the sparkline's band */
	lo: number | null;
	hi: number | null;
	/** its last readings, oldest first; the page fills these in */
	spark?: number[];
}

export interface TaskAlert extends AlertBase {
	kind: 'task';
	tankId: string;
	taskId: string;
	/** "✕ Overdue 2 days" */
	dueText: string;
	/** "every 7 days" */
	every: string;
	/** Mark done opens its page or form instead: the setup review, or a water change or test that logs */
	ownDone: boolean;
	/** what the Snooze sheet needs */
	task: {
		id: string;
		name: string;
		due: string;
		tankId: string;
		kind: string;
		recurring: boolean;
		intervalDays: number | null;
		scheduleMode?: 'completion' | 'fixed' | 'weekdays' | 'after';
		nextDue?: string | null;
		weekdays?: string | null;
		endsOn?: string | null;
	};
}

export interface UpdateAlert extends AlertBase {
	kind: 'update';
	tankId: null;
	version: string;
}

export type Alert = ReadingAlert | TaskAlert | UpdateAlert;

export const readingKey = (paramId: string, since: string) => `reading:${paramId}:${since}`;
export const taskKey = (taskId: string, due: string) => `task:${taskId}:${due}`;
export const updateKey = (version: string) => `update:${version}`;

/** The notice an admin gets when a newer Waterline is out. */
export function updateAlert(version: string): UpdateAlert {
	return {
		kind: 'update',
		key: updateKey(version),
		tankId: null,
		tankName: 'Waterline',
		title: `Update to ${version}`,
		sub: "See what's new and update the server",
		href: '/settings/changelog',
		version
	};
}

export const isUnread = (alert: Pick<Alert, 'key'>, seen: string[]) => !seen.includes(alert.key);

/** How many the bell shows. */
export function unreadCount(alerts: Pick<Alert, 'key'>[], seen: string[]): number {
	return alerts.filter((a) => isUnread(a, seen)).length;
}

export interface AlertSections {
	readings: ReadingAlert[];
	tasks: TaskAlert[];
	updates: UpdateAlert[];
	/** alerts for the tank picked (or every tank), read or not */
	total: number;
	unread: number;
	/** of those, the ones listed */
	shown: number;
}

/**
 * The page's sections: readings out of range, overdue tasks, then updates,
 * for one tank or all, and only the unread ones when asked. An update isn't
 * any tank's, so it's left out when a tank is picked.
 */
export function alertSections(alerts: Alert[], seen: string[], filter: { tank?: string | null; unreadOnly?: boolean } = {}): AlertSections {
	const mine = alerts.filter((a) => !filter.tank || a.tankId === filter.tank);
	const unread = unreadCount(mine, seen);
	const listed = filter.unreadOnly ? mine.filter((a) => isUnread(a, seen)) : mine;
	return {
		readings: listed.filter((a): a is ReadingAlert => a.kind === 'reading'),
		tasks: listed.filter((a): a is TaskAlert => a.kind === 'task'),
		updates: listed.filter((a): a is UpdateAlert => a.kind === 'update'),
		total: mine.length,
		unread,
		shown: listed.length
	};
}

/** The page's kicker: "2 unread · 5 alerts", "3 alerts · all read", or "Nothing needs attention". */
export function alertsKicker(total: number, unread: number): string {
	const n = (c: number) => `${c} alert${c === 1 ? '' : 's'}`;
	if (unread) return `${unread} unread · ${n(total)}`;
	if (total) return `${n(total)} · all read`;
	return 'Nothing needs attention';
}
