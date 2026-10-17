CREATE TABLE `maintenance_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`name` text NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_routines_tank` ON `maintenance_routines` (`tank_id`);