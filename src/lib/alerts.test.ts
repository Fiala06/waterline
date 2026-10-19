import { describe, expect, it } from 'vitest';
import { alertSections, alertsKicker, isUnread, readingKey, taskKey, unreadCount, updateAlert, type Alert, type ReadingAlert, type TaskAlert } from './alerts';

const reading = (over: Partial<ReadingAlert> = {}): ReadingAlert => ({
	kind: 'reading',
	key: readingKey('p1', '2026-10-18T00:57:00.000Z'),
	tankId: 't1',
	tankName: 'Betta Tank',
	paramId: 'p1',
	direction: 'low',
	status: '✕ Low',
	value: '0 ppm',
	range: '5–20 ppm',
	when: 'Yesterday, 5:57 PM',
	takenAt: '2026-10-18T00:57:00.000Z',
	sensor: null,
	title: 'Nitrate low · 0 ppm',
	sub: 'Betta Tank · Yesterday, 5:57 PM',
	href: '/charts?tank=t1&p=p1',
	logHref: '/entries/test/new?tank=t1',
	lo: 5,
	hi: 20,
	...over
});
const task = (over: Partial<TaskAlert> = {}): TaskAlert => ({
	kind: 'task',
	key: taskKey('k1', '2026-10-17'),
	tankId: 't2',
	tankName: 'Shrimp Bowl',
	taskId: 'k1',
	dueText: '✕ Overdue 2 days',
	every: 'every 7 days',
	ownDone: false,
	title: 'Water change 25%',
	sub: 'Shrimp Bowl · ✕ Overdue 2 days',
	href: '/tasks?filter=t2&edit=k1',
	task: { id: 'k1', name: 'Water change 25%', due: '2026-10-17', tankId: 't2', kind: 'water_change', recurring: true, intervalDays: 7 },
	...over
});

describe('alert keys', () => {
	it('name a reading by its parameter and the start of its stretch out of range, a task by its due date', () => {
		expect(readingKey('p1', '2026-10-18T00:57:00.000Z')).toBe('reading:p1:2026-10-18T00:57:00.000Z');
		expect(taskKey('k1', '2026-10-17')).toBe('task:k1:2026-10-17');
		expect(updateAlert('1.9.2').key).toBe('update:1.9.2');
	});
	it('an update opens What\'s new and is no tank\'s', () => {
		const u = updateAlert('1.9.2');
		expect(u.title).toBe('Update to 1.9.2');
		expect(u.href).toBe('/settings/changelog');
		expect(u.tankId).toBeNull();
	});
});

describe('unread', () => {
	it('counts what has not been marked read', () => {
		const list: Alert[] = [reading(), task(), updateAlert('1.9.2')];
		expect(unreadCount(list, [])).toBe(3);
		expect(unreadCount(list, [list[0].key, 'update:1.9.2'])).toBe(1);
		expect(isUnread(list[1], ['task:k1:2026-10-17'])).toBe(false);
		// a task moved to a new date is new again
		expect(isUnread(task({ key: taskKey('k1', '2026-10-24') }), ['task:k1:2026-10-17'])).toBe(true);
	});
});

describe('alertSections', () => {
	const list: Alert[] = [reading(), reading({ key: 'reading:p2:x', paramId: 'p2', tankId: 't2', tankName: 'Shrimp Bowl', title: 'GH high · 214 ppm' }), task(), updateAlert('1.9.2')];

	it('sorts every alert into readings, tasks and updates', () => {
		const s = alertSections(list, []);
		expect(s.readings.map((a) => a.title)).toEqual(['Nitrate low · 0 ppm', 'GH high · 214 ppm']);
		expect(s.tasks.map((a) => a.title)).toEqual(['Water change 25%']);
		expect(s.updates.map((a) => a.version)).toEqual(['1.9.2']);
		expect(s).toMatchObject({ total: 4, unread: 4, shown: 4 });
	});

	it('keeps one tank\'s alerts, and leaves the update out then', () => {
		const s = alertSections(list, [], { tank: 't2' });
		expect(s.readings.map((a) => a.title)).toEqual(['GH high · 214 ppm']);
		expect(s.tasks).toHaveLength(1);
		expect(s.updates).toHaveLength(0);
		expect(s).toMatchObject({ total: 2, unread: 2, shown: 2 });
	});

	it('lists only the unread ones when asked, counting the rest still', () => {
		const seen = ['reading:p2:x', 'task:k1:2026-10-17'];
		const s = alertSections(list, seen, { unreadOnly: true });
		expect(s.readings.map((a) => a.title)).toEqual(['Nitrate low · 0 ppm']);
		expect(s.tasks).toHaveLength(0);
		expect(s.updates).toHaveLength(1);
		expect(s).toMatchObject({ total: 4, unread: 2, shown: 2 });
	});

	it('is empty, not broken, with nothing to show', () => {
		expect(alertSections([], [])).toEqual({ readings: [], tasks: [], updates: [], total: 0, unread: 0, shown: 0 });
	});
});

describe('alertsKicker', () => {
	it('says what is unread, or that all is read, or that nothing needs attention', () => {
		expect(alertsKicker(5, 2)).toBe('2 unread · 5 alerts');
		expect(alertsKicker(1, 1)).toBe('1 unread · 1 alert');
		expect(alertsKicker(3, 0)).toBe('3 alerts · all read');
		expect(alertsKicker(0, 0)).toBe('Nothing needs attention');
	});
});
