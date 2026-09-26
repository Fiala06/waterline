CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`tank_id` text,
	`format` text NOT NULL,
	`status` text DEFAULT 'building' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`progress_text` text,
	`file_path` text,
	`file_name` text,
	`size` integer,
	`summary` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exports_user` ON `exports` (`user_id`);