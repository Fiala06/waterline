ALTER TABLE `tasks` ADD `temp_interval_days` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `temp_until` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `paused_from` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `paused_until` text;