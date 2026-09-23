-- Trabalho persistido na mesma transação da notificação. Sem replay de avisos antigos.
CREATE TABLE notificacoes_push_fila (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  notificacao_id integer NOT NULL REFERENCES notificacoes_sistema(id) ON DELETE CASCADE,
  dispositivo_id integer NOT NULL REFERENCES notificacoes_push_dispositivos(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vinculo_id text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDENTE' CHECK (estado IN ('PENDENTE','PROCESSANDO','ACEITO','FALHA','EXPIRADA','CANCELADA')),
  tentativas integer NOT NULL DEFAULT 0,
  proxima_tentativa_em integer NOT NULL DEFAULT (unixepoch() * 1000),
  expira_em integer NOT NULL DEFAULT ((unixepoch() + 86400) * 1000),
  lease_token text,
  lease_ate integer NOT NULL DEFAULT 0,
  ultimo_status integer,
  motivo text,
  criado_em text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX notificacoes_push_fila_evento_vinculo_unique ON notificacoes_push_fila(notificacao_id,vinculo_id);
--> statement-breakpoint
CREATE INDEX notificacoes_push_fila_pendente_idx ON notificacoes_push_fila(estado,proxima_tentativa_em,id);
--> statement-breakpoint
CREATE INDEX notificacoes_push_fila_lease_idx ON notificacoes_push_fila(estado,lease_ate,id);
--> statement-breakpoint
CREATE INDEX notificacoes_push_fila_historico_idx ON notificacoes_push_fila(atualizado_em);
--> statement-breakpoint
CREATE INDEX notificacoes_push_fila_dispositivo_idx ON notificacoes_push_fila(dispositivo_id);
--> statement-breakpoint
CREATE INDEX notificacoes_push_fila_usuario_idx ON notificacoes_push_fila(usuario_id);
--> statement-breakpoint
CREATE TABLE notificacoes_push_controle (
  id integer PRIMARY KEY NOT NULL CHECK (id = 1),
  lease_token text,
  lease_ate integer NOT NULL DEFAULT 0,
  ultimo_inicio_em text,
  ultimo_fim_em text,
  ultimo_agendamento_em text,
  ultimo_erro text
);
--> statement-breakpoint
INSERT INTO notificacoes_push_controle(id) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER notificacoes_push_enfileirar AFTER INSERT ON notificacoes_sistema
WHEN NEW.usuario_id IS NOT NULL AND NEW.area <> 'CHAT'
BEGIN
  INSERT INTO notificacoes_push_fila(notificacao_id,dispositivo_id,usuario_id,vinculo_id)
  SELECT NEW.id,p.id,p.usuario_id,p.vinculo_id
  FROM notificacoes_push_dispositivos p
  JOIN sessoes s ON s.token_hash = p.sessao_token_hash AND s.usuario_id = p.usuario_id
  JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
  WHERE p.usuario_id = NEW.usuario_id AND p.vinculo_id IS NOT NULL
    AND datetime(s.expira_em) > CURRENT_TIMESTAMP
    AND (p.expiracao_em IS NULL OR datetime(p.expiracao_em) > CURRENT_TIMESTAMP);
END;
