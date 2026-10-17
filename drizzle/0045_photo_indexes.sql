CREATE INDEX `photos_tank_taken` ON `photos` (`tank_id`,`taken_at`,`id`);--> statement-breakpoint
CREATE INDEX `photos_event` ON `photos` (`event_id`);--> statement-breakpoint
CREATE INDEX `photos_test` ON `photos` (`test_id`);