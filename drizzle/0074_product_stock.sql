CREATE TABLE `product_stock` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`ml` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_stock_product` ON `product_stock` (`product_id`,`at`);--> statement-breakpoint
ALTER TABLE `products` ADD `low_ml` real;--> statement-breakpoint
ALTER TABLE `products` ADD `low_alert` integer DEFAULT false NOT NULL;