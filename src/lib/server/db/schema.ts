import { sql } from 'drizzle-orm';
import { EVENT_CATEGORIES, TANK_TYPES, TASK_KINDS } from '../../types';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// All measurements are stored metric (L, °C, cm, hardness in dGH).
// Timestamps are UTC ISO strings; dates without a time (task due dates) are
// 'YYYY-MM-DD' in the user's time zone.

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	text('created_at')
		.notNull()
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const users = sqliteTable('users', {
	id: id(),
	googleSub: text('google_sub').unique(),
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull().default(''),
	isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
	unitSystem: text('unit_system', { enum: ['imperial', 'metric'] }).notNull().default('imperial'),
	hardnessUnit: text('hardness_unit', { enum: ['dgh', 'ppm'] }).notNull().default('dgh'),
	timeZone: text('time_zone').notNull().default('UTC'),
	theme: text('theme', { enum: ['system', 'dark', 'light'] }).notNull().default('system'),
	setupDone: integer('setup_done', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export const notificationPrefs = sqliteTable('notification_prefs', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	taskReminders: integer('task_reminders', { mode: 'boolean' }).notNull().default(true),
	overdueAlerts: integer('overdue_alerts', { mode: 'boolean' }).notNull().default(true),
	outOfRangeAlerts: integer('out_of_range_alerts', { mode: 'boolean' }).notNull().default(true),
	delivery: text('delivery', { enum: ['individual', 'daily', 'weekly'] }).notNull().default('individual'),
	leadDays: integer('lead_days').notNull().default(1),
	sendTime: text('send_time').notNull().default('08:00'),
	notifyEmail: text('notify_email')
});


export const tanks = sqliteTable(
	'tanks',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		type: text('type', { enum: TANK_TYPES }).notNull(),
		nominalVolumeL: real('nominal_volume_l'),
		actualVolumeL: real('actual_volume_l'),
		lengthCm: real('length_cm'),
		widthCm: real('width_cm'),
		heightCm: real('height_cm'),
		startDate: text('start_date'),
		notes: text('notes'),
		coverPhotoId: text('cover_photo_id'),
		archivedAt: text('archived_at'),
		createdAt: createdAt()
	},
	(t) => [index('tanks_user').on(t.userId)]
);

export const tankParameters = sqliteTable(
	'tank_parameters',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		key: text('key').notNull(), // ph | nh3 | no2 | no3 | gh | kh | temp | custom
		name: text('name').notNull(),
		unit: text('unit').notNull().default(''),
		decimals: integer('decimals').notNull().default(1),
		min: real('min'),
		max: real('max'),
		tracked: integer('tracked', { mode: 'boolean' }).notNull().default(true),
		sort: integer('sort').notNull().default(0),
		isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('tank_parameters_tank').on(t.tankId)]
);

export const tests = sqliteTable(
	'tests',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		takenAt: text('taken_at').notNull(),
		note: text('note'),
		editedAt: text('edited_at'),
		clientId: text('client_id')
	},
	(t) => [
		index('tests_tank_taken').on(t.tankId, t.takenAt),
		uniqueIndex('tests_client').on(t.tankId, t.clientId)
	]
);

export const testReadings = sqliteTable(
	'test_readings',
	{
		testId: text('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		parameterId: text('parameter_id')
			.notNull()
			.references(() => tankParameters.id, { onDelete: 'cascade' }),
		value: real('value').notNull()
	},
	(t) => [primaryKey({ columns: [t.testId, t.parameterId] })]
);


export const events = sqliteTable(
	'events',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		category: text('category', { enum: EVENT_CATEGORIES }).notNull(),
		occurredAt: text('occurred_at').notNull(),
		note: text('note'),
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
		editedAt: text('edited_at'),
		clientId: text('client_id')
	},
	(t) => [
		index('events_tank_occurred').on(t.tankId, t.occurredAt),
		uniqueIndex('events_client').on(t.tankId, t.clientId)
	]
);

export const photos = sqliteTable('photos', {
	id: id(),
	tankId: text('tank_id')
		.notNull()
		.references(() => tanks.id, { onDelete: 'cascade' }),
	eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
	testId: text('test_id').references(() => tests.id, { onDelete: 'set null' }),
	path: text('path').notNull(),
	thumbPath: text('thumb_path').notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
	takenAt: text('taken_at').notNull()
});


export const tasks = sqliteTable(
	'tasks',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: text('kind', { enum: TASK_KINDS }).notNull().default('other'),
		recurring: integer('recurring', { mode: 'boolean' }).notNull().default(true),
		intervalDays: integer('interval_days'),
		scheduleMode: text('schedule_mode', { enum: ['completion', 'fixed'] })
			.notNull()
			.default('completion'),
		nextDue: text('next_due'), // YYYY-MM-DD; null once a one-off task is done
		snoozedUntil: text('snoozed_until'),
		equipmentId: text('equipment_id'),
		openFormOnDone: integer('open_form_on_done', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [index('tasks_next_due').on(t.nextDue)]
);

export const taskCompletions = sqliteTable('task_completions', {
	id: id(),
	taskId: text('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	completedAt: text('completed_at').notNull(),
	eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
	// schedule before this completion, so Mark done can be undone
	prevNextDue: text('prev_next_due'),
	prevSnoozedUntil: text('prev_snoozed_until')
});

export type User = typeof users.$inferSelect;
export type Tank = typeof tanks.$inferSelect;
export type TankParameter = typeof tankParameters.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Task = typeof tasks.$inferSelect;

export { EVENT_CATEGORIES, TANK_TYPES, TASK_KINDS };
export type { EventCategory, TankType, TaskKind } from '../../types';
