CREATE TABLE `equipment_plugs` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`tank_id` text NOT NULL,
	`url` text NOT NULL,
	`name` text,
	`password_enc` text,
	`switch_id` integer DEFAULT 0 NOT NULL,
	`on` integer,
	`watts` real,
	`last_polled_at` text,
	`last_ok_at` text,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_plugs_equipment_id_unique` ON `equipment_plugs` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `equipment_plugs_tank` ON `equipment_plugs` (`tank_id`);