CREATE TABLE `photo_livestock` (
	`photo_id` text NOT NULL,
	`livestock_id` text NOT NULL,
	PRIMARY KEY(`photo_id`, `livestock_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`livestock_id`) REFERENCES `livestock`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_livestock_livestock` ON `photo_livestock` (`livestock_id`);--> statement-breakpoint
ALTER TABLE `public_pages` ADD `show_pet_names` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- pets' profile photos are in their galleries
INSERT OR IGNORE INTO `photo_livestock` (`photo_id`, `livestock_id`) SELECT `photo_id`, `id` FROM `livestock` WHERE `photo_id` IS NOT NULL;
