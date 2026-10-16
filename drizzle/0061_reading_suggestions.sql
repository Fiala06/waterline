ALTER TABLE `tanks` ADD `suggestions_off` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `temp_until_param` text REFERENCES tank_parameters(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` ADD `paused_until_param` text REFERENCES tank_parameters(id) ON DELETE set null;