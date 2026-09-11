CREATE TABLE `acompanhamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitante_id` integer NOT NULL,
	`responsavel_email` text NOT NULL,
	`tipo` text NOT NULL,
	`resultado` text NOT NULL,
	`descricao` text,
	`proximo_contato` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`visitante_id`) REFERENCES `visitantes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`email` text NOT NULL,
	`perfil` text DEFAULT 'ACOMPANHANTE' NOT NULL,
	`permissoes` text DEFAULT 'VISITANTES_VER' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_email_unique` ON `usuarios` (`email`);--> statement-breakpoint
CREATE TABLE `visitantes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome_completo` text NOT NULL,
	`data_nascimento` text,
	`telefone` text,
	`email` text,
	`batizado` text DEFAULT 'NAO_INFORMADO' NOT NULL,
	`status` text DEFAULT 'NOVO' NOT NULL,
	`endereco` text,
	`acompanhante` text,
	`celula` text,
	`encontro_com_deus` integer DEFAULT false NOT NULL,
	`curso_membros` integer DEFAULT false NOT NULL,
	`ministerio` text,
	`data_entrada` text NOT NULL,
	`observacoes` text,
	`criado_por` text NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
