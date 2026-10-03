ALTER TABLE `tank_parameters` ADD `test_every_days` integer;--> statement-breakpoint
ALTER TABLE `tanks` ADD `lights_on` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `lights_off` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `co2_on` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `co2_off` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `cycling` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `ends_on` text;--> statement-breakpoint
ALTER TABLE `users` ADD `alerts_seen` text DEFAULT '[]' NOT NULL;