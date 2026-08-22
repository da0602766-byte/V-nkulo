import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function createMigratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = OFF");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles) {
    database.exec(
      await readFile(new URL(migrationFile, migrationDirectory), "utf8"),
    );
  }
  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

test("migrações V4.5 aplicam e preservam integridade referencial", async () => {
  const database = await createMigratedDatabase();
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  assert.deepEqual(violations, []);
  const tables = database
    .prepare(
      `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'comunidades',
        'usuario_comunidades',
        'convites_comunidade',
        'feature_flags',
        'politicas_editoriais_ia',
        'rascunhos_editoriais_ia',
        'programacoes_editoriais',
        'conversas_privadas',
        'mensagens_privadas',
        'publicacoes_piloto',
        'comentarios_publicacao',
        'auditoria_piloto',
        'ministerios_comunidade',
        'ministerio_voluntarios',
        'escalas_ministerio',
        'escala_designacoes',
        'solicitacoes_entrada_comunidade',
        'estacionamento_configuracoes',
        'estacionamento_setores',
        'estacionamento_vagas',
        'estacionamento_movimentacoes',
        'estacionamento_ocorrencias',
        'planos_rede',
        'redes_igrejas',
        'rede_unidades',
        'rede_administradores',
        'oficiais_comunidade'
      )
      ORDER BY name`,
    )
    .all();
  assert.equal(tables.length, 27);
  database.close();
});

