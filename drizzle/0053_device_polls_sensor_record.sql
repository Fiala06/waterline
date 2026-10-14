CREATE TABLE `device_polls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tank_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`username` text,
	`password_enc` text,
	`sensors` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_polled_at` text,
	`last_ok_at` text,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_polls_user` ON `device_polls` (`user_id`);--> statement-breakpoint
CREATE INDEX `device_polls_tank` ON `device_polls` (`tank_id`);--> statement-breakpoint
ALTER TABLE `tank_parameters` ADD `sensor_record` integer DEFAULT false NOT NULL;