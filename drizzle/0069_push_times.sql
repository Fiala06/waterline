ALTER TABLE `notification_prefs` ADD `push_grouped` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `quiet_start` text;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `quiet_end` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `remind_at` text;