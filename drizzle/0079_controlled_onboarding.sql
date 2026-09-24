-- Additive migration: existing accounts, memberships and commercial records remain intact.
ALTER TABLE convites_comunidade ADD COLUMN uso_chave TEXT;
--> statement-breakpoint
ALTER TABLE links_cadastro_membros ADD COLUMN max_usos INTEGER NOT NULL DEFAULT 100 CHECK(max_usos BETWEEN 1 AND 10000);
--> statement-breakpoint
ALTER TABLE links_cadastro_membros ADD COLUMN usos INTEGER NOT NULL DEFAULT 0 CHECK(usos >= 0);
--> statement-breakpoint
UPDATE links_cadastro_membros SET usos=(SELECT COUNT(*) FROM cadastros_membros_temporarios WHERE link_id=links_cadastro_membros.id);
--> statement-breakpoint
CREATE TABLE identidades_cpf (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  cpf_hash TEXT NOT NULL UNIQUE,
  finais TEXT NOT NULL CHECK(length(finais) = 2),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE auth_rate_limits (
  chave TEXT PRIMARY KEY,
  tentativas INTEGER NOT NULL DEFAULT 1,
  expira_em INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE planos_plataforma (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor_centavos INTEGER CHECK(valor_centavos IS NULL OR valor_centavos >= 0),
  periodicidade TEXT NOT NULL DEFAULT 'MENSAL' CHECK(periodicidade IN ('MENSAL','ANUAL','UNICO','PERSONALIZADO')),
  duracao_dias INTEGER CHECK(duracao_dias IS NULL OR duracao_dias > 0),
  ativo INTEGER NOT NULL DEFAULT 0,
  contratavel INTEGER NOT NULL DEFAULT 0,
  destaque INTEGER NOT NULL DEFAULT 0,
  personalizado INTEGER NOT NULL DEFAULT 0,
  modulos TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(modulos)),
  recursos TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(recursos)),
  limites TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(limites)),
  condicoes TEXT NOT NULL DEFAULT '',
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- Requested names only. No invented price, quota, entitlement or active offer.
INSERT INTO planos_plataforma (id,nome,valor_centavos,personalizado,periodicidade) VALUES
 ('gratuito','Gratuito',0,0,'UNICO'),
 ('comunidade-mais','Comunidade+',NULL,0,'MENSAL'),
 ('community-church','Community Church',NULL,0,'MENSAL'),
 ('personalizado','Personalizado',NULL,1,'PERSONALIZADO');
--> statement-breakpoint
CREATE TABLE solicitacoes_log1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  nascimento TEXT NOT NULL,
  cpf_hash TEXT NOT NULL,
  cpf_finais TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOVA' CHECK(status IN ('NOVA','EM_ANALISE','LINK_GERADO','CONTRATADA','ATIVADA','RECUSADA','EXPIRADA')),
  planos_permitidos TEXT NOT NULL DEFAULT '[]',
  proposta TEXT,
  plano_id TEXT REFERENCES planos_plataforma(id),
  contrato TEXT,
  email TEXT,
  senha_hash TEXT,
  senha_salt TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comunidade_nome TEXT,
  comunidade_cidade TEXT,
  comunidade_id INTEGER REFERENCES comunidades(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao TEXT NOT NULL DEFAULT '',
  ativacao_chave TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retencao_ate TEXT NOT NULL DEFAULT (datetime('now','+180 days'))
);
--> statement-breakpoint
CREATE INDEX log1_status_idx ON solicitacoes_log1(status,criado_em);
--> statement-breakpoint
CREATE UNIQUE INDEX log1_cpf_aberto_idx ON solicitacoes_log1(cpf_hash)
 WHERE status IN ('NOVA','EM_ANALISE','LINK_GERADO','CONTRATADA');
