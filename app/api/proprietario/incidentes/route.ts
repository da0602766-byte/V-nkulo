import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  AREAS_INCIDENTE,
  GRAVIDADES_INCIDENTE,
  STATUS_INCIDENTE,
  normalizarGravidade,
  normalizarStatus,
  registrarIncidente,
} from "../../../lib/incident-center";

// Central de incidentes do proprietário. Só identificação e contagem das
// comunidades afetadas são expostas — nenhum conteúdo privado de comunidade.

type IncidentRow = {
  id: number;
  chave_agrupamento: string;
  titulo: string;
  descricao: string;
  area: string;
  modulo: string;
  gravidade: string;
  status: string;
  prioridade: number;
  ocorrencias: number;
  comunidades_afetadas: number;
  primeira_ocorrencia: string;
  ultima_ocorrencia: string;
  resolucao: string;
  resolvido_em: string | null;
  resolvido_nome: string | null;
  criado_em: string;
  atualizado_em: string;
};

type OccurrenceRow = {
  id: number;
  incidente_id: number;
  comunidade_id: number | null;
  detalhe: string;
  contexto: string;
  criado_em: string;
  comunidade_nome: string | null;
};

const clean = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

async function owner() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  if (!user.ativo || !user.system_owner)
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  return { user } as const;
}

function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function audit(
  db: ReturnType<typeof getD1>,
  userId: number,
  event: string,
  metadata: Record<string, unknown>,
) {
  await db
    .prepare(
      "INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (NULL, ?, ?, 'SUCESSO', ?)",
    )
    .bind(userId, event, JSON.stringify(metadata))
    .run();
}

