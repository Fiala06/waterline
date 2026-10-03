CREATE TABLE `sensor_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`parameter_id` text NOT NULL,
	`value` real NOT NULL,
	`at` text NOT NULL,
	`source` text NOT NULL,
	`token_id` text,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parameter_id`) REFERENCES `tank_parameters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`token_id`) REFERENCES `assistant_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sensor_readings_tank_param_at` ON `sensor_readings` (`tank_id`,`parameter_id`,`at`);--> statement-breakpoint
ALTER TABLE `assistant_tokens` ADD `kind` text DEFAULT 'assistant' NOT NULL;