import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

/**
 * Ferramentas de Relacionamento
 * Fornece dados agregados para análises de visitantes:
 * - Engagement Score
 * - Régua de Acompanhamento
 * - Cadência de Contato
 * - Load Metrics
 * - Regional Grouping
 * - Conflict Detection
 */

type EngagementData = {
  id: number;
  nome_completo: string;
  engagement_score: number;
  status: string;
  ultimo_contato: string | null;
  data_entrada: string;
  acompanhamentos_total: number;
  encontro_com_deus: number;
  curso_membros: number;
  categoria_id: number | null;
  ministerio: string | null;
};

type CadenciaItem = {
  id: number;
  nome_completo: string;
  ultimo_contato: string | null;
  dias_sem_contato: number;
  prioridade: "urgente" | "alta" | "normal" | "baixa";
  proximo_contato: string | null;
};

type LoadMetricItem = {
  responsavel: string;
  total_visitantes: number;
  visitantes_novos: number;
  em_acompanhamento: number;
  integrados: number;
  carga_percentual: number;
};

type ConflictItem = {
  tipo: string;
  severidade: "crítico" | "aviso" | "info";
  descricao: string;
  visitante_ids: number[];
  sugestao: string;
};

/**
 * Calcula o Engagement Score de um visitante (0-100)
 * Pontos:
 * - Frequência de contatos: 30 pontos
 * - Última atividade recente: 20 pontos
 * - Participação em eventos: 20 pontos
 * - Categorias/ministérios: 15 pontos
 * - Tempo na igreja: 15 pontos
 */
