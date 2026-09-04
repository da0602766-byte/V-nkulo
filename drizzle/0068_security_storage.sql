-- Additive: originals and existing references remain available for recovery.
-- 0067 is reserved by the already deployed Sites area-access migration.
CREATE TABLE IF NOT EXISTS storage_files (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES usuarios(id),
  file_id TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES usuarios(id),
  community_id INTEGER REFERENCES comunidades(id),
  purpose TEXT NOT NULL DEFAULT '',
  resource_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS storage_files_drive_idx ON storage_files(owner_id, file_id);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS storage_migration_copies (
  source_key TEXT PRIMARY KEY NOT NULL,
  destination TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS media_post_image_idx ON publicacoes_piloto(imagem_url);
CREATE INDEX IF NOT EXISTS media_post_thumbnail_idx ON publicacoes_piloto(imagem_thumbnail_url);
CREATE INDEX IF NOT EXISTS media_profile_photo_idx ON usuarios(foto_perfil);
CREATE INDEX IF NOT EXISTS media_ministry_banner_idx ON ministerios_comunidade(banner_url);

CREATE INDEX IF NOT EXISTS auth_rate_window_idx ON auth_rate_limits(window_start);
CREATE TABLE IF NOT EXISTS storage_migration_locks (
  community_id INTEGER PRIMARY KEY REFERENCES comunidades(id),
  lease_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
