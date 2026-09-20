CREATE TABLE `award` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`holder_id` text,
	`reason` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
