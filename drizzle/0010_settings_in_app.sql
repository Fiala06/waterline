ALTER TABLE `server_settings` ADD `google_client_id` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `google_client_secret_enc` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `admin_email` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `signup_mode` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `allowed_emails` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `local_admin_username` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `local_admin_password_hash` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `scheduled_emails` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `update_check` integer DEFAULT true NOT NULL;