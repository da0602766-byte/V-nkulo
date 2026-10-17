CREATE TABLE `visitante_campos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`nome` text NOT NULL,
	`chave` text NOT NULL,
	`tipo` text DEFAULT 'TEXTO' NOT NULL,
	`criado_por` integer NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitante_campos_comunidade_chave_idx` ON `visitante_campos` (`comunidade_id`,`chave`);--> statement-breakpoint
ALTER TABLE `visitantes` ADD `campos_personalizados` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER visitante_campo_sheet_insert AFTER INSERT ON visitante_campos BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = NEW.comunidade_id;
END;
