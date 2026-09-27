CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`level` text NOT NULL,
	`area` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`user_id` text,
	`ref` text
);
--> statement-breakpoint
CREATE INDEX `logs_at` ON `logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `logs_ref` ON `logs` (`ref`);--> statement-breakpoint
ALTER TABLE `server_settings` ADD `log_level` text DEFAULT 'warn' NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `log_debug_until` text;