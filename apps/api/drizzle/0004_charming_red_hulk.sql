CREATE TABLE `historical_match` (
	`year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`match_number` integer NOT NULL,
	`front9_winner` text NOT NULL,
	`back9_winner` text NOT NULL,
	`overall_winner` text NOT NULL,
	PRIMARY KEY(`year`, `round_number`, `match_number`),
	FOREIGN KEY (`year`) REFERENCES `historical_year`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historical_match_player` (
	`year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`match_number` integer NOT NULL,
	`player_id` text NOT NULL,
	`side` text NOT NULL,
	PRIMARY KEY(`year`, `round_number`, `match_number`, `player_id`),
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `historical_round` ADD `points_per_match` real;