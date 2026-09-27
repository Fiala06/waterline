ALTER TABLE `livestock` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `livestock` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `livestock` ADD `photo_id` text REFERENCES photos(id) ON DELETE set null;