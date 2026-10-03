CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`accepted_user_id` text,
	`revoked_at` text,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_email` ON `invites` (`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `sessions_revoked_at` text;