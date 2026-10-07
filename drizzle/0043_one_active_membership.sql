-- One active membership per person and tank (#117). Repair any duplicates
-- first: the earliest accepted row stays, with the higher of their roles; the
-- others are marked removed (kept as history).
UPDATE `tank_members` SET `role` = 'log'
WHERE `accepted_at` IS NOT NULL AND `revoked_at` IS NULL AND `user_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `tank_members` o WHERE o.`tank_id` = `tank_members`.`tank_id` AND o.`user_id` = `tank_members`.`user_id`
		AND o.`accepted_at` IS NOT NULL AND o.`revoked_at` IS NULL AND o.`role` = 'log');
--> statement-breakpoint
UPDATE `tank_members` SET `revoked_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `accepted_at` IS NOT NULL AND `revoked_at` IS NULL AND `user_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `tank_members` o WHERE o.`tank_id` = `tank_members`.`tank_id` AND o.`user_id` = `tank_members`.`user_id`
		AND o.`accepted_at` IS NOT NULL AND o.`revoked_at` IS NULL
		AND (o.`accepted_at` < `tank_members`.`accepted_at` OR (o.`accepted_at` = `tank_members`.`accepted_at` AND o.`id` < `tank_members`.`id`)));
--> statement-breakpoint
CREATE UNIQUE INDEX `tank_members_active` ON `tank_members` (`tank_id`,`user_id`) WHERE "tank_members"."accepted_at" is not null and "tank_members"."revoked_at" is null;
