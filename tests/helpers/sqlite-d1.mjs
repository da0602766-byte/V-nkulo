import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export async function createPilotD1() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = OFF");
  const migrationDirectory = new URL("../../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles) {
    database.exec(
      await readFile(new URL(migrationFile, migrationDirectory), "utf8"),
    );
  }
  // Os testes de comportamento usam ambientes fictícios reativados somente
  // dentro do banco em memória. Em produção, a migração 0040 os mantém
  // arquivados com auditoria e sem exposição pública.
  database.exec(`
    UPDATE comunidades
    SET status = 'ATIVA', feed_publico_habilitado = 1
    WHERE ambiente_demo = 1;
    UPDATE publicacoes_piloto
    SET status = 'PUBLICADA'
    WHERE origem = 'DEMO';
    UPDATE rascunhos_editoriais_ia
    SET status = 'AGUARDANDO_REVISAO', motivo_bloqueio = ''
    WHERE hash_semantico LIKE 'demo-%';
    UPDATE estacionamento_configuracoes
    SET ativo = 1
    WHERE comunidade_id IN (SELECT id FROM comunidades WHERE ambiente_demo = 1);
  `);
  database.exec("PRAGMA foreign_keys = ON");
  return { database, d1: new SqliteD1Database(database) };
}

export async function createPilotUser(
  database,
  {
    nome,
    email,
    senha,
    perfil = "ACOMPANHANTE",
    memberships = [{ comunidadeId: 1, papel: "MEMBRO" }],
  },
) {
  const salt = randomHex(16);
  const hash = await passwordHash(senha, salt);
  const result = database
    .prepare(
      `INSERT INTO usuarios
      (nome, email, perfil, permissoes, senha_hash, senha_salt, ativo)
      VALUES (?, ?, ?, '', ?, ?, 1)`,
    )
    .run(nome, email, perfil, hash, salt);
  const userId = Number(result.lastInsertRowid);
  const membershipInsert = database.prepare(
    `INSERT INTO usuario_comunidades
    (usuario_id, comunidade_id, papel, status)
    VALUES (?, ?, ?, 'ATIVO')`,
  );
  for (const membership of memberships) {
    membershipInsert.run(
      userId,
      membership.comunidadeId,
      membership.papel,
    );
  }
  return userId;
}

class SqliteD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(query) {
    return new SqliteD1PreparedStatement(this.database, query);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query) {
    this.database.exec(query);
    return { count: 0, duration: 0 };
  }
}

class SqliteD1PreparedStatement {
  constructor(database, query, bindings = []) {
    this.database = database;
    this.query = query;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteD1PreparedStatement(this.database, this.query, bindings);
  }

  async all() {
    const results = this.database
      .prepare(this.query)
      .all(...this.bindings)
      .map(normalizeRow);
    return { success: true, results, meta: metadata() };
  }

  async first(columnName) {
    const row = this.database.prepare(this.query).get(...this.bindings);
    if (!row) return null;
    const normalized = normalizeRow(row);
    return columnName ? (normalized[columnName] ?? null) : normalized;
  }

  async run() {
    const result = this.database.prepare(this.query).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: metadata({
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      }),
    };
  }

  async raw(options = {}) {
    const rows = this.database.prepare(this.query).all(...this.bindings);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const values = rows.map((row) => columns.map((column) => row[column]));
    return options.columnNames ? [columns, ...values] : values;
  }
}

function metadata(overrides = {}) {
  return {
    duration: 0,
    rows_read: 0,
    rows_written: 0,
    changes: 0,
    last_row_id: 0,
    changed_db: true,
    size_after: 0,
    ...overrides,
  };
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value,
    ]),
  );
}

async function passwordHash(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: Uint8Array.from(Buffer.from(salt, "hex")),
      iterations: 100_000,
    },
    material,
    256,
  );
  return Buffer.from(bits).toString("hex");
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}
