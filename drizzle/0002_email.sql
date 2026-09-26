CREATE TABLE `action_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`due` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_log_key` ON `email_log` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `server_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`email_provider` text,
	`mailgun_api_key_enc` text,
	`mailgun_domain` text,
	`mailgun_region` text DEFAULT 'us' NOT NULL,
	`smtp_host` text,
	`smtp_port` integer,
	`smtp_secure` integer DEFAULT true NOT NULL,
	`smtp_user` text,
	`smtp_password_enc` text,
	`sender` text
);
--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `unsubscribed_at` text;