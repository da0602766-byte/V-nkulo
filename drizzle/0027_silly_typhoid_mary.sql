ALTER TABLE `comunidades` ADD `proprietario_usuario_id` integer REFERENCES usuarios(id);--> statement-breakpoint
UPDATE `comunidades`
SET `proprietario_usuario_id` = (
  SELECT uc.`usuario_id`
  FROM `usuario_comunidades` uc
  JOIN `usuarios` u ON u.`id` = uc.`usuario_id`
  WHERE uc.`comunidade_id` = `comunidades`.`id`
    AND uc.`status` = 'ATIVO'
    AND uc.`papel` = 'ADMIN_COMUNIDADE'
    AND u.`ativo` = 1
  ORDER BY uc.`criado_em` ASC, uc.`id` ASC
  LIMIT 1
)
WHERE `proprietario_usuario_id` IS NULL;
