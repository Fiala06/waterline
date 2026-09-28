import { sql } from 'drizzle-orm';
import { EVENT_CATEGORIES, IMPORT_KINDS, TANK_TYPES, TASK_KINDS } from '../../types';
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
	// what spending is shown in (ISO 4217)
	currency: text('currency').notNull().default('USD'),
	setupDone: integer('setup_done', { mode: 'boolean' }).notNull().default(false),
	// the last release whose What's new was dismissed; 1.0.0, the release before it existed,
	// for accounts from then (new accounts start at the running version)
	seenVersion: text('seen_version').notNull().default('1.0.0'),
	// when the Google profile photo was last copied to DATA_DIR/avatars (null: none)
	avatarAt: text('avatar_at'),
	// which photo the account shows: the Google one, one they uploaded, or initials
	avatarChoice: text('avatar_choice', { enum: ['google', 'own', 'none'] }).notNull().default('google'),
	// when they uploaded their own photo (null: none)
	ownAvatarAt: text('own_avatar_at'),
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
	notifyEmail: text('notify_email'),
	unsubscribedAt: text('unsubscribed_at')
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
		specBrand: text('spec_brand'),
		specModel: text('spec_model'),
		glass: text('glass'),
		substrate: text('substrate'),
		waterSource: text('water_source'),
		photoperiodH: real('photoperiod_h'),
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
		clientId: text('client_id'),
		importId: text('import_id') // the import that added it (undone together)
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
		value: real('value').notNull(),
		// the value before the last edit, for "was 40" (G6)
		prevValue: real('prev_value')
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
		clientId: text('client_id'),
		importId: text('import_id') // the import that added it (undone together)
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

// ── Email ────────────────────────────────────────────────────────────────────

/** Server-wide settings (one row, id = 1). Secrets are encrypted at rest. */
export const serverSettings = sqliteTable('server_settings', {
	id: integer('id').primaryKey(),
	emailProvider: text('email_provider', { enum: ['mailgun', 'smtp'] }),
	mailgunApiKeyEnc: text('mailgun_api_key_enc'),
	mailgunDomain: text('mailgun_domain'),
	mailgunRegion: text('mailgun_region', { enum: ['us', 'eu'] }).notNull().default('us'),
	smtpHost: text('smtp_host'),
	smtpPort: integer('smtp_port'),
	smtpSecure: integer('smtp_secure', { mode: 'boolean' }).notNull().default(true),
	smtpUser: text('smtp_user'),
	smtpPasswordEnc: text('smtp_password_enc'),
	sender: text('sender'),
	allowPublicPages: integer('allow_public_pages', { mode: 'boolean' }).notNull().default(true),
	publicHomeEnabled: integer('public_home_enabled', { mode: 'boolean' }).notNull().default(false),
	publicBaseUrl: text('public_base_url'),
	ga4Id: text('ga4_id'),
	consentBanner: integer('consent_banner', { mode: 'boolean' }).notNull().default(true),
	searchConsoleTag: text('search_console_tag'),
	// Sign-in, set in the app. Until one is saved, older installs' environment
	// variables (AUTH_GOOGLE_ID…, ADMIN_EMAIL, ALLOWED_EMAILS, OPEN_SIGNUP) apply.
	googleClientId: text('google_client_id'),
	googleClientSecretEnc: text('google_client_secret_enc'),
	adminEmail: text('admin_email'),
	// who may sign in with Google besides the admin; null: the environment decides
	signupMode: text('signup_mode', { enum: ['admin', 'list', 'open'] }),
	allowedEmails: text('allowed_emails'), // one email or @domain per line
	localAdminUsername: text('local_admin_username'),
	localAdminPasswordHash: text('local_admin_password_hash'), // scrypt, like LOCAL_ADMIN_PASSWORD_HASH
	scheduledEmails: integer('scheduled_emails', { mode: 'boolean' }).notNull().default(true),
	updateCheck: integer('update_check', { mode: 'boolean' }).notNull().default(true),
	// what the log keeps: errors and warnings, or also what the server did;
	// everything (debug) only until log_debug_until, while troubleshooting
	logLevel: text('log_level', { enum: ['warn', 'info'] }).notNull().default('warn'),
	logDebugUntil: text('log_debug_until')
});

