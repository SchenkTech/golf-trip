CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`logo_url` text
);
--> statement-breakpoint
CREATE TABLE `hole_score` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`hole_number` integer NOT NULL,
	`gross` integer,
	`entered_by` text NOT NULL,
	`entered_at` integer NOT NULL,
	`client_id` text NOT NULL,
	`queued_at` integer,
	PRIMARY KEY(`match_id`, `player_id`, `hole_number`),
	FOREIGN KEY (`match_id`) REFERENCES `match`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entered_by`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `round`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_player` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`side` text NOT NULL,
	`strokes_received` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `match`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`nickname` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `round` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`tee_set_id` text NOT NULL,
	`date` text NOT NULL,
	`tee_time` text,
	`scoring_format` text NOT NULL,
	`team_format` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tee_set_id`) REFERENCES `tee_set`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`logo_url` text,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_member` (
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`handicap_index` real NOT NULL,
	PRIMARY KEY(`team_id`, `player_id`),
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tee_hole` (
	`tee_set_id` text NOT NULL,
	`number` integer NOT NULL,
	`par` integer NOT NULL,
	`stroke_index` integer NOT NULL,
	`yards` integer,
	PRIMARY KEY(`tee_set_id`, `number`),
	FOREIGN KEY (`tee_set_id`) REFERENCES `tee_set`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tee_set` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`color` text NOT NULL,
	`rating` real NOT NULL,
	`slope` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
