ALTER TABLE `equipment_plugs` ADD `hook_token` text;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `report_url` text;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `hooks_at` text;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `hooks_error` text;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `run_started_at` text;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `run_planned_s` integer;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `auto_off_s` integer;--> statement-breakpoint
ALTER TABLE `equipment_plugs` ADD `paused_schedule_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_plugs_hook` ON `equipment_plugs` (`hook_token`);