--> statement-breakpoint
CREATE TABLE links_contratacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes_log1(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  finalidade TEXT NOT NULL DEFAULT 'CONTRATACAO' CHECK(finalidade = 'CONTRATACAO'),
  expira_em TEXT NOT NULL,
  revogado_em TEXT,
  usado_em TEXT,
  uso_chave TEXT,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE assinaturas_comunidade (
  comunidade_id INTEGER PRIMARY KEY REFERENCES comunidades(id) ON DELETE CASCADE,
  plano_id TEXT NOT NULL REFERENCES planos_plataforma(id),
  solicitacao_id INTEGER UNIQUE REFERENCES solicitacoes_log1(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('ATIVA','SUSPENSA','ENCERRADA')),
  contrato TEXT NOT NULL CHECK(json_valid(contrato)),
  fundamento TEXT NOT NULL CHECK(fundamento IN ('GRATUITO','CONFIRMACAO_EXTERNA','ISENCAO')),
  referencia TEXT NOT NULL DEFAULT '',
  aprovado_por INTEGER NOT NULL REFERENCES usuarios(id),
  inicia_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  termina_em TEXT,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- Quotas execute in the same SQLite transaction as every membership write,
-- including existing administrative APIs. Existing over-quota rows are kept.
CREATE TRIGGER plano_membros_insert BEFORE INSERT ON usuario_comunidades
WHEN NEW.status = 'ATIVO' AND EXISTS(SELECT 1 FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM assinaturas_comunidade s WHERE s.comunidade_id = NEW.comunidade_id
   AND (s.status != 'ATIVA' OR (s.termina_em IS NOT NULL AND datetime(s.termina_em) <= CURRENT_TIMESTAMP)))
 THEN RAISE(ABORT,'PLAN_INACTIVE') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM usuario_comunidades WHERE comunidade_id = NEW.comunidade_id AND status = 'ATIVO') >=
   (SELECT json_extract(contrato,'$.limites.usuarios') FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
 THEN RAISE(ABORT,'PLAN_USER_LIMIT') END;
 SELECT CASE WHEN NEW.papel IN ('ADMIN_COMUNIDADE','SUPERADMIN','PASTOR') AND
   (SELECT COUNT(*) FROM usuario_comunidades WHERE comunidade_id = NEW.comunidade_id AND status = 'ATIVO' AND papel IN ('ADMIN_COMUNIDADE','SUPERADMIN','PASTOR')) >=
   (SELECT json_extract(contrato,'$.limites.administradores') FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
 THEN RAISE(ABORT,'PLAN_ADMIN_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER plano_membros_update BEFORE UPDATE OF status,papel,comunidade_id ON usuario_comunidades
WHEN NEW.status = 'ATIVO' AND EXISTS(SELECT 1 FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
BEGIN
 SELECT CASE WHEN (OLD.status != 'ATIVO' OR OLD.comunidade_id != NEW.comunidade_id) AND
   (SELECT COUNT(*) FROM usuario_comunidades WHERE comunidade_id = NEW.comunidade_id AND status = 'ATIVO' AND id != OLD.id) >=
   (SELECT json_extract(contrato,'$.limites.usuarios') FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
 THEN RAISE(ABORT,'PLAN_USER_LIMIT') END;
 SELECT CASE WHEN NEW.papel IN ('ADMIN_COMUNIDADE','SUPERADMIN','PASTOR') AND
   (OLD.status != 'ATIVO' OR OLD.papel NOT IN ('ADMIN_COMUNIDADE','SUPERADMIN','PASTOR') OR OLD.comunidade_id != NEW.comunidade_id) AND
   (SELECT COUNT(*) FROM usuario_comunidades WHERE comunidade_id = NEW.comunidade_id AND status = 'ATIVO' AND id != OLD.id AND papel IN ('ADMIN_COMUNIDADE','SUPERADMIN','PASTOR')) >=
   (SELECT json_extract(contrato,'$.limites.administradores') FROM assinaturas_comunidade WHERE comunidade_id = NEW.comunidade_id)
 THEN RAISE(ABORT,'PLAN_ADMIN_LIMIT') END;
END;

--> statement-breakpoint
CREATE TRIGGER plano_cadastros_insert BEFORE INSERT ON visitantes WHEN NEW.ativo=1
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM visitantes WHERE comunidade_id=NEW.comunidade_id AND ativo=1) >= (SELECT json_extract(contrato,'$.limites.cadastros') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;
--> statement-breakpoint
CREATE TRIGGER plano_cadastros_update BEFORE UPDATE OF ativo,comunidade_id ON visitantes
WHEN NEW.ativo=1 AND (OLD.ativo!=1 OR OLD.comunidade_id!=NEW.comunidade_id)
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM visitantes WHERE comunidade_id=NEW.comunidade_id AND ativo=1) >= (SELECT json_extract(contrato,'$.limites.cadastros') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;

--> statement-breakpoint
CREATE TRIGGER plano_celulas_insert BEFORE INSERT ON celulas WHEN NEW.ativo=1
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM celulas WHERE comunidade_id=NEW.comunidade_id AND ativo=1) >= (SELECT json_extract(contrato,'$.limites.celulas') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;
--> statement-breakpoint
CREATE TRIGGER plano_celulas_update BEFORE UPDATE OF ativo,comunidade_id ON celulas
WHEN NEW.ativo=1 AND (OLD.ativo!=1 OR OLD.comunidade_id!=NEW.comunidade_id)
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM celulas WHERE comunidade_id=NEW.comunidade_id AND ativo=1) >= (SELECT json_extract(contrato,'$.limites.celulas') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;

--> statement-breakpoint
CREATE TRIGGER plano_ministerios_insert BEFORE INSERT ON ministerios_comunidade WHEN NEW.status='ATIVO'
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM ministerios_comunidade WHERE comunidade_id=NEW.comunidade_id AND status='ATIVO') >= (SELECT json_extract(contrato,'$.limites.ministerios') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;
--> statement-breakpoint
CREATE TRIGGER plano_ministerios_update BEFORE UPDATE OF status,comunidade_id ON ministerios_comunidade
WHEN NEW.status='ATIVO' AND (OLD.status!='ATIVO' OR OLD.comunidade_id!=NEW.comunidade_id)
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM ministerios_comunidade WHERE comunidade_id=NEW.comunidade_id AND status='ATIVO') >= (SELECT json_extract(contrato,'$.limites.ministerios') FROM assinaturas_comunidade WHERE comunidade_id=NEW.comunidade_id) THEN RAISE(ABORT,'PLAN_QUOTA_LIMIT') END; END;
