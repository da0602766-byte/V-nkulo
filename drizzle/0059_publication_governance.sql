ALTER TABLE `publicacoes_piloto` ADD `audiencia_tipo` text DEFAULT 'PUBLICO' NOT NULL;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `ministerios_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `canal_feed` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `canal_lateral` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `aprovacao_status` text DEFAULT 'APROVADA' NOT NULL;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `aprovado_por` integer REFERENCES `usuarios`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `aprovado_em` text;
--> statement-breakpoint
ALTER TABLE `agenda_compromissos` ADD `aprovacao_status` text DEFAULT 'APROVADA' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agenda_compromissos` ADD `aprovado_por` integer REFERENCES `usuarios`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `agenda_compromissos` ADD `aprovado_em` text;
--> statement-breakpoint
CREATE INDEX `publicacoes_piloto_canal_status_idx` ON `publicacoes_piloto` (`comunidade_id`,`canal_feed`,`status`,`criado_em`);
--> statement-breakpoint
CREATE INDEX `agenda_compromissos_aprovacao_idx` ON `agenda_compromissos` (`comunidade_id`,`visibilidade`,`aprovacao_status`,`inicia_em`);
--> statement-breakpoint
PRAGMA optimize;