/** The server's log, for troubleshooting (Server settings › Logs). Kept for 30 days. */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export const logs = sqliteTable(
	'logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		at: createdAt(),
		level: text('level', { enum: LOG_LEVELS }).notNull(),
		area: text('area').notNull(), // email, sign-in, import, export, request, server…
		message: text('message').notNull(),
		details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
		// the account it's about; no foreign key, so entries outlive a deleted account
		userId: text('user_id'),
		// the reference an error page shows, to find its entry
		ref: text('ref')
	},
	(t) => [index('logs_at').on(t.at), index('logs_ref').on(t.ref)]
);
export type LogEntry = typeof logs.$inferSelect;

/** Signed single-use links in emails (Mark done / Snooze). Only the hash is stored. */
export const actionTokens = sqliteTable('action_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	taskId: text('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	action: text('action', { enum: ['done', 'snooze'] }).notNull(),
	due: text('due').notNull(), // the occurrence the email was about
	expiresAt: text('expires_at').notNull(),
	usedAt: text('used_at')
});

/** What was emailed, so the scheduler never sends the same thing twice. */
export const emailLog = sqliteTable(
	'email_log',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		key: text('key').notNull(), // e.g. reminder:<task>:<due>, daily-digest:<date>
		sentAt: createdAt(),
		error: text('error')
	},
	(t) => [uniqueIndex('email_log_key').on(t.userId, t.key)]
);

// ── Export ───────────────────────────────────────────────────────────────────

export const exports = sqliteTable(
	'exports',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scope: text('scope', { enum: ['tank', 'account'] }).notNull(),
		tankId: text('tank_id').references(() => tanks.id, { onDelete: 'cascade' }),
		format: text('format', { enum: ['zip', 'csv'] }).notNull(),
		status: text('status', { enum: ['building', 'ready', 'failed', 'expired'] }).notNull().default('building'),
		progress: integer('progress').notNull().default(0),
		progressText: text('progress_text'),
		filePath: text('file_path'),
		fileName: text('file_name'),
		size: integer('size'),
		summary: text('summary'), // "190 photos, 212 entries"
		error: text('error'),
		createdAt: createdAt(),
		expiresAt: text('expires_at')
	},
	(t) => [index('exports_user').on(t.userId)]
);

// ── Saved products: links to reorder what the keeper buys again ──────────────

export const products = sqliteTable(
	'products',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		note: text('note'), // "500 mL · about $19"
		createdAt: createdAt()
	},
	(t) => [index('products_user').on(t.userId)]
);

export type Product = typeof products.$inferSelect;

// ── Spending ─────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ['livestock', 'plants', 'equipment', 'consumables', 'other'] as const;

/** What's spent on a tank (#7), in the keeper's currency, with an optional receipt (#8). */
export const expenses = sqliteTable(
	'expenses',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		/** YYYY-MM-DD */
		date: text('date').notNull(),
		/** in cents (hundredths of the currency) */
		amountCents: integer('amount_cents').notNull(),
		category: text('category', { enum: EXPENSE_CATEGORIES }).notNull().default('other'),
		what: text('what').notNull(),
		note: text('note'),
		productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
		/** DATA_DIR/receipts/<tank>/<file>; a JPEG or a PDF */
		receiptPath: text('receipt_path'),
		receiptType: text('receipt_type', { enum: ['image/jpeg', 'application/pdf'] }),
		createdAt: createdAt()
	},
	(t) => [index('expenses_tank_date').on(t.tankId, t.date)]
);

export type Expense = typeof expenses.$inferSelect;

// ── Imports from a spreadsheet, so each can be undone in one step ───────────

