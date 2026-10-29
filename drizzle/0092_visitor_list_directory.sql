ALTER TABLE `visitante_acessos` ADD `concedido_por` integer REFERENCES usuarios(id) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE visitante_acessos SET concedido_por=(SELECT h.autor_id FROM visitante_acesso_historico h WHERE h.comunidade_id=visitante_acessos.comunidade_id AND h.membro_id=visitante_acessos.usuario_id AND h.acao IN ('CONCEDIDO','ALTERADO') AND h.papel=visitante_acessos.papel ORDER BY h.id DESC LIMIT 1) WHERE concedido_por IS NULL;
