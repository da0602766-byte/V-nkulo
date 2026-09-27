-- Additive only. No visitor, user or session is modified by this migration.
CREATE TABLE IF NOT EXISTS mobile_write_grants (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL, session_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(usuario_id,comunidade_id,device_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mobile_visitor_receipts (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN ('PENDING','CONFIRMED','CONFLICT')),
 visitor_id INTEGER, audited INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(usuario_id,comunidade_id,operation_id));