function calcularEngagementScore(visitor: {
  ultimo_contato: string | null;
  acompanhamentos_total: number;
  encontro_com_deus: number;
  curso_membros: number;
  categoria_id: number | null;
  ministerio: string | null;
  data_entrada: string;
  status: string;
}): number {
  let score = 0;
  const agora = new Date();

  // 1. Frequência de contatos (30 pontos)
  if (visitor.acompanhamentos_total > 0) {
    const contatosRecentes = Math.min(visitor.acompanhamentos_total / 2, 30);
    score += contatosRecentes;
  }

  // 2. Última atividade recente (20 pontos)
  if (visitor.ultimo_contato) {
    const ultimoContato = new Date(visitor.ultimo_contato);
    const diasDesdeUltimo = Math.floor(
      (agora.getTime() - ultimoContato.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasDesdeUltimo <= 7) score += 20;
    else if (diasDesdeUltimo <= 30) score += 15;
    else if (diasDesdeUltimo <= 60) score += 10;
    else score += 5;
  }

  // 3. Participação em eventos (20 pontos)
  if (visitor.encontro_com_deus > 0 || visitor.curso_membros > 0) {
    const eventos = Math.min((visitor.encontro_com_deus + visitor.curso_membros) * 2, 20);
    score += eventos;
  }

  // 4. Categorias/ministérios (15 pontos)
  if (visitor.categoria_id || visitor.ministerio) {
    score += 15;
  }

  // 5. Tempo na igreja (15 pontos)
  if (visitor.data_entrada) {
    const entrada = new Date(visitor.data_entrada);
    const diasNaIgreja = Math.floor(
      (agora.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasNaIgreja > 180) score += 15;
    else if (diasNaIgreja > 90) score += 10;
    else if (diasNaIgreja > 30) score += 5;
  }

  // 6. Bônus por status
  if (visitor.status === "INTEGRADO") score = Math.min(score + 10, 100);

  return Math.min(Math.round(score), 100);
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;

  const { comunidadeId } = access.context;
  const url = new URL(request.url);
  const ferramenta = url.searchParams.get("ferramenta") || "todas";
  const visitanteIdParam = url.searchParams.get("visitanteId");
  const visitanteId = visitanteIdParam ? Number(visitanteIdParam) : null;
  if (visitanteIdParam && (!Number.isInteger(visitanteId) || Number(visitanteId) <= 0)) {
    return Response.json({ error: "Visitante inválido." }, { status: 400 });
  }

  const db = getD1();

  // ============================================
  // CONTACT LOGGING - Histórico de contatos
  // ============================================
  if (ferramenta === "contatos" && visitanteId) {
    const result = await db
      .prepare(
        `SELECT c.id, c.tipo, c.canal, c.resultado, c.descricao, c.duracao_minutos,
                c.proxima_acao, c.responsavel_id, u.nome as responsavel_nome, c.criado_em
         FROM visitor_contacts c
         LEFT JOIN usuarios u ON u.id = c.responsavel_id
         WHERE c.comunidade_id = ? AND c.visitante_id = ?
         ORDER BY c.criado_em DESC
         LIMIT 50`
      )
        .bind(comunidadeId, visitanteId)
      .all<{
        id: number;
        tipo: string;
        canal: string;
        resultado: string;
        descricao: string;
        duracao_minutos: number | null;
        proxima_acao: string | null;
        responsavel_id: number | null;
        responsavel_nome: string | null;
        criado_em: string;
      }>();

    return Response.json({
      ferramenta: "contatos",
      visitanteId,
      dados: result.results || [],
    });
  }

  // ============================================
  // VISITA TRACKING - Histórico de visitas
  // ============================================
  if (ferramenta === "visitas" && visitanteId) {
    const result = await db
      .prepare(
        `SELECT v.id, v.data_visita, v.local, v.tipo, v.duracao_minutos, v.resultado,
                v.proxima_visita_sugerida, v.responsavel_id, u.nome as responsavel_nome, v.notas
         FROM visitor_visits v
         LEFT JOIN usuarios u ON u.id = v.responsavel_id
         WHERE v.comunidade_id = ? AND v.visitante_id = ?
         ORDER BY v.data_visita DESC
         LIMIT 50`
      )
        .bind(comunidadeId, visitanteId)
      .all<{
        id: number;
        data_visita: string;
        local: string;
        tipo: string;
        duracao_minutos: number | null;
        resultado: string | null;
        proxima_visita_sugerida: string | null;
        responsavel_id: number | null;
        responsavel_nome: string | null;
        notas: string;
      }>();

    return Response.json({
      ferramenta: "visitas",
      visitanteId,
      dados: result.results || [],
    });
  }

  // ============================================
  // 1. ENGAGEMENT SCORE
  // ============================================
  if (ferramenta === "todas" || ferramenta === "engagement") {
    const query = visitanteId
      ? `SELECT v.id, v.nome_completo, v.status, v.ultimo_contato, v.data_entrada,
              v.acompanhamentos_total, v.encontro_com_deus, v.curso_membros,
              v.categoria_id, v.ministerio
         FROM visitantes v
         WHERE v.comunidade_id = ? AND v.id = ?
         LIMIT 1`
      : `SELECT v.id, v.nome_completo, v.status, v.ultimo_contato, v.data_entrada,
              v.acompanhamentos_total, v.encontro_com_deus, v.curso_membros,
              v.categoria_id, v.ministerio
         FROM visitantes v
         WHERE v.comunidade_id = ? AND v.ativo = 1
         ORDER BY v.nome_completo ASC
         LIMIT 200`;

    const params = visitanteId
      ? [comunidadeId, visitanteId]
      : [comunidadeId];

    const result = await db
      .prepare(query)
      .bind(...params)
      .all<Omit<EngagementData, "engagement_score">>();

    if (ferramenta === "engagement") {
      const engagement: EngagementData[] = (result.results || []).map((v) => ({
        ...v,
        engagement_score: calcularEngagementScore({
          ultimo_contato: v.ultimo_contato,
          acompanhamentos_total: v.acompanhamentos_total || 0,
          encontro_com_deus: v.encontro_com_deus || 0,
          curso_membros: v.curso_membros || 0,
          categoria_id: v.categoria_id,
          ministerio: v.ministerio,
          data_entrada: v.data_entrada,
          status: v.status,
        }),
      }));

      return Response.json({
        ferramenta: "engagement",
        dados: engagement,
      });
    }
  }

  // ============================================
  // 2. CADÊNCIA DE CONTATO
  // ============================================
  if (ferramenta === "todas" || ferramenta === "cadencia") {
    const result = await db
      .prepare(
        `SELECT v.id, v.nome_completo, v.ultimo_contato,
                (SELECT a.proximo_contato
                 FROM acompanhamentos a
                 WHERE a.visitante_id = v.id
                   AND a.comunidade_id = v.comunidade_id
                   AND a.escopo_confirmado = 1
                   AND a.proximo_contato IS NOT NULL
                 ORDER BY a.id DESC
                 LIMIT 1) AS proximo_contato
         FROM visitantes v
         WHERE v.comunidade_id = ? AND v.ativo = 1
         ORDER BY
           CASE
             WHEN v.ultimo_contato IS NULL THEN 0
             WHEN datetime(v.ultimo_contato) < datetime('now', '-30 days') THEN 1
             WHEN datetime(v.ultimo_contato) < datetime('now', '-7 days') THEN 2
             ELSE 3
           END ASC,
           v.ultimo_contato ASC
         LIMIT 100`
      )
      .bind(comunidadeId)
      .all<{
        id: number;
        nome_completo: string;
        ultimo_contato: string | null;
        proximo_contato: string | null;
      }>();

    if (ferramenta === "cadencia") {
      const agora = new Date();
      const cadencia: CadenciaItem[] = (result.results || []).map((v) => {
        const ultimo = v.ultimo_contato ? new Date(v.ultimo_contato) : null;
        const diasSemContato = ultimo
          ? Math.floor((agora.getTime() - ultimo.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        let prioridade: "urgente" | "alta" | "normal" | "baixa";
        if (diasSemContato > 60) prioridade = "urgente";
        else if (diasSemContato > 30) prioridade = "alta";
        else if (diasSemContato > 7) prioridade = "normal";
        else prioridade = "baixa";

        return {
          id: v.id,
          nome_completo: v.nome_completo,
          ultimo_contato: v.ultimo_contato,
          dias_sem_contato: diasSemContato,
          prioridade,
          proximo_contato: v.proximo_contato,
        };
      });

      return Response.json({
        ferramenta: "cadencia",
        dados: cadencia,
      });
    }
  }

  // ============================================
  // 3. LOAD METRICS (Carga de trabalho)
  // ============================================
  if (ferramenta === "todas" || ferramenta === "carga") {
    const result = await db
      .prepare(
        `SELECT
           COALESCE(v.criado_por, 'Não atribuído') as responsavel,
           COUNT(*) as total_visitantes,
           SUM(CASE WHEN v.status = 'NOVO' THEN 1 ELSE 0 END) as visitantes_novos,
           SUM(CASE WHEN v.status = 'EM_ACOMPANHAMENTO' THEN 1 ELSE 0 END) as em_acompanhamento,
           SUM(CASE WHEN v.status = 'INTEGRADO' THEN 1 ELSE 0 END) as integrados
         FROM visitantes v
         WHERE v.comunidade_id = ? AND v.ativo = 1
         GROUP BY v.criado_por
         ORDER BY total_visitantes DESC`
      )
      .bind(comunidadeId)
      .all<{
        responsavel: string;
        total_visitantes: number;
        visitantes_novos: number;
        em_acompanhamento: number;
        integrados: number;
      }>();

    if (ferramenta === "carga") {
      const items = result.results || [];
      const maxCarga = Math.max(...items.map((i) => i.total_visitantes), 1);

      const carga: LoadMetricItem[] = items.map((item) => ({
        responsavel: item.responsavel,
        total_visitantes: item.total_visitantes,
        visitantes_novos: item.visitantes_novos || 0,
        em_acompanhamento: item.em_acompanhamento || 0,
        integrados: item.integrados || 0,
        carga_percentual: Math.round((item.total_visitantes / maxCarga) * 100),
      }));

      return Response.json({
        ferramenta: "carga",
        dados: carga,
      });
    }
  }

  // ============================================
  // 4. REGIONAL GROUPING
  // ============================================
  if (ferramenta === "todas" || ferramenta === "regional") {
    const result = await db
      .prepare(
        `SELECT
           c.id,
           c.nome,
           COUNT(v.id) as total_visitantes,
           SUM(CASE WHEN v.status = 'NOVO' THEN 1 ELSE 0 END) as novos,
           SUM(CASE WHEN v.status = 'INTEGRADO' THEN 1 ELSE 0 END) as integrados
         FROM celulas c
         LEFT JOIN visitantes v ON v.celula_id = c.id AND v.comunidade_id = ? AND v.ativo = 1
         WHERE c.comunidade_id = ? AND c.ativo = 1
         GROUP BY c.id, c.nome
         ORDER BY total_visitantes DESC`
      )
      .bind(comunidadeId, comunidadeId)
      .all<{
        id: number;
        nome: string;
        total_visitantes: number;
        novos: number;
        integrados: number;
      }>();

    if (ferramenta === "regional") {
      return Response.json({
        ferramenta: "regional",
        dados: result.results || [],
      });
    }
  }

  // ============================================
  // FERRAMENTA 6: CADÊNCIA AVANÇADA
  // ============================================
  if (ferramenta === "todas" || ferramenta === "cadencia-avancada") {
    const result = await db
      .prepare(
        `SELECT
           v.id, v.nome_completo, v.ultimo_contato, v.criado_por as responsavel,
           c.nome as categoria, v.categoria_id
         FROM visitantes v
         LEFT JOIN categorias_acompanhamento c ON c.id = v.categoria_id
         WHERE v.comunidade_id = ? AND v.ativo = 1
         ORDER BY
           CASE
             WHEN datetime(v.ultimo_contato) < datetime('now', '-60 days') THEN 0
             WHEN datetime(v.ultimo_contato) < datetime('now', '-30 days') THEN 1
             WHEN datetime(v.ultimo_contato) < datetime('now', '-7 days') THEN 2
             ELSE 3
           END ASC,
           v.ultimo_contato ASC
         LIMIT 100`
      )
      .bind(comunidadeId)
      .all<{
        id: number;
        nome_completo: string;
        ultimo_contato: string | null;
        responsavel: string | null;
        categoria: string | null;
        categoria_id: number | null;
      }>();

    if (ferramenta === "cadencia-avancada") {
      const agora = new Date();
      const cadenciaAvancada = (result.results || []).map((v) => {
        const ultimo = v.ultimo_contato ? new Date(v.ultimo_contato) : null;
        const diasSemContato = ultimo
          ? Math.floor((agora.getTime() - ultimo.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        let prioridade: "urgente" | "alta" | "normal" | "baixa";
        let sugestao: string;

        if (diasSemContato > 60) {
          prioridade = "urgente";
          sugestao = "Contato urgente — mais de 2 meses sem comunicação";
        } else if (diasSemContato > 30) {
          prioridade = "alta";
          sugestao = "Contato necessário — considere uma ligação ou visita";
        } else if (diasSemContato > 7) {
          prioridade = "normal";
          sugestao = "Contato agendado — envie mensagem ou confirme presença";
        } else {
          prioridade = "baixa";
          sugestao = "Contato recente — mantenha comunicação";
        }

        return {
          id: v.id,
          nome_completo: v.nome_completo,
          ultimo_contato: v.ultimo_contato,
          dias_sem_contato: diasSemContato,
          categoria: v.categoria,
          responsavel: v.responsavel,
          prioridade,
          sugestao,
        };
      });

      return Response.json({
        ferramenta: "cadencia-avancada",
        dados: cadenciaAvancada,
      });
    }
  }

  // ============================================
  // 5. CONFLICT DETECTION
  // ============================================
  if (ferramenta === "todas" || ferramenta === "conflitos") {
    const conflitos: ConflictItem[] = [];

    // Telefones duplicados
    const telefonesDuplicados = await db
      .prepare(
        `SELECT telefone, COUNT(*) as total, GROUP_CONCAT(id) as ids
         FROM visitantes
         WHERE comunidade_id = ? AND telefone IS NOT NULL AND telefone != ''
         GROUP BY telefone
         HAVING COUNT(*) > 1`
      )
      .bind(comunidadeId)
      .all<{ telefone: string; total: number; ids: string }>();

    for (const row of telefonesDuplicados.results || []) {
      conflitos.push({
        tipo: "telefone_duplicado",
        severidade: "aviso",
        descricao: `Telefone ${row.telefone} duplicado em ${row.total} visitantes`,
        visitante_ids: row.ids.split(",").map(Number),
        sugestao: "Verificar se são pessoas diferentes ou se há duplicata",
      });
    }

    // Emails duplicados
    const emailsDuplicados = await db
      .prepare(
        `SELECT email, COUNT(*) as total, GROUP_CONCAT(id) as ids
         FROM visitantes
         WHERE comunidade_id = ? AND email IS NOT NULL AND email != ''
         GROUP BY email
         HAVING COUNT(*) > 1`
      )
      .bind(comunidadeId)
      .all<{ email: string; total: number; ids: string }>();

    for (const row of emailsDuplicados.results || []) {
      conflitos.push({
        tipo: "email_duplicado",
        severidade: "crítico",
        descricao: `Email ${row.email} duplicado em ${row.total} visitantes`,
        visitante_ids: row.ids.split(",").map(Number),
        sugestao: "Verificar e mesclar registros se necessário",
      });
    }

    // Status incoerente: "integrado" mas nunca visitado
    const statusIncoerente = await db
      .prepare(
        `SELECT id, nome_completo
         FROM visitantes
         WHERE comunidade_id = ? AND status = 'INTEGRADO'
           AND (acompanhamentos_total = 0 OR acompanhamentos_total IS NULL)
         LIMIT 20`
      )
      .bind(comunidadeId)
      .all<{ id: number; nome_completo: string }>();

    if ((statusIncoerente.results || []).length > 0) {
      conflitos.push({
        tipo: "status_incoerente",
        severidade: "aviso",
        descricao: `${statusIncoerente.results?.length} visitante(s) marcado(s) como integrado mas sem acompanhamentos`,
        visitante_ids: statusIncoerente.results?.map((v) => v.id) || [],
        sugestao: "Revisar status ou adicionar acompanhamentos",
      });
    }

    if (ferramenta === "conflitos") {
      return Response.json({
        ferramenta: "conflitos",
        dados: conflitos,
      });
    }
  }

  // Retornar todas as ferramentas
  return Response.json({
    mensagem: "Use ferramenta=engagement|cadencia|carga|regional|conflitos|contatos|visitas para dados específicos",
  });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("followups.manage");
  if ("error" in access) return access.error;
  const { comunidadeId, userId } = access.context;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }

  const tipo = String(corpo.tipo || "").toUpperCase();
  const db = getD1();

  // ============================================
  // POST: CONTACT LOGGING
  // ============================================
  if (tipo === "CONTATO") {
    const visitanteId = Number(corpo.visitanteId || 0);
    const canal = String(corpo.canal || "OUTRO").toUpperCase();
    const resultado = String(corpo.resultado || "").trim().slice(0, 160);
    const duracaoMinutos = optionalDuration(corpo.duracao_minutos);

    if (!Number.isInteger(visitanteId) || visitanteId <= 0 || !resultado) {
      return Response.json(
        { error: "Visitante e resultado são obrigatórios." },
        { status: 400 }
      );
    }
    if (!CONTACT_CHANNELS.has(canal) || duracaoMinutos === undefined) {
      return Response.json({ error: "Canal ou duração inválidos." }, { status: 400 });
    }
    if (!(await visitorBelongsToCommunity(db, comunidadeId, visitanteId))) {
      return Response.json({ error: "Visitante não encontrado nesta comunidade." }, { status: 404 });
    }

    const criado = await db
      .prepare(
        `INSERT INTO visitor_contacts
          (comunidade_id, visitante_id, tipo, canal, resultado, descricao, duracao_minutos, proxima_acao, responsavel_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(
        comunidadeId,
        visitanteId,
        "CONTATO",
        canal,
        resultado,
        String(corpo.descricao || "").trim().slice(0, 1000),
        duracaoMinutos,
        corpo.proxima_acao ? String(corpo.proxima_acao).slice(0, 100) : null,
        userId
      )
      .first<{ id: number }>();

    // Atualizar último contato do visitante
    await db
      .prepare(`UPDATE visitantes SET ultimo_contato = datetime('now') WHERE id = ? AND comunidade_id = ?`)
      .bind(visitanteId, comunidadeId)
      .run();

    return Response.json({ id: criado?.id, tipo: "contato" }, { status: 201 });
  }

  // ============================================
  // POST: VISITA TRACKING
  // ============================================
  if (tipo === "VISITA") {
    const visitanteId = Number(corpo.visitanteId || 0);
    const dataVisita = String(corpo.dataVisita || "").trim();
    const visitaTipo = String(corpo.visitaTipo || "ACOMPANHAMENTO").toUpperCase();
    const duracaoMinutos = optionalDuration(corpo.duracao_minutos);

    if (!Number.isInteger(visitanteId) || visitanteId <= 0 || !dataVisita) {
      return Response.json(
        { error: "Visitante e data da visita são obrigatórios." },
        { status: 400 }
      );
    }

    if (
      Number.isNaN(Date.parse(dataVisita)) ||
      !VISIT_TYPES.has(visitaTipo) ||
      duracaoMinutos === undefined
    ) {
      return Response.json(
        { error: "Data, tipo ou duração da visita inválidos." },
        { status: 400 }
      );
    }
    if (!(await visitorBelongsToCommunity(db, comunidadeId, visitanteId))) {
      return Response.json({ error: "Visitante não encontrado nesta comunidade." }, { status: 404 });
    }

    const criado = await db
      .prepare(
        `INSERT INTO visitor_visits
          (comunidade_id, visitante_id, data_visita, local, tipo, duracao_minutos, resultado, proxima_visita_sugerida, responsavel_id, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(
        comunidadeId,
        visitanteId,
        new Date(dataVisita).toISOString(),
        String(corpo.local || "Igreja").slice(0, 180),
        visitaTipo,
        duracaoMinutos,
        corpo.resultado ? String(corpo.resultado).slice(0, 500) : null,
        corpo.proxima_visita_sugerida ? String(corpo.proxima_visita_sugerida) : null,
        userId,
        String(corpo.notas || "").trim().slice(0, 1000)
      )
      .first<{ id: number }>();

    return Response.json({ id: criado?.id, tipo: "visita" }, { status: 201 });
  }

  return Response.json({ error: "Tipo de solicitação desconhecido." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("followups.manage");
  if ("error" in access) return access.error;
  const { comunidadeId, userId } = access.context;

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const id = Number(url.searchParams.get("id"));

  if (!tipo || !id || id <= 0) {
    return Response.json({ error: "Tipo e ID obrigatórios." }, { status: 400 });
  }

  const db = getD1();

  // ============================================
  // DELETE: CONTACT LOGGING
  // ============================================
  if (tipo === "contato") {
    const resultado = await db
      .prepare(
        `DELETE FROM visitor_contacts
         WHERE id = ? AND comunidade_id = ? AND responsavel_id = ?`
      )
      .bind(id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Contato não encontrado ou sem permissão." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  // ============================================
  // DELETE: VISITA TRACKING
  // ============================================
  if (tipo === "visita") {
    const resultado = await db
      .prepare(
        `DELETE FROM visitor_visits
         WHERE id = ? AND comunidade_id = ? AND responsavel_id = ?`
      )
      .bind(id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Visita não encontrada ou sem permissão." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Tipo desconhecido." }, { status: 400 });
}

const CONTACT_CHANNELS = new Set(["WHATSAPP", "TELEFONE", "EMAIL", "PRESENCIAL", "OUTRO"]);
const VISIT_TYPES = new Set(["ACOMPANHAMENTO", "PASTORAL", "SOCIAL", "HOSPITALAR", "OUTRO"]);

function optionalDuration(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) return undefined;
  return duration;
}

async function visitorBelongsToCommunity(
  db: ReturnType<typeof getD1>,
  communityId: number,
  visitorId: number,
) {
  const visitor = await db
    .prepare("SELECT id FROM visitantes WHERE id = ? AND comunidade_id = ? AND ativo = 1 LIMIT 1")
    .bind(visitorId, communityId)
    .first<{ id: number }>();
  return Boolean(visitor);
}
