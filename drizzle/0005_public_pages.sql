CREATE TABLE `photo_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`include_note` integer DEFAULT true NOT NULL,
	`include_tank` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `public_page_views` (
	`tank_id` text NOT NULL,
	`day` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`tank_id`, `day`),
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `public_pages` (
	`tank_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`slug` text NOT NULL,
	`show_readings` integer DEFAULT true NOT NULL,
	`show_charts` integer DEFAULT true NOT NULL,
	`show_photos` integer DEFAULT true NOT NULL,
	`show_activity` integer DEFAULT true NOT NULL,
	`show_livestock` integer DEFAULT true NOT NULL,
	`show_equipment` integer DEFAULT true NOT NULL,
	`show_description` integer DEFAULT true NOT NULL,
	`description` text,
	`display_name` text DEFAULT 'short' NOT NULL,
	`indexable` integer DEFAULT false NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`og_photo_id` text,
	`og_plain` integer DEFAULT false NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_pages_slug` ON `public_pages` (`slug`);--> statement-breakpoint
ALTER TABLE `server_settings` ADD `allow_public_pages` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `public_home_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `public_base_url` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `ga4_id` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `consent_banner` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `search_console_tag` text;