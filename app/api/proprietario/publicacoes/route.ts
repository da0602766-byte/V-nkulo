import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  AMBIENTES_PUBLICACAO,
  CHAVES_ETAPAS,
  ETAPAS_PIPELINE,
  STATUS_ETAPA,
  STATUS_PUBLICACAO,
  avaliarHealthCheck,
  compararVersoes,
  deveReverterAutomaticamente,
  etapaPorChave,
  normalizarAmbiente,
  podeAvancar,
  proximaEtapa,
  resumirPipeline,
} from "../../../lib/release-pipeline.mjs";

// Governança das publicações (releases) da plataforma.
//
// Esta API REGISTRA o processo de publicação: ela não roda build, não executa
// testes e não faz deploy. Quem executa é o CI/hospedagem, que reporta cada
// etapa aqui (START_STAGE/FINISH_STAGE/HEALTH_CHECK). Nada é preenchido por
// suposição: etapa sem relato fica PENDENTE, e health check sem resultado fica
// como não reportado.
//
// A regra inegociável: publicação em PRODUCAO só avança com aprovação
// explícita registrada (aprovacao_status = APROVADO). O servidor recusa com
// 409 qualquer tentativa de publicar sem ela — a interface não é a guarda.

type DeployRow = {
  id: number;
  versao: string;
  commit_sha: string;
  branch: string;
  autor: string;
  mensagem: string;
  ambiente: string;
  status: string;
  etapa_atual: string;
  iniciado_em: string;
  concluido_em: string | null;
  duracao_ms: number;
  aprovacao_status: string;
  aprovado_por: number | null;
  aprovado_em: string | null;
  aprovacao_motivo: string;
  health_check: string;
  rollback_de_id: number | null;
  rollback_motivo: string;
  rollback_automatico: number;
  observacoes: string;
  registrado_por: number | null;
  criado_em: string;
  atualizado_em: string;
  aprovador_nome?: string | null;
  registrante_nome?: string | null;
  revertida_versao?: string | null;
};

