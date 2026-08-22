import type { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

export const TEMPORARY_ACCESS_COOKIE = "__Host-vinkulo_temp_access";
export const TEMPORARY_ACCESS_RESOURCES = [
  "ESCALA_LEITURA",
  "ESTACIONAMENTO",
] as const;

export type TemporaryAccessResource =
  (typeof TEMPORARY_ACCESS_RESOURCES)[number];
export type TemporaryAccessStatus =
  | "PENDENTE"
  | "AGUARDANDO_HORARIO"
  | "ATIVO"
  | "EXPIRADO"
  | "CANCELADO"
  | "NEGADO";

export type TemporaryAccessRecord = {
  id: number;
  comunidade_id: number;
  escala_id: number;
  designacao_id: number;
  beneficiario_usuario_id: number;
  recurso: TemporaryAccessResource;
  token_hint: string;
  inicia_em: string;
  termina_em: string;
  status: TemporaryAccessStatus;
  autorizado_por: number | null;
  criado_por: number | null;
  ativado_em: string | null;
  cancelado_por: number | null;
  cancelado_em: string | null;
  negado_por: number | null;
  negado_em: string | null;
  motivo_negacao: string;
  expirado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  comunidade_nome: string;
  comunidade_slug: string;
  escala_titulo: string;
  escala_status: string;
  escala_inicia_em: string;
  escala_termina_em: string;
  ministerio_nome: string;
  ministerio_categoria: string;
  designacao_ativa: number;
  designacao_status: string;
  funcao: string;
  beneficiario_nome: string;
  beneficiario_email: string;
  beneficiario_foto: string | null;
  beneficiario_ativo: number;
  vinculo_ativo: number;
};

const RESOURCE_LABELS: Record<TemporaryAccessResource, string> = {
  ESCALA_LEITURA: "Escala em modo leitura",
  ESTACIONAMENTO: "Estacionamento",
};

const RESOURCE_PERMISSIONS: Record<TemporaryAccessResource, string[]> = {
  ESCALA_LEITURA: [],
  ESTACIONAMENTO: [
    "parking.view",
    "parking.entry",
    "parking.exit",
    "parking.edit",
  ],
};

export function isTemporaryAccessResource(
  value: unknown,
): value is TemporaryAccessResource {
  return TEMPORARY_ACCESS_RESOURCES.includes(
    String(value || "") as TemporaryAccessResource,
  );
}

export function temporaryResourceLabel(resource: TemporaryAccessResource) {
  return RESOURCE_LABELS[resource];
}

export function temporaryResourcePermissions(
  resource: TemporaryAccessResource,
) {
  return [...RESOURCE_PERMISSIONS[resource]];
}

export function temporaryResourceDestination(
  resource: TemporaryAccessResource,
  token: string,
) {
  return resource === "ESTACIONAMENTO"
    ? "/painel?view=estacionamento"
    : `/acesso/${token}?conteudo=1`;
}

export function isOpaqueTemporaryToken(value: unknown) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

export function createOpaqueTemporaryToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashTemporaryToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getTemporaryAccessByToken(
  db: D1Database,
  token: string,
  options: { sync?: boolean } = { sync: true },
) {
  if (!isOpaqueTemporaryToken(token)) return null;
  return selectTemporaryAccess(
    db,
    "a.token_hash",
    await hashTemporaryToken(token),
    options,
  );
}

export async function getTemporaryAccessById(
  db: D1Database,
  id: number,
  options: { sync?: boolean } = { sync: true },
) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return selectTemporaryAccess(db, "a.id", id, options);
}

