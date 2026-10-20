CREATE TABLE `auto_doses` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`product` text NOT NULL,
	`amount_ml` real NOT NULL,
	`at` text NOT NULL,
	`seconds` integer,
	`weekdays` text,
	`paused` integer DEFAULT false NOT NULL,
	`last_logged_on` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auto_doses_equipment` ON `auto_doses` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `auto_doses_tank` ON `auto_doses` (`tank_id`);