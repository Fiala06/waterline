CREATE TABLE `source_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`tank_id` text NOT NULL,
	`taken_at` text NOT NULL,
	`note` text,
	`readings` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `water_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_tests_source` ON `source_tests` (`source_id`,`taken_at`);--> statement-breakpoint
CREATE TABLE `water_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'tap' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `water_sources_tank` ON `water_sources` (`tank_id`);