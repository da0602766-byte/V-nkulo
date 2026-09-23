-- Assinaturas antigas ficam sem sessão e não recebem novos envios até a
-- reconciliação autenticada do mesmo aparelho e da mesma conta.
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN sessao_token_hash text
  REFERENCES sessoes(token_hash) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN vinculo_id text;
--> statement-breakpoint
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN ultima_tentativa_em text;
--> statement-breakpoint
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN ultimo_aceite_em text;
--> statement-breakpoint
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN ultimo_status integer;
--> statement-breakpoint
ALTER TABLE notificacoes_push_dispositivos ADD COLUMN falhas_consecutivas integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX notificacoes_push_dispositivos_sessao_idx
  ON notificacoes_push_dispositivos(sessao_token_hash);
--> statement-breakpoint
CREATE UNIQUE INDEX notificacoes_push_dispositivos_vinculo_unique
  ON notificacoes_push_dispositivos(vinculo_id);
