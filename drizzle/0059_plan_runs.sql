CREATE TABLE `plan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tank_id` text NOT NULL,
	`template` text NOT NULL,
	`name` text NOT NULL,
	`started_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`ended_at` text,
	`ended_early` integer DEFAULT false NOT NULL,
	`paused_task_ids` text DEFAULT '[]' NOT NULL,
	`from_event_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tank_id`) REFERENCES `tanks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `plan_run_id` text REFERENCES plan_runs(id) ON DELETE set null;