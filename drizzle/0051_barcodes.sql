CREATE TABLE `barcode_lookups` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`brand` text,
	`category` text,
	`source` text,
	`source_url` text,
	`reason` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `equipment` ADD `barcode` text;--> statement-breakpoint
CREATE INDEX `equipment_barcode` ON `equipment` (`barcode`);--> statement-breakpoint
ALTER TABLE `server_settings` ADD `barcode_lookup` integer DEFAULT true NOT NULL;