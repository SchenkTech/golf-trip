CREATE TABLE `historical_round` (
	`year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`course_name` text NOT NULL,
	PRIMARY KEY(`year`, `round_number`),
	FOREIGN KEY (`year`) REFERENCES `historical_year`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historical_score` (
	`year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`player_id` text NOT NULL,
	`gross` real NOT NULL,
	`net` real NOT NULL,
	PRIMARY KEY(`year`, `round_number`, `player_id`),
	FOREIGN KEY (`year`) REFERENCES `historical_year`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historical_year` (
	`year` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
