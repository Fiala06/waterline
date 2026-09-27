CREATE TABLE `assistant_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`hint` text NOT NULL,
	`tank_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_tokens_hash` ON `assistant_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `assistant_tokens_user` ON `assistant_tokens` (`user_id`);