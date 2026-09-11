CREATE TABLE `google_native_handoffs` (
  `pairing_hash` text PRIMARY KEY NOT NULL,
  `purpose` text NOT NULL,
  `requested_user_id` integer,
  `return_to` text NOT NULL,
  `completed_user_id` integer,
  `error_message` text,
  `expires_at` text NOT NULL,
  `completed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`requested_user_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`completed_user_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `google_native_handoffs_expiry_idx` ON `google_native_handoffs` (`expires_at`);
