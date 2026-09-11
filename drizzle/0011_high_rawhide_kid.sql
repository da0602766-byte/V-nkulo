CREATE TABLE `mensagens_exibicao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`mensagem` text NOT NULL,
	`tipo` text DEFAULT 'INFO' NOT NULL,
	`areas` text DEFAULT '[]' NOT NULL,
	`animacao` text DEFAULT 'SUAVE' NOT NULL,
	`intervalo_segundos` integer DEFAULT 7 NOT NULL,
	`inicia_em` text,
	`termina_em` text,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
