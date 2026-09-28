CREATE TABLE `stock_photos` (
	`name` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`file` text,
	`width` integer,
	`height` integer,
	`author` text,
	`license` text,
	`license_url` text,
	`page_url` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `plants` ADD `photo_id` text REFERENCES photos(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `stock_photos` integer DEFAULT true NOT NULL;