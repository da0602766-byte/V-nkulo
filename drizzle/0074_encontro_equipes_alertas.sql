-- Cada equipe pode ter uma orientação de encontro própria na mesma escala.
-- Defaults constantes preservam as escalas já existentes sem exigir backfill.
ALTER TABLE `escala_equipes` ADD `ponto_encontro` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `escala_equipes` ADD `horario_encontro` text DEFAULT '' NOT NULL;
