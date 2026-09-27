CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`secret_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`tank_ids` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `assistant_tokens` ADD `client_id` text REFERENCES oauth_clients(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `assistant_tokens` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `assistant_tokens` ADD `refresh_hash` text;--> statement-breakpoint
ALTER TABLE `assistant_tokens` ADD `refresh_expires_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_tokens_refresh` ON `assistant_tokens` (`refresh_hash`);