async function selectTemporaryAccess(
  db: D1Database,
  field: "a.id" | "a.token_hash",
  value: number | string,
  options: { sync?: boolean },
) {
  const row = await db
    .prepare(
      `SELECT a.id, a.comunidade_id, a.escala_id, a.designacao_id,
        a.beneficiario_usuario_id, a.recurso, a.token_hint, a.inicia_em,
        a.termina_em, a.status, a.autorizado_por, a.criado_por,
        a.ativado_em, a.cancelado_por, a.cancelado_em, a.negado_por,
        a.negado_em, a.motivo_negacao, a.expirado_em, a.criado_em,
        a.atualizado_em, c.nome AS comunidade_nome, c.slug AS comunidade_slug,
        s.titulo AS escala_titulo, s.status AS escala_status,
        s.inicia_em AS escala_inicia_em, s.termina_em AS escala_termina_em,
        m.nome AS ministerio_nome, m.categoria AS ministerio_categoria,
        d.ativo AS designacao_ativa, d.status AS designacao_status, d.funcao,
        u.nome AS beneficiario_nome, u.email AS beneficiario_email,
        u.foto_perfil AS beneficiario_foto, u.ativo AS beneficiario_ativo,
        EXISTS(
          SELECT 1 FROM usuario_comunidades uc
          WHERE uc.usuario_id = a.beneficiario_usuario_id
            AND uc.comunidade_id = a.comunidade_id
            AND uc.status = 'ATIVO'
        ) AS vinculo_ativo
       FROM acessos_temporarios a
       JOIN comunidades c ON c.id = a.comunidade_id
       JOIN escalas_ministerio s
         ON s.id = a.escala_id AND s.comunidade_id = a.comunidade_id
       JOIN ministerios_comunidade m
         ON m.id = s.ministerio_id AND m.comunidade_id = s.comunidade_id
       JOIN escala_designacoes d
         ON d.id = a.designacao_id
        AND d.escala_id = a.escala_id
        AND d.comunidade_id = a.comunidade_id
        AND d.usuario_id = a.beneficiario_usuario_id
       JOIN usuarios u ON u.id = a.beneficiario_usuario_id
       WHERE ${field} = ?
       LIMIT 1`,
    )
    .bind(value)
    .first<TemporaryAccessRecord>();
  if (!row || !isTemporaryAccessResource(row.recurso)) return null;
  return options.sync === false
    ? row
    : syncTemporaryAccessStatus(db, row);
}

export async function syncTemporaryAccessStatus(
  db: D1Database,
  row: TemporaryAccessRecord,
  now = Date.now(),
) {
  const terminal = new Set<TemporaryAccessStatus>([
    "EXPIRADO",
    "CANCELADO",
    "NEGADO",
  ]);
  if (terminal.has(row.status)) return row;

  let nextStatus = row.status;
  let transitionReason = "";
  const startsAt = parseDatabaseTimestamp(row.inicia_em);
  const endsAt = parseDatabaseTimestamp(row.termina_em);

  if (
    row.escala_status !== "PUBLICADA" ||
    !Number(row.designacao_ativa) ||
    ["INDISPONIVEL", "SUBSTITUICAO_SOLICITADA", "AUSENTE"].includes(
      row.designacao_status,
    ) ||
    !Number(row.beneficiario_ativo) ||
    !Number(row.vinculo_ativo)
  ) {
    nextStatus = "CANCELADO";
    transitionReason =
      row.escala_status !== "PUBLICADA"
        ? "ESCALA_INDISPONIVEL"
        : !Number(row.beneficiario_ativo)
          ? "USUARIO_INATIVO"
          : !Number(row.vinculo_ativo)
            ? "VINCULO_COMUNIDADE_INATIVO"
            : "DESIGNACAO_INDISPONIVEL";
  } else if (!Number.isFinite(endsAt) || endsAt <= now) {
    nextStatus = "EXPIRADO";
    transitionReason = "HORARIO_ENCERRADO";
  } else if (Number.isFinite(startsAt) && startsAt > now) {
    if (row.status !== "PENDENTE") nextStatus = "AGUARDANDO_HORARIO";
  } else if (row.status === "AGUARDANDO_HORARIO") {
    nextStatus = "ATIVO";
    transitionReason = "HORARIO_INICIADO";
  }

  if (nextStatus === row.status) return row;
  const timestampColumn =
    nextStatus === "EXPIRADO"
      ? "expirado_em"
      : nextStatus === "CANCELADO"
        ? "cancelado_em"
        : null;
  const timestampSql = timestampColumn
    ? `, ${timestampColumn} = COALESCE(${timestampColumn}, CURRENT_TIMESTAMP)`
    : "";
  const result = await db
    .prepare(
      `UPDATE acessos_temporarios
       SET status = ?, atualizado_em = CURRENT_TIMESTAMP${timestampSql}
       WHERE id = ? AND status = ?`,
    )
    .bind(nextStatus, row.id, row.status)
    .run();
  if (!Number(result.meta.changes)) {
    return row;
  }
  const updated = { ...row, status: nextStatus };
  const event =
    nextStatus === "ATIVO"
      ? "ACESSO_TEMPORARIO_INICIADO"
      : nextStatus === "EXPIRADO"
        ? "ACESSO_TEMPORARIO_EXPIRADO"
        : nextStatus === "CANCELADO"
          ? "ACESSO_TEMPORARIO_CANCELADO"
          : "ACESSO_TEMPORARIO_AGUARDANDO_HORARIO";
  await recordTemporaryAccessAudit(db, updated, event, "SUCESSO", null, {
    motivo: transitionReason || null,
  });
  return updated;
}

