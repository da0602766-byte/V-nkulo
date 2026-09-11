CREATE TABLE `fio_registros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`autor_usuario_id` integer NOT NULL,
	`camada` text DEFAULT 'PESSOAS' NOT NULL,
	`titulo` text NOT NULL,
	`detalhe` text DEFAULT '' NOT NULL,
	`ocorre_em` text NOT NULL,
	`visibilidade` text DEFAULT 'LIDERANCA' NOT NULL,
	`vinculo_tipo` text DEFAULT '' NOT NULL,
	`vinculo_id` integer,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fio_registros_dia_idx` ON `fio_registros` (`comunidade_id`,`ativo`,`ocorre_em`);