type StageRow = {
  id: number;
  deploy_id: number;
  etapa: string;
  ordem: number;
  status: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  duracao_ms: number;
  resultado: string;
  logs: string;
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

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function stageView(row: StageRow) {
  const definicao = etapaPorChave(row.etapa);
  return {
    id: row.id,
    etapa: row.etapa,
    rotulo: definicao?.rotulo || row.etapa,
    descricao: definicao?.descricao || "",
    critica: definicao?.critica === true,
    ordem: row.ordem,
    status: row.status,
    iniciadoEm: row.iniciado_em,
    concluidoEm: row.concluido_em,
    duracaoMs: Number(row.duracao_ms) || 0,
    resultado: row.resultado,
    logs: row.logs,
  };
}

function deployView(row: DeployRow, stages: StageRow[]) {
  const etapas = stages
    .filter((stage) => stage.deploy_id === row.id)
    .map(stageView)
    .sort((a, b) => a.ordem - b.ordem);
  const healthCheck = parseJson(row.health_check);
  return {
    id: row.id,
    versao: row.versao,
    commitSha: row.commit_sha,
    branch: row.branch,
    autor: row.autor,
    mensagem: row.mensagem,
    ambiente: row.ambiente,
    status: row.status,
    etapaAtual: row.etapa_atual,
    iniciadoEm: row.iniciado_em,
    concluidoEm: row.concluido_em,
    duracaoMs: Number(row.duracao_ms) || 0,
    aprovacaoStatus: row.aprovacao_status,
    aprovadoPor: row.aprovador_nome || null,
    aprovadoEm: row.aprovado_em,
    aprovacaoMotivo: row.aprovacao_motivo,
    healthCheck,
    // A avaliação é recalculada a partir do que foi reportado — nunca de um
    // veredito guardado que poderia ter ficado desatualizado.
    avaliacaoSaude: avaliarHealthCheck(healthCheck.resultado ?? healthCheck),
    rollbackDeId: row.rollback_de_id,
    rollbackDeVersao: row.revertida_versao || null,
    rollbackMotivo: row.rollback_motivo,
    rollbackAutomatico: Number(row.rollback_automatico) === 1,
    observacoes: row.observacoes,
    registradoPor: row.registrante_nome || null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    etapas,
    resumo: resumirPipeline(etapas),
  };
}

const SELECT_DEPLOY = `SELECT p.*, a.nome AS aprovador_nome, r.nome AS registrante_nome,
         o.versao AS revertida_versao
  FROM publicacoes_deploy p
  LEFT JOIN usuarios a ON a.id = p.aprovado_por
  LEFT JOIN usuarios r ON r.id = p.registrado_por
  LEFT JOIN publicacoes_deploy o ON o.id = p.rollback_de_id`;

const PERIODOS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

async function loadStages(db: ReturnType<typeof getD1>, ids: number[]) {
  if (ids.length === 0) return [] as StageRow[];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT * FROM publicacao_etapas WHERE deploy_id IN (${placeholders}) ORDER BY deploy_id, ordem`,
    )
    .bind(...ids)
    .all<StageRow>();
  return rows.results;
}

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();
  const params = new URL(request.url).searchParams;

  const deployId = id(params.get("id"));
  if (deployId) {
    const row = await db
      .prepare(`${SELECT_DEPLOY} WHERE p.id = ? LIMIT 1`)
      .bind(deployId)
      .first<DeployRow>();
    if (!row)
      return Response.json({ error: "Publicação não encontrada." }, { status: 404 });
    const stages = await loadStages(db, [deployId]);
    const anterior = await db
      .prepare(
        `SELECT versao, concluido_em, commit_sha FROM publicacoes_deploy
         WHERE ambiente = ? AND status = 'PUBLICADO' AND id <> ?
         ORDER BY concluido_em DESC, id DESC LIMIT 1`,
      )
      .bind(row.ambiente, deployId)
      .first<{ versao: string; concluido_em: string | null; commit_sha: string }>();
    const detalhe = deployView(row, stages);
    return Response.json(
      {
        deploy: detalhe,
        // Comparação entre versões: o que estava no ar antes desta publicação.
        comparacao: anterior
          ? {
              versaoAnterior: anterior.versao,
              commitAnterior: anterior.commit_sha,
              publicadaEm: anterior.concluido_em,
              ordem: compararVersoes(row.versao, anterior.versao),
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  const ambienteFiltro = clean(params.get("ambiente"), 20).toUpperCase();
  if ((AMBIENTES_PUBLICACAO as string[]).includes(ambienteFiltro)) {
    conditions.push("p.ambiente = ?");
    values.push(ambienteFiltro);
  }
  const statusFiltro = clean(params.get("status"), 30).toUpperCase();
  if (statusFiltro === "ATIVAS") {
    conditions.push(
      "p.status IN ('PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO')",
    );
  } else if ((STATUS_PUBLICACAO as string[]).includes(statusFiltro)) {
    conditions.push("p.status = ?");
    values.push(statusFiltro);
  }
  const dias = PERIODOS[clean(params.get("periodo"), 10)];
  if (dias) {
    conditions.push(`p.iniciado_em >= datetime('now', '-${dias} days')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db
    .prepare(
      `${SELECT_DEPLOY} ${where} ORDER BY p.iniciado_em DESC, p.id DESC LIMIT 100`,
    )
    .bind(...values)
    .all<DeployRow>();
  const stages = await loadStages(
    db,
    rows.results.map((row) => row.id),
  );
  const deploys = rows.results.map((row) => deployView(row, stages));

  // Indicadores calculados sobre a base inteira, não sobre o filtro, para não
  // esconder uma publicação travada fora da visão atual.
  const ultimaPublicada = await db
    .prepare(
      `${SELECT_DEPLOY} WHERE p.status = 'PUBLICADO' ORDER BY p.concluido_em DESC, p.id DESC LIMIT 1`,
    )
    .first<DeployRow>();
  const emAndamento = await db
    .prepare(
      `${SELECT_DEPLOY} WHERE p.status IN ('PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO')
       ORDER BY p.iniciado_em DESC, p.id DESC LIMIT 1`,
    )
    .first<DeployRow>();
  const contagens = await db
    .prepare(
      "SELECT status, COUNT(*) AS total FROM publicacoes_deploy GROUP BY status",
    )
    .all<{ status: string; total: number }>();
  const falhasRecentes = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM publicacoes_deploy
       WHERE status IN ('FALHOU', 'REVERTIDO') AND iniciado_em >= datetime('now', '-30 days')`,
    )
    .first<{ total: number }>();
  const reversoesAutomaticas = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM publicacoes_deploy WHERE rollback_automatico = 1",
    )
    .first<{ total: number }>();
  const historico = await db
    .prepare(
      `SELECT id, versao, ambiente, status, commit_sha, concluido_em
       FROM publicacoes_deploy
       WHERE status IN ('PUBLICADO', 'REVERTIDO')
       ORDER BY concluido_em DESC, id DESC LIMIT 30`,
    )
    .all<{
      id: number;
      versao: string;
      ambiente: string;
      status: string;
      commit_sha: string;
      concluido_em: string | null;
    }>();

  const status: Record<string, number> = {};
  for (const item of contagens.results)
    status[item.status] = Number(item.total) || 0;

  const detalheEmAndamento = emAndamento
    ? deployView(emAndamento, await loadStages(db, [emAndamento.id]))
    : null;

  return Response.json(
    {
      deploys,
      summary: {
        status,
        ultimaPublicada: ultimaPublicada
          ? {
              id: ultimaPublicada.id,
              versao: ultimaPublicada.versao,
              ambiente: ultimaPublicada.ambiente,
              commitSha: ultimaPublicada.commit_sha,
              concluidoEm: ultimaPublicada.concluido_em,
              duracaoMs: Number(ultimaPublicada.duracao_ms) || 0,
            }
          : null,
        emAndamento: detalheEmAndamento,
        falhasRecentes: Number(falhasRecentes?.total) || 0,
        reversoesAutomaticas: Number(reversoesAutomaticas?.total) || 0,
        aguardandoAprovacao: status.AGUARDANDO_APROVACAO || 0,
      },
      // Histórico para comparar versões entre si, já ordenado pelo semver.
      historico: historico.results
        .map((item) => ({
          id: item.id,
          versao: item.versao,
          ambiente: item.ambiente,
          status: item.status,
          commitSha: item.commit_sha,
          concluidoEm: item.concluido_em,
        }))
        .sort((a, b) => compararVersoes(b.versao, a.versao)),
      options: {
        etapas: ETAPAS_PIPELINE,
        ambientes: AMBIENTES_PUBLICACAO,
        status: STATUS_PUBLICACAO,
        statusEtapa: STATUS_ETAPA,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function criarEtapas(db: ReturnType<typeof getD1>, deployId: number) {
  for (const etapa of ETAPAS_PIPELINE) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO publicacao_etapas (deploy_id, etapa, ordem, status) VALUES (?, ?, ?, 'PENDENTE')",
      )
      .bind(deployId, etapa.chave, etapa.ordem)
      .run();
  }
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
  const versao = clean(body.versao, 40);
  if (versao.length < 1)
    return Response.json(
      { error: "Informe a versão da publicação." },
      { status: 400 },
    );
  const commitSha = clean(body.commitSha, 60);
  if (commitSha.length < 7)
    return Response.json(
      { error: "Informe o commit da publicação (mínimo 7 caracteres)." },
      { status: 400 },
    );
  const branch = clean(body.branch, 120);
  if (!branch)
    return Response.json({ error: "Informe a branch publicada." }, { status: 400 });
  const autor = clean(body.autor, 120);
  if (!autor)
    return Response.json({ error: "Informe o autor da publicação." }, { status: 400 });
  const ambiente = normalizarAmbiente(body.ambiente);

  const db = getD1();
  const result = await db
    .prepare(
      `INSERT INTO publicacoes_deploy
       (versao, commit_sha, branch, autor, mensagem, ambiente, status, etapa_atual, observacoes, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', 'COMMIT', ?, ?)`,
    )
    .bind(
      versao,
      commitSha,
      branch,
      autor,
      clean(body.mensagem, 500),
      ambiente,
      clean(body.observacoes, 500),
      access.user.id,
    )
    .run();
  const deployId = Number(result.meta.last_row_id);
  await criarEtapas(db, deployId);
  await audit(db, access.user.id, "PUBLICACAO_REGISTRADA", {
    deployId,
    versao,
    ambiente,
    commitSha,
    branch,
  });
  return Response.json({ ok: true, id: deployId }, { status: 201 });
}

const ACOES = [
  "START_STAGE",
  "FINISH_STAGE",
  "APPROVE",
  "REJECT",
  "PUBLISH",
  "HEALTH_CHECK",
  "ROLLBACK",
  "CANCEL",
] as const;

const DURACAO_SQL =
  "CAST((julianday('now') - julianday(COALESCE(iniciado_em, CURRENT_TIMESTAMP))) * 86400000 AS INTEGER)";

async function stagesOf(db: ReturnType<typeof getD1>, deployId: number) {
  const rows = await loadStages(db, [deployId]);
  return rows.map((row) => ({
    etapa: row.etapa,
    status: row.status,
    duracaoMs: Number(row.duracao_ms) || 0,
  }));
}

export async function PATCH(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const deployId = id(body.id);
  if (!deployId)
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  const action = clean(body.action, 20).toUpperCase();
  if (!(ACOES as readonly string[]).includes(action))
    return Response.json({ error: "Ação não reconhecida." }, { status: 400 });

  const db = getD1();
  const current = await db
    .prepare("SELECT * FROM publicacoes_deploy WHERE id = ? LIMIT 1")
    .bind(deployId)
    .first<DeployRow>();
  if (!current)
    return Response.json({ error: "Publicação não encontrada." }, { status: 404 });

  if (action === "START_STAGE" || action === "FINISH_STAGE") {
    const etapa = clean(body.etapa, 30).toUpperCase();
    if (!(CHAVES_ETAPAS as string[]).includes(etapa))
      return Response.json(
        { error: "Etapa fora do pipeline de publicação." },
        { status: 400 },
      );
    const registro = await db
      .prepare(
        "SELECT * FROM publicacao_etapas WHERE deploy_id = ? AND etapa = ? LIMIT 1",
      )
      .bind(deployId, etapa)
      .first<StageRow>();
    if (!registro)
      return Response.json(
        { error: "Etapa não registrada para esta publicação." },
        { status: 404 },
      );

    if (action === "START_STAGE") {
      const permissao = podeAvancar({
        etapa,
        status: current.status,
        aprovacaoStatus: current.aprovacao_status,
        ambiente: current.ambiente,
      });
      if (!permissao.permitido)
        return Response.json({ error: permissao.motivo }, { status: 409 });
      // Iniciar a etapa de aprovação é o que deixa a publicação visivelmente
      // parada esperando uma decisão humana.
      const statusPublicacao =
        etapa === "APROVACAO" && current.aprovacao_status === "PENDENTE"
          ? "AGUARDANDO_APROVACAO"
          : "EM_ANDAMENTO";
      await db
        .prepare(
          `UPDATE publicacao_etapas
           SET status = 'EM_ANDAMENTO', iniciado_em = CURRENT_TIMESTAMP,
               concluido_em = NULL, duracao_ms = 0
           WHERE deploy_id = ? AND etapa = ?`,
        )
        .bind(deployId, etapa)
        .run();
      await db
        .prepare(
          `UPDATE publicacoes_deploy
           SET etapa_atual = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(etapa, statusPublicacao, deployId)
        .run();
      await audit(db, access.user.id, "PUBLICACAO_ETAPA_INICIADA", {
        deployId,
        etapa,
        ambiente: current.ambiente,
      });
      return Response.json({ ok: true, status: statusPublicacao });
    }

    const statusEtapa = clean(body.status, 20).toUpperCase();
    if (!["SUCESSO", "FALHA", "PULADA"].includes(statusEtapa))
      return Response.json(
        { error: "Informe o resultado da etapa: sucesso, falha ou pulada." },
        { status: 400 },
      );
    await db
      .prepare(
        `UPDATE publicacao_etapas
         SET status = ?, concluido_em = CURRENT_TIMESTAMP,
             duracao_ms = ${DURACAO_SQL}, resultado = ?, logs = ?
         WHERE deploy_id = ? AND etapa = ?`,
      )
      .bind(
        statusEtapa,
        clean(body.resultado, 2000),
        clean(body.logs, 20000),
        deployId,
        etapa,
      )
      .run();

    const etapas = await stagesOf(db, deployId);
    const resumo = resumirPipeline(etapas);
    const total = etapas.reduce((soma, item) => soma + item.duracaoMs, 0);
    let statusPublicacao = current.status;
    let concluir = false;
    if (statusEtapa === "FALHA") {
      statusPublicacao = "FALHOU";
      concluir = true;
    } else if (etapa === "CONCLUIDO" || resumo.concluido) {
      statusPublicacao = "PUBLICADO";
      concluir = true;
    } else {
      statusPublicacao = "EM_ANDAMENTO";
    }
    // A etapa corrente passa a ser a seguinte da sequência fixa.
    const proxima = statusEtapa === "FALHA" ? etapaPorChave(etapa) : proximaEtapa(etapa);
    await db
      .prepare(
        `UPDATE publicacoes_deploy
         SET status = ?, etapa_atual = ?, duracao_ms = ?,
             concluido_em = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE concluido_em END,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        statusPublicacao,
        proxima?.chave || current.etapa_atual,
        total,
        concluir ? 1 : 0,
        deployId,
      )
      .run();

    // Falha crítica depois da publicação é reversão automática — marcada aqui
    // para o proprietário ver, não executada às escondidas.
    const automatico = deveReverterAutomaticamente({
      etapas,
      healthCheck: parseJson(current.health_check).resultado,
    });
    if (automatico && Number(current.rollback_automatico) !== 1) {
      await db
        .prepare(
          "UPDATE publicacoes_deploy SET rollback_automatico = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(deployId)
        .run();
    }
    await audit(db, access.user.id, "PUBLICACAO_ETAPA_CONCLUIDA", {
      deployId,
      etapa,
      status: statusEtapa,
      publicacao: statusPublicacao,
    });
    return Response.json({
      ok: true,
      status: statusPublicacao,
      resumo,
      exigeRollback: automatico,
    });
  }

  if (action === "APPROVE" || action === "REJECT") {
    const motivo = clean(body.motivo, 1000);
    if (action === "REJECT" && motivo.length < 5)
      return Response.json(
        { error: "Explique em poucas palavras por que a publicação foi recusada." },
        { status: 400 },
      );
    if (["PUBLICADO", "REVERTIDO", "CANCELADO"].includes(current.status))
      return Response.json(
        { error: "Esta publicação já está encerrada." },
        { status: 409 },
      );
    const aprovacao = action === "APPROVE" ? "APROVADO" : "RECUSADO";
    const statusPublicacao = action === "APPROVE" ? "EM_ANDAMENTO" : "CANCELADO";
    await db
      .prepare(
        `UPDATE publicacoes_deploy
         SET aprovacao_status = ?, aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP,
             aprovacao_motivo = ?, status = ?,
             concluido_em = CASE WHEN ? = 'CANCELADO' THEN CURRENT_TIMESTAMP ELSE concluido_em END,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        aprovacao,
        access.user.id,
        motivo,
        statusPublicacao,
        statusPublicacao,
        deployId,
      )
      .run();
    await db
      .prepare(
        `UPDATE publicacao_etapas
         SET status = ?, concluido_em = CURRENT_TIMESTAMP, duracao_ms = ${DURACAO_SQL},
             resultado = ?
         WHERE deploy_id = ? AND etapa = 'APROVACAO'`,
      )
      .bind(
        action === "APPROVE" ? "SUCESSO" : "FALHA",
        motivo ||
          (action === "APPROVE" ? "Aprovado pelo proprietário." : "Recusado."),
        deployId,
      )
      .run();
    await audit(
      db,
      access.user.id,
      action === "APPROVE" ? "PUBLICACAO_APROVADA" : "PUBLICACAO_RECUSADA",
      { deployId, versao: current.versao, ambiente: current.ambiente, motivo },
    );
    return Response.json({ ok: true, aprovacaoStatus: aprovacao });
  }

  if (action === "PUBLISH") {
    // Aqui mora a guarda: produção sem aprovação registrada não passa.
    const permissao = podeAvancar({
      etapa: "PUBLICACAO",
      status: current.status,
      aprovacaoStatus: current.aprovacao_status,
      ambiente: current.ambiente,
    });
    if (!permissao.permitido) {
      await audit(db, access.user.id, "PUBLICACAO_BLOQUEADA", {
        deployId,
        ambiente: current.ambiente,
        aprovacaoStatus: current.aprovacao_status,
        motivo: permissao.motivo,
      });
      return Response.json({ error: permissao.motivo }, { status: 409 });
    }
    await db
      .prepare(
        `UPDATE publicacao_etapas
         SET status = 'EM_ANDAMENTO', iniciado_em = CURRENT_TIMESTAMP, concluido_em = NULL, duracao_ms = 0
         WHERE deploy_id = ? AND etapa = 'PUBLICACAO'`,
      )
      .bind(deployId)
      .run();
    await db
      .prepare(
        `UPDATE publicacoes_deploy
         SET status = 'EM_ANDAMENTO', etapa_atual = 'PUBLICACAO', atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(deployId)
      .run();
    await audit(db, access.user.id, "PUBLICACAO_LIBERADA", {
      deployId,
      versao: current.versao,
      ambiente: current.ambiente,
      motivo: permissao.motivo,
    });
    return Response.json({ ok: true, motivo: permissao.motivo });
  }

  if (action === "HEALTH_CHECK") {
    const resultado = body.resultado;
    if (!resultado || typeof resultado !== "object")
      return Response.json(
        {
          error:
            "Envie o resultado do health check reportado pela hospedagem (verificacoes e/ou taxaErro).",
        },
        { status: 400 },
      );
    const avaliacao = avaliarHealthCheck(resultado);
    if (avaliacao.gravidade === "DESCONHECIDA")
      return Response.json(
        { error: "Nenhuma verificação reportada no resultado enviado." },
        { status: 400 },
      );
    const registrado = {
      resultado,
      avaliacao,
      registradoEm: new Date().toISOString(),
    };
    await db
      .prepare(
        `UPDATE publicacao_etapas
         SET status = ?, concluido_em = CURRENT_TIMESTAMP, duracao_ms = ${DURACAO_SQL},
             resultado = ?, logs = ?
         WHERE deploy_id = ? AND etapa = 'HEALTH_CHECK'`,
      )
      .bind(
        avaliacao.saudavel ? "SUCESSO" : "FALHA",
        avaliacao.motivo.slice(0, 2000),
        clean(body.logs, 20000),
        deployId,
      )
      .run();
    const etapas = await stagesOf(db, deployId);
    const automatico = deveReverterAutomaticamente({ etapas, healthCheck: resultado });
    await db
      .prepare(
        `UPDATE publicacoes_deploy
         SET health_check = ?, rollback_automatico = ?,
             status = CASE WHEN ? = 1 THEN 'FALHOU' ELSE status END,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        JSON.stringify(registrado),
        automatico ? 1 : 0,
        automatico ? 1 : 0,
        deployId,
      )
      .run();
    await audit(db, access.user.id, "PUBLICACAO_HEALTH_CHECK", {
      deployId,
      gravidade: avaliacao.gravidade,
      saudavel: avaliacao.saudavel,
      exigeRollback: automatico,
    });
    return Response.json({ ok: true, avaliacao, exigeRollback: automatico });
  }

  if (action === "ROLLBACK") {
    const motivo = clean(body.motivo, 1000);
    if (motivo.length < 5)
      return Response.json(
        { error: "Descreva o motivo da reversão." },
        { status: 400 },
      );
    if (current.status === "REVERTIDO")
      return Response.json(
        { error: "Esta publicação já foi revertida." },
        { status: 409 },
      );
    const alvo = await db
      .prepare(
        `SELECT versao, commit_sha, branch FROM publicacoes_deploy
         WHERE ambiente = ? AND status = 'PUBLICADO' AND id <> ?
         ORDER BY concluido_em DESC, id DESC LIMIT 1`,
      )
      .bind(current.ambiente, deployId)
      .first<{ versao: string; commit_sha: string; branch: string }>();
    const versaoAlvo = clean(body.versaoAlvo, 40) || alvo?.versao || current.versao;
    const automatico = body.automatico === true;
    const reversao = await db
      .prepare(
        `INSERT INTO publicacoes_deploy
         (versao, commit_sha, branch, autor, mensagem, ambiente, status, etapa_atual,
          aprovacao_status, aprovado_por, aprovado_em, aprovacao_motivo,
          rollback_de_id, rollback_motivo, rollback_automatico, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', 'COMMIT', 'APROVADO', ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
      )
      .bind(
        versaoAlvo,
        clean(body.commitAlvo, 60) || alvo?.commit_sha || "",
        alvo?.branch || current.branch,
        clean(body.autor, 120) || current.autor,
        `Reversão da versão ${current.versao}`.slice(0, 500),
        current.ambiente,
        access.user.id,
        motivo,
        deployId,
        motivo,
        automatico ? 1 : 0,
        access.user.id,
      )
      .run();
    const reversaoId = Number(reversao.meta.last_row_id);
    await criarEtapas(db, reversaoId);
    await db
      .prepare(
        `UPDATE publicacoes_deploy
         SET status = 'REVERTIDO', rollback_motivo = ?, rollback_automatico = ?,
             concluido_em = COALESCE(concluido_em, CURRENT_TIMESTAMP),
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(motivo, automatico ? 1 : Number(current.rollback_automatico) || 0, deployId)
      .run();
    await audit(db, access.user.id, "PUBLICACAO_REVERTIDA", {
      deployId,
      reversaoId,
      versaoRevertida: current.versao,
      versaoAlvo,
      automatico,
      motivo,
    });
    return Response.json({ ok: true, id: reversaoId, versaoAlvo }, { status: 201 });
  }

  // CANCEL
  if (["PUBLICADO", "REVERTIDO", "CANCELADO"].includes(current.status))
    return Response.json(
      { error: "Esta publicação já está encerrada." },
      { status: 409 },
    );
  const motivo = clean(body.motivo, 1000);
  await db
    .prepare(
      `UPDATE publicacoes_deploy
       SET status = 'CANCELADO', observacoes = ?, concluido_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(motivo || current.observacoes, deployId)
    .run();
  await db
    .prepare(
      `UPDATE publicacao_etapas SET status = 'PULADA'
       WHERE deploy_id = ? AND status IN ('PENDENTE', 'EM_ANDAMENTO')`,
    )
    .bind(deployId)
    .run();
  await audit(db, access.user.id, "PUBLICACAO_CANCELADA", {
    deployId,
    versao: current.versao,
    motivo,
  });
  return Response.json({ ok: true });
}