function parseDatabaseTimestamp(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

export async function getActiveTemporaryAccessForUser(
  db: D1Database,
  token: string | undefined,
  userId: number,
  communityId: number,
) {
  if (!token) return null;
  const row = await getTemporaryAccessByToken(db, token);
  if (
    !row ||
    row.status !== "ATIVO" ||
    row.designacao_status !== "CONFIRMADA" ||
    Number(row.beneficiario_usuario_id) !== Number(userId) ||
    Number(row.comunidade_id) !== Number(communityId)
  ) {
    return null;
  }
  return row;
}

export async function markTemporaryAccessActivated(
  db: D1Database,
  row: TemporaryAccessRecord,
  actorId: number,
) {
  const result = await db
    .prepare(
      `UPDATE acessos_temporarios
       SET ativado_em = COALESCE(ativado_em, CURRENT_TIMESTAMP),
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'ATIVO' AND ativado_em IS NULL`,
    )
    .bind(row.id)
    .run();
  if (Number(result.meta.changes)) {
    await recordTemporaryAccessAudit(
      db,
      row,
      "ACESSO_TEMPORARIO_SESSAO_ATIVADA",
      "SUCESSO",
      actorId,
    );
  }
}

export async function recordTemporaryAccessAudit(
  db: D1Database,
  row: Pick<
    TemporaryAccessRecord,
    | "id"
    | "comunidade_id"
    | "escala_id"
    | "beneficiario_usuario_id"
    | "recurso"
  >,
  event: string,
  result: "SUCESSO" | "NEGADO" | "ERRO",
  actorId: number | null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await db
    .prepare(
      `INSERT INTO auditoria_piloto
       (comunidade_id, usuario_id, evento, resultado, metadados)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      row.comunidade_id,
      actorId,
      event,
      result,
      JSON.stringify({
        acessoTemporarioId: row.id,
        escalaId: row.escala_id,
        beneficiarioUsuarioId: row.beneficiario_usuario_id,
        recurso: row.recurso,
        ...metadata,
      }),
    )
    .run();
}

export function attachTemporaryAccessCookie(
  response: Response,
  token: string,
  closesAt: string,
) {
  const maxAge = Math.max(
    1,
    Math.min(31 * 24 * 60 * 60, Math.ceil((Date.parse(closesAt) - Date.now()) / 1000)),
  );
  response.headers.append(
    "Set-Cookie",
    `${TEMPORARY_ACCESS_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

export function clearTemporaryAccessCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `${TEMPORARY_ACCESS_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}
