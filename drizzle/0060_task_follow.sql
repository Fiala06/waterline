ALTER TABLE `tasks` ADD `trigger_kind` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `trigger_offset_days` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `trigger_product` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `trigger_entry_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `avoid_water_change` integer DEFAULT false NOT NULL;