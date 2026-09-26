CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`category` text NOT NULL,
	`occurred_at` text NOT NULL,
	`note` text,
	`data` text DEFAULT '{}' NOT NULL,
	`edited_at` text,
	`client_id` text,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_tank_occurred` ON `events` (`tank_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_client` ON `events` (`tank_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`task_reminders` integer DEFAULT true NOT NULL,
	`overdue_alerts` integer DEFAULT true NOT NULL,
	`out_of_range_alerts` integer DEFAULT true NOT NULL,
	`delivery` text DEFAULT 'individual' NOT NULL,
	`lead_days` integer DEFAULT 1 NOT NULL,
	`send_time` text DEFAULT '08:00' NOT NULL,
	`notify_email` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`event_id` text,
	`test_id` text,
	`path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`taken_at` text NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tank_parameters` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`decimals` integer DEFAULT 1 NOT NULL,
	`min` real,
	`max` real,
	`tracked` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tank_parameters_tank` ON `tank_parameters` (`tank_id`);--> statement-breakpoint
CREATE TABLE `tanks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`nominal_volume_l` real,
	`actual_volume_l` real,
	`length_cm` real,
	`width_cm` real,
	`height_cm` real,
	`start_date` text,
	`notes` text,
	`cover_photo_id` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tanks_user` ON `tanks` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`completed_at` text NOT NULL,
	`event_id` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`recurring` integer DEFAULT true NOT NULL,
	`interval_days` integer,
	`schedule_mode` text DEFAULT 'completion' NOT NULL,
	`next_due` text,
	`snoozed_until` text,
	`equipment_id` text,
	`open_form_on_done` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_next_due` ON `tasks` (`next_due`);--> statement-breakpoint
CREATE TABLE `test_readings` (
	`test_id` text NOT NULL,
	`parameter_id` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`test_id`, `parameter_id`),
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parameter_id`) REFERENCES `tank_parameters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`taken_at` text NOT NULL,
	`note` text,
	`edited_at` text,
	`client_id` text,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tests_tank_taken` ON `tests` (`tank_id`,`taken_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `tests_client` ON `tests` (`tank_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`unit_system` text DEFAULT 'imperial' NOT NULL,
	`hardness_unit` text DEFAULT 'dgh' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`setup_done` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);