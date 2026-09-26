CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`type` text NOT NULL,
	`brand` text,
	`model` text,
	`specs` text DEFAULT '{}' NOT NULL,
	`installed_at` text,
	`last_serviced_at` text,
	`notes` text,
	`removed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipment_tank` ON `equipment` (`tank_id`);--> statement-breakpoint
CREATE TABLE `livestock` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`kind` text NOT NULL,
	`common_name` text NOT NULL,
	`scientific_name` text,
	`count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'in_tank' NOT NULL,
	`added_at` text,
	`source` text,
	`removed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `livestock_tank` ON `livestock` (`tank_id`);--> statement-breakpoint
CREATE TABLE `plants` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`name` text NOT NULL,
	`scientific_name` text,
	`position` text DEFAULT 'midground' NOT NULL,
	`status` text DEFAULT 'thriving' NOT NULL,
	`last_trimmed_at` text,
	`removed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plants_tank` ON `plants` (`tank_id`);--> statement-breakpoint
ALTER TABLE `tanks` ADD `spec_brand` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `spec_model` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `glass` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `substrate` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `water_source` text;--> statement-breakpoint
ALTER TABLE `tanks` ADD `photoperiod_h` real;