function view(row: IncidentRow) {
  return {
    id: row.id,
    chave: row.chave_agrupamento,
    titulo: row.titulo,
    descricao: row.descricao,
    area: row.area,
    modulo: row.modulo,
    gravidade: row.gravidade,
    status: row.status,
    prioridade: row.prioridade,
    ocorrencias: row.ocorrencias,
    comunidadesAfetadas: row.comunidades_afetadas,
    primeiraOcorrencia: row.primeira_ocorrencia,
    ultimaOcorrencia: row.ultima_ocorrencia,
    resolucao: row.resolucao,
    resolvidoEm: row.resolvido_em,
    resolvidoPor: row.resolvido_nome,
    // Reaberto: já houve resolução registrada e voltou a ocorrer.
    recorrente: row.ocorrencias > 1,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

const PERIODOS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();
  const params = new URL(request.url).searchParams;

  const incidentId = id(params.get("id"));
  if (incidentId) {
    const row = await db
      .prepare(
        `SELECT i.*, u.nome AS resolvido_nome
         FROM incidentes_plataforma i
         LEFT JOIN usuarios u ON u.id = i.resolvido_por
         WHERE i.id = ? LIMIT 1`,
      )
      .bind(incidentId)
      .first<IncidentRow>();
    if (!row)
      return Response.json({ error: "Incidente não encontrado." }, { status: 404 });
    const occurrences = await db
      .prepare(
        `SELECT o.id, o.incidente_id, o.comunidade_id, o.detalhe, o.contexto, o.criado_em,
                c.nome AS comunidade_nome
         FROM incidente_ocorrencias o
         LEFT JOIN comunidades c ON c.id = o.comunidade_id
         WHERE o.incidente_id = ?
         ORDER BY o.criado_em DESC, o.id DESC
         LIMIT 50`,
      )
      .bind(incidentId)
      .all<OccurrenceRow>();
    const comunidades = await db
      .prepare(
        `SELECT c.id, c.nome, COUNT(o.id) AS ocorrencias
         FROM incidente_ocorrencias o
         JOIN comunidades c ON c.id = o.comunidade_id
         WHERE o.incidente_id = ?
         GROUP BY c.id, c.nome
         ORDER BY ocorrencias DESC, c.nome
         LIMIT 30`,
      )
      .bind(incidentId)
      .all<{ id: number; nome: string; ocorrencias: number }>();
    return Response.json(
      {
        incident: view(row),
        occurrences: occurrences.results.map((item) => ({
          id: item.id,
          comunidade: item.comunidade_nome,
          detalhe: item.detalhe,
          contexto: item.contexto,
          criadoEm: item.criado_em,
        })),
        communities: comunidades.results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  const statusFiltro = clean(params.get("status"), 20).toUpperCase();
  if (statusFiltro === "ATIVOS") {
    conditions.push("i.status IN ('ABERTO', 'EM_ANALISE', 'MITIGADO')");
  } else if ((STATUS_INCIDENTE as readonly string[]).includes(statusFiltro)) {
    conditions.push("i.status = ?");
    values.push(statusFiltro);
  }
  const gravidadeFiltro = clean(params.get("gravidade"), 20).toUpperCase();
  if ((GRAVIDADES_INCIDENTE as readonly string[]).includes(gravidadeFiltro)) {
    conditions.push("i.gravidade = ?");
    values.push(gravidadeFiltro);
  }
  const areaFiltro = clean(params.get("area"), 20).toUpperCase();
  if ((AREAS_INCIDENTE as readonly string[]).includes(areaFiltro)) {
    conditions.push("i.area = ?");
    values.push(areaFiltro);
  }
  const periodo = clean(params.get("periodo"), 10);
  const dias = PERIODOS[periodo];
  if (dias) {
    conditions.push(`i.ultima_ocorrencia >= datetime('now', '-${dias} days')`);
  }
  const busca = clean(params.get("busca"), 80);
  if (busca) {
    conditions.push("(i.titulo LIKE ? OR i.modulo LIKE ?)");
    values.push(`%${busca}%`, `%${busca}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db
    .prepare(
      `SELECT i.*, u.nome AS resolvido_nome
       FROM incidentes_plataforma i
       LEFT JOIN usuarios u ON u.id = i.resolvido_por
       ${where}
       ORDER BY i.prioridade ASC, i.ultima_ocorrencia DESC, i.id DESC
       LIMIT 200`,
    )
    .bind(...values)
    .all<IncidentRow>();

  // Indicadores do topo: contagens reais sobre a base inteira, não sobre o
  // filtro, para não mascarar um crítico aberto fora da visão atual.
  const porGravidade = await db
    .prepare(
      `SELECT gravidade, COUNT(*) AS total FROM incidentes_plataforma
       WHERE status IN ('ABERTO', 'EM_ANALISE', 'MITIGADO')
       GROUP BY gravidade`,
    )
    .all<{ gravidade: string; total: number }>();
  const porStatus = await db
    .prepare(
      "SELECT status, COUNT(*) AS total FROM incidentes_plataforma GROUP BY status",
    )
    .all<{ status: string; total: number }>();
  const recorrentes = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM incidentes_plataforma
       WHERE ocorrencias > 1 AND status IN ('ABERTO', 'EM_ANALISE', 'MITIGADO')`,
    )
    .first<{ total: number }>();

  const gravidades: Record<string, number> = {};
  for (const item of porGravidade.results)
    gravidades[item.gravidade] = Number(item.total) || 0;
  const status: Record<string, number> = {};
  for (const item of porStatus.results)
    status[item.status] = Number(item.total) || 0;

  return Response.json(
    {
      incidents: rows.results.map(view),
      summary: {
        gravidades,
        status,
        abertos:
          (status.ABERTO || 0) + (status.EM_ANALISE || 0) + (status.MITIGADO || 0),
        recorrentes: Number(recorrentes?.total) || 0,
      },
      options: {
        areas: AREAS_INCIDENTE,
        gravidades: GRAVIDADES_INCIDENTE,
        status: STATUS_INCIDENTE,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const titulo = clean(body.titulo, 200);
  if (titulo.length < 3)
    return Response.json(
      { error: "Descreva o incidente em um título com pelo menos 3 caracteres." },
      { status: 400 },
    );
  const db = getD1();
  const comunidadeId = id(body.comunidadeId);
  if (comunidadeId) {
    const comunidade = await db
      .prepare("SELECT id FROM comunidades WHERE id = ? LIMIT 1")
      .bind(comunidadeId)
      .first<{ id: number }>();
    if (!comunidade)
      return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
  }
  try {
    const result = await registrarIncidente(db, {
      area: body.area,
      modulo: clean(body.modulo, 80),
      titulo,
      descricao: clean(body.descricao, 2000),
      gravidade: body.gravidade,
      comunidadeId: comunidadeId || null,
      usuarioId: access.user.id,
      detalhe: clean(body.detalhe, 1000),
      contexto: body.contexto,
    });
    await audit(db, access.user.id, "INCIDENTE_REGISTRADO", {
      incidenteId: result.id,
      chave: result.chaveAgrupamento,
      novo: result.novo,
      reaberto: result.reaberto,
      ocorrencias: result.ocorrencias,
    });
    return Response.json({ ok: true, ...result }, { status: result.novo ? 201 : 200 });
  } catch (registerError) {
    return Response.json(
      { error: (registerError as Error).message || "Não foi possível registrar." },
      { status: 400 },
    );
  }
}

const ACOES = [
  "ASSUME",
  "MITIGATE",
  "RESOLVE",
  "IGNORE",
  "REOPEN",
  "SET_SEVERITY",
  "SET_PRIORITY",
] as const;

export async function PATCH(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const incidentId = id(body.id);
  if (!incidentId)
    return Response.json({ error: "Incidente inválido." }, { status: 400 });
  const action = clean(body.action, 20).toUpperCase();
  if (!(ACOES as readonly string[]).includes(action))
    return Response.json({ error: "Ação não reconhecida." }, { status: 400 });

  const db = getD1();
  const current = await db
    .prepare(
      "SELECT id, status, gravidade, prioridade FROM incidentes_plataforma WHERE id = ? LIMIT 1",
    )
    .bind(incidentId)
    .first<{
      id: number;
      status: string;
      gravidade: string;
      prioridade: number;
    }>();
  if (!current)
    return Response.json({ error: "Incidente não encontrado." }, { status: 404 });

  const statusAtual = normalizarStatus(current.status);

  if (action === "SET_SEVERITY") {
    const gravidade = clean(body.gravidade, 20).toUpperCase();
    if (!(GRAVIDADES_INCIDENTE as readonly string[]).includes(gravidade))
      return Response.json({ error: "Gravidade inválida." }, { status: 400 });
    await db
      .prepare(
        "UPDATE incidentes_plataforma SET gravidade = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(normalizarGravidade(gravidade), incidentId)
      .run();
    await audit(db, access.user.id, "INCIDENTE_GRAVIDADE_ALTERADA", {
      incidenteId: incidentId,
      de: current.gravidade,
      para: gravidade,
    });
    return Response.json({ ok: true });
  }

  if (action === "SET_PRIORITY") {
    const prioridade = Number(body.prioridade);
    if (!Number.isInteger(prioridade) || prioridade < 1 || prioridade > 5)
      return Response.json(
        { error: "A prioridade deve ser um número de 1 a 5." },
        { status: 400 },
      );
    await db
      .prepare(
        "UPDATE incidentes_plataforma SET prioridade = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(prioridade, incidentId)
      .run();
    await audit(db, access.user.id, "INCIDENTE_PRIORIDADE_ALTERADA", {
      incidenteId: incidentId,
      de: current.prioridade,
      para: prioridade,
    });
    return Response.json({ ok: true });
  }

  if (action === "RESOLVE") {
    const resolucao = clean(body.resolucao, 2000);
    if (resolucao.length < 5)
      return Response.json(
        { error: "Descreva como o incidente foi resolvido." },
        { status: 400 },
      );
    await db
      .prepare(
        `UPDATE incidentes_plataforma
         SET status = 'RESOLVIDO', resolucao = ?, resolvido_por = ?,
             resolvido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(resolucao, access.user.id, incidentId)
      .run();
    await audit(db, access.user.id, "INCIDENTE_RESOLVIDO", {
      incidenteId: incidentId,
      statusAnterior: statusAtual,
    });
    return Response.json({ ok: true });
  }

  if (action === "IGNORE") {
    const motivo = clean(body.resolucao || body.motivo, 2000);
    await db
      .prepare(
        `UPDATE incidentes_plataforma
         SET status = 'IGNORADO', resolucao = ?, resolvido_por = ?,
             resolvido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(motivo, access.user.id, incidentId)
      .run();
    await audit(db, access.user.id, "INCIDENTE_IGNORADO", {
      incidenteId: incidentId,
      statusAnterior: statusAtual,
    });
    return Response.json({ ok: true });
  }

  const proximoStatus =
    action === "ASSUME" ? "EM_ANALISE" : action === "MITIGATE" ? "MITIGADO" : "ABERTO";
  if (action === "REOPEN" && statusAtual === "ABERTO")
    return Response.json({ error: "Este incidente já está aberto." }, { status: 400 });
  await db
    .prepare(
      `UPDATE incidentes_plataforma
       SET status = ?,
           resolucao = CASE WHEN ? = 'ABERTO' THEN '' ELSE resolucao END,
           resolvido_por = CASE WHEN ? = 'ABERTO' THEN NULL ELSE resolvido_por END,
           resolvido_em = CASE WHEN ? = 'ABERTO' THEN NULL ELSE resolvido_em END,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(proximoStatus, proximoStatus, proximoStatus, proximoStatus, incidentId)
    .run();
  await audit(db, access.user.id, `INCIDENTE_${action}`, {
    incidenteId: incidentId,
    statusAnterior: statusAtual,
    status: proximoStatus,
  });
  return Response.json({ ok: true });
}
