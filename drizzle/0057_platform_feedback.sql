-- Central global de feedback, melhorias e denúncias.
CREATE TABLE `feedback_plataforma` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`comunidade_id` integer,
	`tipo` text NOT NULL,
	`categoria` text NOT NULL,
	`mensagem` text NOT NULL,
	`pagina` text DEFAULT '' NOT NULL,
	`entidade_tipo` text DEFAULT '' NOT NULL,
	`entidade_id` integer,
	`imagem_chave` text DEFAULT '' NOT NULL,
	`imagem_nome` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`resposta_proprietario` text DEFAULT '' NOT NULL,
	`respondido_por` integer,
	`respondido_em` text,
	`arquivado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`respondido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_plataforma_status_idx` ON `feedback_plataforma` (`status`,`criado_em`);
--> statement-breakpoint
CREATE INDEX `feedback_plataforma_usuario_idx` ON `feedback_plataforma` (`usuario_id`,`criado_em`);
--> statement-breakpoint
CREATE INDEX `feedback_plataforma_tipo_idx` ON `feedback_plataforma` (`tipo`,`categoria`,`criado_em`);
--> statement-breakpoint
PRAGMA optimize;
