CREATE TABLE `payout_line` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`label` text NOT NULL,
	`cost` real NOT NULL,
	`payout` real NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `round`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `event` ADD `total_cost` real;