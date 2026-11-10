ALTER TABLE `email_log` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_log` ADD `retry_at` text;