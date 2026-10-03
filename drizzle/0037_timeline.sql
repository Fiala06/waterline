ALTER TABLE `photos` ADD `in_timeline` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `public_pages` ADD `show_timeline` integer DEFAULT false NOT NULL;