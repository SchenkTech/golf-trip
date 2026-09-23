CREATE TABLE `historical_player_record` (
	`year` integer NOT NULL,
	`player_id` text NOT NULL,
	`format` text NOT NULL,
	`wins` real NOT NULL,
	`losses` real NOT NULL,
	PRIMARY KEY(`year`, `player_id`, `format`),
	FOREIGN KEY (`year`) REFERENCES `historical_year`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
