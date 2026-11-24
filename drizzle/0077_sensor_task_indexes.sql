CREATE INDEX `sensor_readings_at` ON `sensor_readings` (`at`);--> statement-breakpoint
CREATE INDEX `sensor_readings_param` ON `sensor_readings` (`parameter_id`);--> statement-breakpoint
CREATE INDEX `sensor_readings_token` ON `sensor_readings` (`token_id`) WHERE token_id is not null;--> statement-breakpoint
CREATE INDEX `task_completions_task` ON `task_completions` (`task_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `tasks_tank` ON `tasks` (`tank_id`);