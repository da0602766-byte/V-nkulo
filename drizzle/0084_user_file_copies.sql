CREATE TABLE `user_file_copies` (
	`usuario_id` integer NOT NULL,
	`google_account` text NOT NULL,
	`content_hash` text NOT NULL,
	`drive_id` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`usuario_id`, `google_account`, `content_hash`)
);