export const imports = sqliteTable(
	'imports',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: IMPORT_KINDS }).notNull(),
		fileName: text('file_name'),
		summary: text('summary').notNull(), // "24 water tests"
		createdAt: createdAt(),
		undoneAt: text('undone_at')
	},
	(t) => [index('imports_tank').on(t.tankId)]
);

export type Import = typeof imports.$inferSelect;

// ── Tank specs: equipment, livestock, plants ─────────────────────────────────

export const EQUIPMENT_TYPES = ['filter', 'heater', 'light', 'co2', 'pump', 'skimmer', 'other'] as const;

export const equipment = sqliteTable(
	'equipment',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		type: text('type', { enum: EQUIPMENT_TYPES }).notNull(),
		brand: text('brand'),
		model: text('model'),
		specs: text('specs', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
		installedAt: text('installed_at'),
		lastServicedAt: text('last_serviced_at'),
		notes: text('notes'),
		removedAt: text('removed_at'),
		importId: text('import_id'),
		createdAt: createdAt()
	},
	(t) => [index('equipment_tank').on(t.tankId)]
);

export const livestock = sqliteTable(
	'livestock',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['fish', 'invert', 'coral'] }).notNull(),
		commonName: text('common_name').notNull(),
		scientificName: text('scientific_name'),
		count: integer('count').notNull().default(1),
		status: text('status', { enum: ['in_tank', 'quarantine'] }).notNull().default('in_tank'),
		addedAt: text('added_at'),
		source: text('source'),
		removedAt: text('removed_at'),
		importId: text('import_id'),
		// a pet's name ("Captain"): one animal, its own entry, never merged into a group
		nickname: text('nickname'),
		notes: text('notes'),
		// its profile photo, one of the tank's photos
		photoId: text('photo_id').references(() => photos.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('livestock_tank').on(t.tankId)]
);

/** Pets in a photo (#6): tagged from the photo viewer; a pet's profile photo is tagged too. */
export const photoLivestock = sqliteTable(
	'photo_livestock',
	{
		photoId: text('photo_id')
			.notNull()
			.references(() => photos.id, { onDelete: 'cascade' }),
		livestockId: text('livestock_id')
			.notNull()
			.references(() => livestock.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.photoId, t.livestockId] }), index('photo_livestock_livestock').on(t.livestockId)]
);

export const plants = sqliteTable(
	'plants',
	{
		id: id(),
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		scientificName: text('scientific_name'),
		position: text('position', { enum: ['background', 'midground', 'foreground', 'epiphyte'] }).notNull().default('midground'),
		status: text('status', { enum: ['thriving', 'melting', 'algae', 'other'] }).notNull().default('thriving'),
		lastTrimmedAt: text('last_trimmed_at'),
		removedAt: text('removed_at'),
		importId: text('import_id'),
		createdAt: createdAt()
	},
	(t) => [index('plants_tank').on(t.tankId)]
);

export type Equipment = typeof equipment.$inferSelect;
export type Livestock = typeof livestock.$inferSelect;
export type Plant = typeof plants.$inferSelect;

// ── Public pages ─────────────────────────────────────────────────────────────

export const publicPages = sqliteTable(
	'public_pages',
	{
		tankId: text('tank_id')
			.primaryKey()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
		slug: text('slug').notNull(),
		showReadings: integer('show_readings', { mode: 'boolean' }).notNull().default(true),
		showCharts: integer('show_charts', { mode: 'boolean' }).notNull().default(true),
		showPhotos: integer('show_photos', { mode: 'boolean' }).notNull().default(true),
		showActivity: integer('show_activity', { mode: 'boolean' }).notNull().default(true),
		showLivestock: integer('show_livestock', { mode: 'boolean' }).notNull().default(true),
		showEquipment: integer('show_equipment', { mode: 'boolean' }).notNull().default(true),
		showDescription: integer('show_description', { mode: 'boolean' }).notNull().default(true),
		// pets' names, and photos tagged with a pet; off: species only, tagged photos hidden
		showPetNames: integer('show_pet_names', { mode: 'boolean' }).notNull().default(false),
		description: text('description'),
		displayName: text('display_name', { enum: ['full', 'short', 'none'] }).notNull().default('short'),
		indexable: integer('indexable', { mode: 'boolean' }).notNull().default(false),
		seoTitle: text('seo_title'),
		seoDescription: text('seo_description'),
		ogPhotoId: text('og_photo_id'),
		ogPlain: integer('og_plain', { mode: 'boolean' }).notNull().default(false),
		viewCount: integer('view_count').notNull().default(0)
	},
	(t) => [uniqueIndex('public_pages_slug').on(t.slug)]
);

