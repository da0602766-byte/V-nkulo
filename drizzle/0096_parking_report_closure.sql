ALTER TABLE estacionamento_relatorios_escala ADD COLUMN motivo_correcao TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE estacionamento_relatorios_escala
SET status = 'CORRECAO_SOLICITADA'
WHERE status = 'AGUARDANDO_MEMBRO' AND revisado_por IS NOT NULL;
