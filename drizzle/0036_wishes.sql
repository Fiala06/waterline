CREATE TABLE `wishes` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`scientific_name` text,
	`count` integer DEFAULT 1 NOT NULL,
	`equipment_type` text,
	`note` text,
	`price_cents` integer,
	`url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`added_at` text,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wishes_tank` ON `wishes` (`tank_id`);