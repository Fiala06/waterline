ALTER TABLE `expenses` ADD `equipment_id` text REFERENCES equipment(id);--> statement-breakpoint
CREATE INDEX `expenses_equipment` ON `expenses` (`equipment_id`);