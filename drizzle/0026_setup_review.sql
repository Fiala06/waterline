ALTER TABLE `tanks` ADD `review_checks` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- the setup review (#30): every tank gets one, first due 3 months after this update,
-- so updating doesn't fill everyone's Due list on the day
INSERT INTO `tasks` (`id`, `tank_id`, `name`, `kind`, `recurring`, `interval_days`, `schedule_mode`, `next_due`, `open_form_on_done`)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
	`id`, 'Review tank setup', 'review', 1, 91, 'completion', date('now', '+91 days'), 0
FROM `tanks`
WHERE NOT EXISTS (SELECT 1 FROM `tasks` WHERE `tasks`.`tank_id` = `tanks`.`id` AND `tasks`.`kind` = 'review');
