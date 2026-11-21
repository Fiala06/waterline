-- #307: each expense and wish-list price keeps the currency it was entered in.
-- What's already there was shown in the tank owner's currency preference, so it
-- takes that preference as it is today (no earlier choice was recorded, and
-- nothing is converted).
ALTER TABLE `expenses` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `wishes` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
UPDATE `expenses` SET `currency` = coalesce((SELECT `users`.`currency` FROM `tanks` JOIN `users` ON `users`.`id` = `tanks`.`user_id` WHERE `tanks`.`id` = `expenses`.`tank_id`), 'USD');--> statement-breakpoint
UPDATE `wishes` SET `currency` = coalesce((SELECT `users`.`currency` FROM `tanks` JOIN `users` ON `users`.`id` = `tanks`.`user_id` WHERE `tanks`.`id` = `wishes`.`tank_id`), 'USD');