test("migração de oficiais tolera banco parcialmente atualizado", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = OFF");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles.filter(
    (name) => Number(name.slice(0, 4)) <= 24,
  )) {
    database.exec(
      await readFile(new URL(migrationFile, migrationDirectory), "utf8"),
    );
  }
  database.exec(
    "ALTER TABLE usuario_comunidades ADD oficial integer DEFAULT false NOT NULL",
  );
  const migration25 = migrationFiles.find((name) => name.startsWith("0025_"));
  assert.ok(migration25);
  const migrationSql = await readFile(
    new URL(migration25, migrationDirectory),
    "utf8",
  );
  database.exec(migrationSql);
  database.exec(migrationSql);
  database.exec("PRAGMA foreign_keys = ON");

  const table = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'oficiais_comunidade'`,
    )
    .get();
  assert.equal(table.name, "oficiais_comunidade");
  database.close();
});

test("registros demonstrativos ficam arquivados com auditoria e recursos críticos bloqueados", async () => {
  const database = await createMigratedDatabase();
  const communities = database
    .prepare(
      `SELECT id, nome, ambiente_demo, status, feed_publico_habilitado
      FROM comunidades
      ORDER BY id`,
    )
    .all();
  assert.deepEqual(
    communities.map((item) => [item.id, item.nome, item.ambiente_demo, item.status, item.feed_publico_habilitado]),
    [
      [1, "Comunidade Piloto Norte", 1, "ARQUIVADA", 0],
      [2, "Comunidade Piloto Sul", 1, "ARQUIVADA", 0],
    ],
  );
  const flags = new Map(
    database
      .prepare(
        `SELECT flag_key, enabled
        FROM feature_flags
        WHERE scope_type = 'GLOBAL' AND scope_id = 0`,
      )
      .all()
      .map((item) => [item.flag_key, item.enabled]),
  );
  assert.equal(flags.get("network_module_enabled"), 0);
  assert.equal(flags.get("affiliate_creation_enabled"), 0);
  assert.equal(flags.get("payments_enabled"), 0);
  assert.equal(flags.get("ai_auto_publish_enabled"), 0);
  assert.equal(flags.get("legacy_modules_enabled"), 0);
  const editorial = database
    .prepare(
      `SELECT modo, publicacao_automatica
      FROM politicas_editoriais_ia
      WHERE scope_type = 'GLOBAL' AND scope_id = 0`,
    )
    .get();
  assert.deepEqual(
    [editorial.modo, editorial.publicacao_automatica],
    ["COM_REVISAO", 0],
  );
  const editorialDraft = database
    .prepare(
      `SELECT origem, status, versao
       FROM rascunhos_editoriais_ia
       WHERE id = 1`,
    )
    .get();
  assert.deepEqual(
    [editorialDraft.origem, editorialDraft.status, editorialDraft.versao],
    ["IA", "ARQUIVADO", 1],
  );
  const parking = database
    .prepare(
      `SELECT comunidade_id, ativo
       FROM estacionamento_configuracoes
       ORDER BY comunidade_id`,
    )
    .all();
  assert.deepEqual(
    parking.map((item) => [item.comunidade_id, item.ativo]),
    [
      [1, 0],
      [2, 0],
    ],
  );
  const archivedAudit = database
    .prepare(
      `SELECT comunidade_id, resultado
       FROM auditoria_piloto
       WHERE evento = 'AMBIENTE_DEMONSTRATIVO_ARQUIVADO'
       ORDER BY comunidade_id`,
    )
    .all();
  assert.deepEqual(
    archivedAudit.map((item) => [item.comunidade_id, item.resultado]),
    [[1, "SUCESSO"], [2, "SUCESSO"]],
  );
  database.close();
});

test("comunidade real anterior à reforma é restaurada sem reativar as sementes piloto", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = OFF");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles.filter(
    (name) => Number(name.slice(0, 4)) <= 39,
  )) {
    database.exec(await readFile(new URL(migrationFile, migrationDirectory), "utf8"));
  }
  const ownerId = Number(
    database
      .prepare(
        `INSERT INTO usuarios (nome, email, perfil, permissoes, ativo)
         VALUES ('Responsável de teste', 'responsavel@teste.local', 'ADMIN', '', 1)`,
      )
      .run().lastInsertRowid,
  );
  const inserted = database
    .prepare(
      `INSERT INTO comunidades
       (nome, slug, proprietario_usuario_id, descricao_publica,
        cidade_publica, status, ambiente_demo, feed_publico_habilitado)
       VALUES (?, ?, ?, ?, ?, 'ATIVA', 1, 1)`,
    )
    .run(
      "Comunidade Real Legada",
      "comunidade-real-legada",
      ownerId,
      "Comunidade criada por uma pessoa antes da reforma oficial.",
      "Blumenau — SC",
    );
  const communityId = Number(inserted.lastInsertRowid);
  database
    .prepare(
      `INSERT INTO usuario_comunidades
       (usuario_id, comunidade_id, papel, status)
       VALUES (?, ?, 'ADMIN_COMUNIDADE', 'ATIVO')`,
    )
    .run(ownerId, communityId);
  for (const migrationFile of migrationFiles.filter(
    (name) => Number(name.slice(0, 4)) >= 40,
  )) {
    database.exec(await readFile(new URL(migrationFile, migrationDirectory), "utf8"));
  }
  database.exec("PRAGMA foreign_keys = ON");

  const restored = database
    .prepare(
      `SELECT status, ambiente_demo
       FROM comunidades WHERE id = ?`,
    )
    .get(communityId);
  assert.deepEqual([restored.status, restored.ambiente_demo], ["ATIVA", 0]);
  const seeds = database
    .prepare(
      `SELECT id, status FROM comunidades WHERE id IN (1, 2) ORDER BY id`,
    )
    .all();
  assert.deepEqual(seeds.map((item) => [item.id, item.status]), [
    [1, "ARQUIVADA"],
    [2, "ARQUIVADA"],
  ]);
  const audit = database
    .prepare(
      `SELECT resultado FROM auditoria_piloto
       WHERE comunidade_id = ?
         AND evento = 'COMUNIDADE_REAL_RESTAURADA_APOS_ARQUIVAMENTO'`,
    )
    .get(communityId);
  assert.equal(audit.resultado, "SUCESSO");
  database.close();
});

test("feed demonstrativo permanece preservado, isolado e fora da publicação", async () => {
  const database = await createMigratedDatabase();
  const north = database
    .prepare(
      `SELECT comunidade_id, titulo
      FROM publicacoes_piloto
      WHERE comunidade_id = ? AND status = 'ARQUIVADA'
      ORDER BY id DESC LIMIT 10`,
    )
    .all(1);
  const south = database
    .prepare(
      `SELECT comunidade_id, titulo
      FROM publicacoes_piloto
      WHERE comunidade_id = ? AND status = 'ARQUIVADA'
      ORDER BY id DESC LIMIT 10`,
    )
    .all(2);
  assert.equal(north.length, 1);
  assert.equal(south.length, 1);
  assert.ok(north.every((item) => item.comunidade_id === 1));
  assert.ok(south.every((item) => item.comunidade_id === 2));
  assert.notEqual(north[0].titulo, south[0].titulo);
  database.close();
});

test("Secretaria Ministerial V4.7.2 persiste repertório, links e compartilhamento seguro", async () => {
  const database = await createMigratedDatabase();
  const ministryColumns = new Set(
    database
      .prepare("PRAGMA table_info(ministerios_comunidade)")
      .all()
      .map((column) => column.name),
  );
  const scheduleColumns = new Set(
    database
      .prepare("PRAGMA table_info(escalas_ministerio)")
      .all()
      .map((column) => column.name),
  );
  assert.equal(ministryColumns.has("responsavel_usuario_id"), true);
  for (const column of [
    "repertorio",
    "links_recursos",
    "responsavel_usuario_id",
    "share_token",
    "compartilhado_em",
  ]) {
    assert.equal(scheduleColumns.has(column), true, `coluna ausente: ${column}`);
  }
  const uniqueShareIndex = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index'
         AND name = 'escalas_ministerio_share_token_unique'`,
    )
    .get();
  assert.equal(uniqueShareIndex.name, "escalas_ministerio_share_token_unique");
  database.close();
});

