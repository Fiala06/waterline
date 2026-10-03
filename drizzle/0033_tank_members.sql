CREATE TABLE `tank_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`role` text DEFAULT 'log' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tank_members_tank` ON `tank_members` (`tank_id`);--> statement-breakpoint
CREATE INDEX `tank_members_user` ON `tank_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tank_members_token` ON `tank_members` (`token_hash`);--> statement-breakpoint
ALTER TABLE `events` ADD `logged_by` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `remind_to` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `tanks` ADD `alert_to` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `tests` ADD `logged_by` text;