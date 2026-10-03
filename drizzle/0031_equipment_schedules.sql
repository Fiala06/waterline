CREATE TABLE `par_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`spot` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`value` integer NOT NULL,
	`note` text,
	`measured_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `par_readings_tank` ON `par_readings` (`tank_id`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `schedule` text;