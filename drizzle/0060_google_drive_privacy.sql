CREATE TABLE `google_connections` (
  `usuario_id` integer PRIMARY KEY NOT NULL,
  `google_sub` text NOT NULL,
  `google_email` text NOT NULL,
  `refresh_token_ciphertext` text,
  `refresh_token_iv` text,
  `scopes` text DEFAULT 'openid email profile' NOT NULL,
  `drive_enabled` integer DEFAULT 0 NOT NULL,
  `connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `revoked_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_connections_google_sub_unique` ON `google_connections` (`google_sub`);
--> statement-breakpoint
CREATE INDEX `google_connections_email_idx` ON `google_connections` (`google_email`);
--> statement-breakpoint
CREATE TABLE `storage_preferences` (
  `usuario_id` integer PRIMARY KEY NOT NULL,
  `provider` text DEFAULT 'LOCAL' NOT NULL,
  `auto_load_recent` integer DEFAULT 1 NOT NULL,
  `auto_download_files` integer DEFAULT 0 NOT NULL,
  `consented_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_drive_storage` (
  `comunidade_id` integer PRIMARY KEY NOT NULL,
  `proprietario_usuario_id` integer NOT NULL,
  `pasta_raiz_id` text NOT NULL,
  `pasta_midias_id` text NOT NULL,
  `pasta_conversas_id` text NOT NULL,
  `status_migracao` text DEFAULT 'PENDING' NOT NULL,
  `migrado_em` text,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`proprietario_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `community_drive_owner_idx` ON `community_drive_storage` (`proprietario_usuario_id`);
--> statement-breakpoint
CREATE TABLE `user_drive_storage` (
  `usuario_id` integer PRIMARY KEY NOT NULL,
  `pasta_raiz_id` text NOT NULL,
  `pasta_midias_privadas_id` text NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `conversas_privadas` ADD `drive_file_id` text;
--> statement-breakpoint
ALTER TABLE `conversas_privadas` ADD `storage_provider` text DEFAULT 'PLATFORM_LEGACY' NOT NULL;
