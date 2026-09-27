CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`what` text NOT NULL,
	`note` text,
	`product_id` text,
	`receipt_path` text,
	`receipt_type` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_tank_date` ON `expenses` (`tank_id`,`date`);--> statement-breakpoint
ALTER TABLE `users` ADD `currency` text DEFAULT 'USD' NOT NULL;