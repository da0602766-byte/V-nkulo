-- Corrige o arquivamento amplo aplicado pela migração 0040.
-- IDs 1 e 2 são as sementes demonstrativas oficiais e continuam arquivadas.
-- Comunidades posteriores, com proprietário ou vínculo ativo, são espaços reais
-- administrados por usuários e devem permanecer disponíveis.
INSERT INTO `auditoria_piloto`
(`comunidade_id`, `usuario_id`, `evento`, `resultado`, `metadados`)
SELECT c.`id`, c.`proprietario_usuario_id`,
  'COMUNIDADE_REAL_RESTAURADA_APOS_ARQUIVAMENTO', 'SUCESSO',
  '{"origem":"MIGRACAO_0041","regra":"id_maior_que_2_com_gestao_ativa"}'
FROM `comunidades` c
WHERE c.`id` > 2
  AND c.`ambiente_demo` = 1
  AND c.`status` = 'ARQUIVADA'
  AND (
    c.`proprietario_usuario_id` IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM `usuario_comunidades` uc
      WHERE uc.`comunidade_id` = c.`id` AND uc.`status` = 'ATIVO'
    )
  );
--> statement-breakpoint
UPDATE `comunidades`
SET `status` = 'ATIVA', `ambiente_demo` = 0
WHERE `id` > 2
  AND `ambiente_demo` = 1
  AND `status` = 'ARQUIVADA'
  AND (
    `proprietario_usuario_id` IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM `usuario_comunidades` uc
      WHERE uc.`comunidade_id` = `comunidades`.`id`
        AND uc.`status` = 'ATIVO'
    )
  );
--> statement-breakpoint
UPDATE `estacionamento_configuracoes`
SET `ativo` = 1, `atualizado_em` = CURRENT_TIMESTAMP
WHERE `comunidade_id` IN (
  SELECT `id` FROM `comunidades`
  WHERE `id` > 2 AND `ambiente_demo` = 0 AND `status` = 'ATIVA'
);