test("migração operacional preserva e coloca dados legados em quarentena", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = OFF");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles.filter((name) =>
    name.startsWith("00") && Number(name.slice(0, 4)) <= 13,
  )) {
    database.exec(
      await readFile(new URL(migrationFile, migrationDirectory), "utf8"),
    );
  }
  database.exec("PRAGMA foreign_keys = ON");
  const cell = database
    .prepare(
      `INSERT INTO celulas
      (nome, responsavel, membros, criado_por)
      VALUES ('Célula Legada', 'Responsável Legado', '[]', 'legado@example.test')`,
    )
    .run();
  const visitor = database
    .prepare(
      `INSERT INTO visitantes
      (nome_completo, status, data_entrada, criado_por, celula, celula_id)
      VALUES ('Pessoa Legada', 'NOVO', '2026-07-01', 'legado@example.test', 'Célula Legada', ?)`,
    )
    .run(Number(cell.lastInsertRowid));
  database
    .prepare(
      `INSERT INTO acompanhamentos
      (visitante_id, responsavel_email, tipo, resultado)
      VALUES (?, 'legado@example.test', 'TELEFONE', 'Registro legado')`,
    )
    .run(Number(visitor.lastInsertRowid));

  const migration14 = migrationFiles.find((name) => name.startsWith("0014_"));
  assert.ok(migration14);
  database.exec(
    await readFile(new URL(migration14, migrationDirectory), "utf8"),
  );
  database.exec("PRAGMA foreign_keys = ON");

  const quarantinedVisitor = database
    .prepare(
      `SELECT comunidade_id, nome_completo, escopo_confirmado
      FROM visitantes WHERE id = ?`,
    )
    .get(Number(visitor.lastInsertRowid));
  const quarantinedCell = database
    .prepare(
      `SELECT comunidade_id, nome, escopo_confirmado
      FROM celulas WHERE id = ?`,
    )
    .get(Number(cell.lastInsertRowid));
  const quarantinedFollowup = database
    .prepare(
      `SELECT comunidade_id, resultado, escopo_confirmado
      FROM acompanhamentos WHERE visitante_id = ?`,
    )
    .get(Number(visitor.lastInsertRowid));
  assert.deepEqual(
    [
      quarantinedVisitor.comunidade_id,
      quarantinedVisitor.nome_completo,
      quarantinedVisitor.escopo_confirmado,
    ],
    [1, "Pessoa Legada", 0],
  );
  assert.deepEqual(
    [
      quarantinedCell.comunidade_id,
      quarantinedCell.nome,
      quarantinedCell.escopo_confirmado,
    ],
    [1, "Célula Legada", 0],
  );
  assert.deepEqual(
    [
      quarantinedFollowup.comunidade_id,
      quarantinedFollowup.resultado,
      quarantinedFollowup.escopo_confirmado,
    ],
    [1, "Registro legado", 0],
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});
