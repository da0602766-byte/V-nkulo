type Row = Record<string, unknown>;

export type MemberRegistrationField = {
  id: string;
  label: string;
  required: boolean;
};

export type MemberRegistrationMinistry = {
  id: number;
  name: string;
  functions: Array<{ id: number; name: string }>;
  extraFields: MemberRegistrationField[];
};

export type MemberRegistrationCommunity = {
  id: number;
  name: string;
  anointings: Array<{ id: string; name: string }>;
  ministries: MemberRegistrationMinistry[];
};

export type MemberRegistrationFormData = {
  id: number;
  title: string;
  opensAt: string;
  closesAt: string;
  state: "AGUARDANDO" | "ABERTO" | "ENCERRADO" | "CANCELADO";
  serverNow: number;
  creatorId: number;
  communities: MemberRegistrationCommunity[];
};

export async function getMemberRegistrationForm(
  db: D1Database,
  token: string,
): Promise<MemberRegistrationFormData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const link = await db
    .prepare(
      `SELECT l.id, l.titulo, l.abre_em, l.fecha_em, l.status, l.criado_por,
        CASE
          WHEN l.status != 'ATIVO' THEN 'CANCELADO'
          WHEN datetime('now') < datetime(l.abre_em) THEN 'AGUARDANDO'
          WHEN datetime('now') >= datetime(l.fecha_em) THEN 'ENCERRADO'
          ELSE 'ABERTO'
        END AS estado,
        CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS agora_ms
       FROM links_cadastro_membros l
       JOIN comunidades origem
         ON origem.id = l.comunidade_origem_id
        AND origem.proprietario_usuario_id = l.criado_por
        AND origem.status = 'ATIVA'
       WHERE l.token = ?
       LIMIT 1`,
    )
    .bind(token)
    .first<Row>();
  if (!link) return null;

  const creatorId = Number(link.criado_por);
  const communitiesResult = await db
    .prepare(
      `SELECT id, nome
       FROM comunidades
       WHERE proprietario_usuario_id = ? AND status = 'ATIVA'
       ORDER BY nome ASC, id ASC`,
    )
    .bind(creatorId)
    .all<Row>();
  const communityIds = communitiesResult.results.map((row) => Number(row.id));
  if (!communityIds.length) return null;

  const [anointingsResult, ministriesResult, functionsResult, templatesResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT DISTINCT uc.comunidade_id, u.titulo_eclesiastico
           FROM usuario_comunidades uc
           JOIN usuarios u ON u.id = uc.usuario_id AND u.ativo = 1
           JOIN comunidades c
             ON c.id = uc.comunidade_id
            AND c.proprietario_usuario_id = ?
           WHERE uc.status = 'ATIVO'
           ORDER BY uc.comunidade_id, u.titulo_eclesiastico`,
        )
        .bind(creatorId)
        .all<Row>(),
      db
        .prepare(
          `SELECT m.id, m.comunidade_id, m.nome
           FROM ministerios_comunidade m
           JOIN comunidades c
             ON c.id = m.comunidade_id
            AND c.proprietario_usuario_id = ?
           WHERE m.status = 'ATIVO'
           ORDER BY m.comunidade_id, m.nome`,
        )
        .bind(creatorId)
        .all<Row>(),
      db
        .prepare(
          `SELECT f.id, f.comunidade_id, f.ministerio_id, f.nome
           FROM ministerio_funcoes f
           JOIN ministerios_comunidade m
             ON m.id = f.ministerio_id
            AND m.comunidade_id = f.comunidade_id
           JOIN comunidades c
             ON c.id = f.comunidade_id
            AND c.proprietario_usuario_id = ?
           WHERE f.ativa = 1 AND m.status = 'ATIVO'
           ORDER BY f.ministerio_id, f.nome`,
        )
        .bind(creatorId)
        .all<Row>(),
      db
        .prepare(
          `SELECT t.comunidade_id, t.ministerio_id, t.campos_personalizados
           FROM ministerio_modelos_escala t
           JOIN ministerios_comunidade m
             ON m.id = t.ministerio_id
            AND m.comunidade_id = t.comunidade_id
           JOIN comunidades c
             ON c.id = t.comunidade_id
            AND c.proprietario_usuario_id = ?
           WHERE t.ativo = 1 AND m.status = 'ATIVO'
           ORDER BY t.ministerio_id, t.id`,
        )
        .bind(creatorId)
        .all<Row>(),
    ]);

  const anointings = new Map<number, Set<string>>();
  for (const communityId of communityIds) anointings.set(communityId, new Set(["MEMBRO"]));
  for (const row of anointingsResult.results) {
    const communityId = Number(row.comunidade_id);
    if (!anointings.has(communityId)) continue;
    const value = cleanChoice(row.titulo_eclesiastico);
    if (value) anointings.get(communityId)!.add(value);
  }

  const functionsByMinistry = new Map<number, Array<{ id: number; name: string }>>();
  for (const row of functionsResult.results) {
    const ministryId = Number(row.ministerio_id);
    const items = functionsByMinistry.get(ministryId) || [];
    items.push({ id: Number(row.id), name: String(row.nome || "") });
    functionsByMinistry.set(ministryId, items);
  }
  const fieldsByMinistry = new Map<number, MemberRegistrationField[]>();
  for (const row of templatesResult.results) {
    const ministryId = Number(row.ministerio_id);
    const current = fieldsByMinistry.get(ministryId) || [];
    const known = new Set(current.map((field) => field.id));
    for (const field of parseCustomFields(row.campos_personalizados)) {
      if (!known.has(field.id)) {
        current.push(field);
        known.add(field.id);
      }
    }
    fieldsByMinistry.set(ministryId, current.slice(0, 20));
  }

  const ministriesByCommunity = new Map<number, MemberRegistrationMinistry[]>();
  for (const row of ministriesResult.results) {
    const communityId = Number(row.comunidade_id);
    const ministryId = Number(row.id);
    const items = ministriesByCommunity.get(communityId) || [];
    items.push({
      id: ministryId,
      name: String(row.nome || ""),
      functions: functionsByMinistry.get(ministryId) || [],
      extraFields: fieldsByMinistry.get(ministryId) || [],
    });
    ministriesByCommunity.set(communityId, items);
  }

  return {
    id: Number(link.id),
    title: String(link.titulo || "Cadastro de membros"),
    opensAt: String(link.abre_em),
    closesAt: String(link.fecha_em),
    state: String(link.estado) as MemberRegistrationFormData["state"],
    serverNow: Number(link.agora_ms || 0),
    creatorId,
    communities: communitiesResult.results.map((row) => {
      const id = Number(row.id);
      return {
        id,
        name: String(row.nome || ""),
        anointings: [...(anointings.get(id) || new Set(["MEMBRO"]))].map((value) => ({
          id: value,
          name: titleLabel(value),
        })),
        ministries: ministriesByCommunity.get(id) || [],
      };
    }),
  };
}

function parseCustomFields(value: unknown): MemberRegistrationField[] {
  let source: unknown = value;
  try {
    source = JSON.parse(String(value || "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(source)) return [];
  return source.flatMap((item, index) => {
    const rawLabel = typeof item === "string"
      ? item
      : String((item as Row)?.label || (item as Row)?.nome || (item as Row)?.titulo || "");
    const label = rawLabel.trim().slice(0, 80);
    if (!label) return [];
    const rawId = typeof item === "object" && item
      ? String((item as Row).id || "")
      : "";
    const id = slug(rawId || label || `campo-${index + 1}`).slice(0, 60);
    return [{
      id: id || `campo-${index + 1}`,
      label,
      required: Boolean(typeof item === "object" && item && (item as Row).required),
    }];
  });
}

function cleanChoice(value: unknown) {
  const choice = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_]{2,40}$/.test(choice) ? choice : "";
}

function titleLabel(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
