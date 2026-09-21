-- Uma escala passa a aceitar qualquer quantidade de equipes do mesmo
-- ministério. A tabela preserva a função/local de cada equipe naquela escala,
-- e cada designação registra de qual equipe veio para a exibição ficar clara.
CREATE TABLE IF NOT EXISTS `escala_equipes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `escala_id` integer NOT NULL,
  `equipe_id` integer NOT NULL,
  `funcao` text DEFAULT '' NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`equipe_id`) REFERENCES `ministerio_equipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `escala_equipes_escala_equipe_unique`
  ON `escala_equipes` (`escala_id`, `equipe_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `escala_equipes_comunidade_escala_idx`
  ON `escala_equipes` (`comunidade_id`, `escala_id`, `equipe_id`);
--> statement-breakpoint
ALTER TABLE `escala_designacoes` ADD `equipe_id` integer
  REFERENCES `ministerio_equipes`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
-- A coluna legada continua como compatibilidade; as escalas existentes viram
-- automaticamente uma escala com uma única equipe.
INSERT OR IGNORE INTO `escala_equipes`
  (`comunidade_id`, `escala_id`, `equipe_id`, `funcao`)
SELECT `comunidade_id`, `id`, `equipe_id`, ''
FROM `escalas_ministerio`
WHERE `equipe_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `escala_designacoes`
SET `equipe_id` = (
  SELECT `equipe_id`
  FROM `escalas_ministerio`
  WHERE `escalas_ministerio`.`id` = `escala_designacoes`.`escala_id`
    AND `escalas_ministerio`.`comunidade_id` = `escala_designacoes`.`comunidade_id`
)
WHERE `equipe_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `escalas_ministerio`
    WHERE `escalas_ministerio`.`id` = `escala_designacoes`.`escala_id`
      AND `escalas_ministerio`.`comunidade_id` = `escala_designacoes`.`comunidade_id`
      AND `escalas_ministerio`.`equipe_id` IS NOT NULL
  );
