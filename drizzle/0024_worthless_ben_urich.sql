ALTER TABLE `publicacoes_piloto` ADD `imagem_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `imagem_thumbnail_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `imagem_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `imagem_width` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `imagem_height` integer DEFAULT 0 NOT NULL;