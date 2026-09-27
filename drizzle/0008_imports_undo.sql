CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tank_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `imports_tank` ON `imports` (`tank_id`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `import_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `import_id` text;--> statement-breakpoint
ALTER TABLE `livestock` ADD `import_id` text;--> statement-breakpoint
ALTER TABLE `plants` ADD `import_id` text;--> statement-breakpoint
ALTER TABLE `tests` ADD `import_id` text;