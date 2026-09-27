CREATE TABLE `event_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`uploaded_by_name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `event` ADD `photos_enabled` integer DEFAULT false NOT NULL;