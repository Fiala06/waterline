ALTER TABLE `stock_photos` ADD `reason` text;--> statement-breakpoint
-- 1.8.2 kept no reason; look those up again rather than waiting a day or a month
DELETE FROM `stock_photos` WHERE `status` <> 'ok';