/** Views per public page per day, for "38 views this week". */
export const publicPageViews = sqliteTable(
	'public_page_views',
	{
		tankId: text('tank_id')
			.notNull()
			.references(() => tanks.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		views: integer('views').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.tankId, t.day] })]
);

export const photoShares = sqliteTable('photo_shares', {
	id: text('id').primaryKey(), // the slug in /s/<id>
	photoId: text('photo_id')
		.notNull()
		.references(() => photos.id, { onDelete: 'cascade' }),
	includeNote: integer('include_note', { mode: 'boolean' }).notNull().default(true),
	includeTank: integer('include_tank', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt(),
	revokedAt: text('revoked_at')
});

export type PublicPage = typeof publicPages.$inferSelect;

/**
 * Access for an AI assistant the keeper connects (#9): read-only, to the tanks
 * they picked. The token is shown once; the database keeps its SHA-256 hash.
 */
export const assistantTokens = sqliteTable(
	'assistant_tokens',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		// the token's last 4 characters, to tell tokens apart
		hint: text('hint').notNull(),
		tankIds: text('tank_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
		createdAt: createdAt(),
		lastUsedAt: text('last_used_at'),
		// connected by signing in (OAuth): the app, when the access token runs out,
		// and the refresh token that renews it (hashed). Null for a pasted token.
		clientId: text('client_id').references(() => oauthClients.id, { onDelete: 'cascade' }),
		expiresAt: text('expires_at'),
		refreshHash: text('refresh_hash'),
		refreshExpiresAt: text('refresh_expires_at')
	},
	(t) => [
		uniqueIndex('assistant_tokens_hash').on(t.tokenHash),
		index('assistant_tokens_user').on(t.userId),
		uniqueIndex('assistant_tokens_refresh').on(t.refreshHash)
	]
);

export type AssistantToken = typeof assistantTokens.$inferSelect;

/** Apps that registered themselves to connect by signing in (OAuth dynamic client registration). */
export const oauthClients = sqliteTable('oauth_clients', {
	id: text('id').primaryKey(), // the client_id
	name: text('name').notNull(),
	redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull(),
	// set for apps that authenticate with a secret (hashed); null for public apps using PKCE alone
	secretHash: text('secret_hash'),
	createdAt: createdAt()
});

export type OAuthClient = typeof oauthClients.$inferSelect;

/** One-time codes from the consent page, swapped for tokens within minutes. */
export const oauthCodes = sqliteTable('oauth_codes', {
	codeHash: text('code_hash').primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => oauthClients.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	redirectUri: text('redirect_uri').notNull(),
	codeChallenge: text('code_challenge').notNull(),
	tankIds: text('tank_ids', { mode: 'json' }).$type<string[]>().notNull(),
	expiresAt: text('expires_at').notNull(),
	usedAt: text('used_at')
});

/**
 * A person's private calendar link for their tasks (#23): the secret in
 * /cal/<token>.ics. One per person; a new one replaces it.
 */
export const calendarFeeds = sqliteTable('calendar_feeds', {
	token: text('token').primaryKey(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: createdAt(),
	// when a calendar app last fetched it, to show it's working
	lastFetchedAt: text('last_fetched_at')
});
