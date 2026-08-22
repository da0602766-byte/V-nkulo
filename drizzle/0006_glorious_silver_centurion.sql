CREATE TABLE `diaconia_equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#17877f' NOT NULL,
	`responsavel` text NOT NULL,
	`integrantes` text DEFAULT '[]' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diaconia_equipes_nome_unique` ON `diaconia_equipes` (`nome`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`email` text NOT NULL,
	`perfil` text DEFAULT 'ACOMPANHANTE' NOT NULL,
	`permissoes` text DEFAULT '' NOT NULL,
	`foto_perfil` text,
	`telefone` text,
	`data_nascimento` text,
	`endereco` text,
	`celula` text,
	`ministerio` text,
	`observacoes` text,
	`senha_hash` text,
	`senha_salt` text,
	`tentativas_login` integer DEFAULT 0 NOT NULL,
	`bloqueado_ate` text,
	`titulo_eclesiastico` text DEFAULT 'MEMBRO' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_usuarios`("id", "nome", "email", "perfil", "permissoes", "foto_perfil", "telefone", "data_nascimento", "endereco", "celula", "ministerio", "observacoes", "senha_hash", "senha_salt", "tentativas_login", "bloqueado_ate", "titulo_eclesiastico", "ativo", "criado_em", "atualizado_em") SELECT "id", "nome", "email", "perfil", "permissoes", "foto_perfil", "telefone", "data_nascimento", "endereco", "celula", "ministerio", "observacoes", "senha_hash", "senha_salt", "tentativas_login", "bloqueado_ate", "titulo_eclesiastico", "ativo", "criado_em", "atualizado_em" FROM `usuarios`;--> statement-breakpoint
DROP TABLE `usuarios`;--> statement-breakpoint
ALTER TABLE `__new_usuarios` RENAME TO `usuarios`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_email_unique` ON `usuarios` (`email`);--> statement-breakpoint
ALTER TABLE `diaconias` ADD `equipe_id` integer REFERENCES diaconia_equipes(id);--> statement-breakpoint
ALTER TABLE `diaconias` ADD `checklist` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `diaconias` ADD `cumprida` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `louvor_escalas` ADD `links` text DEFAULT '[]' NOT NULL;