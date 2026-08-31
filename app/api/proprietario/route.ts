import { getD1 } from "../../../db";
import { getRuntimeEnv } from "../../../db/runtime-env";
import { deleteDriveFile, getDriveAccessToken, readStorageReference } from "../../lib/google-integration";
import { DEFAULT_COMMUNITY_THEME } from "../../lib/community-theme";
import { getSessionUser, isSystemOwnerAccount } from "../../lib/local-auth";
import { createSystemNotification } from "../../lib/system-notifications";
import {
  AUDIT_RETENTION_DAYS,
  OWNER_AUDIT_VISIBLE_LIMIT,
  purgeExpiredAudit,
} from "../../lib/tenant-audit";
import {
  COMMUNITY_MODULES,
  normalizeCommunityModules,
} from "../../lib/community-modules";

const OWNER_METRIC_KEYS = [
  "comunidades_ativas",
  "usuarios_ativos",
  "ministerios_ativos",
  "solicitacoes_pendentes",
  "eventos_futuros",
  "conversas_mes",
] as const;

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

async function requireOwner() {
  const user = await getSessionUser();
  if (!user) {
    return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) } as const;
  }
  if (!user.ativo || !user.system_owner) {
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

export async function GET() {
  const access = await requireOwner();
  if ("error" in access) return access.error;
  const db = getD1();
  await purgeExpiredAudit(db);
  const [metrics, requests, communities, users, audit, feedback, ownerLayout] = await Promise.all([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM comunidades WHERE status = 'ATIVA') AS comunidades_ativas,
          (SELECT COUNT(*) FROM usuarios WHERE ativo = 1) AS usuarios_ativos,
          (SELECT COUNT(*) FROM ministerios_comunidade WHERE status = 'ATIVO') AS ministerios_ativos,
          (SELECT COUNT(*) FROM solicitacoes_criacao_comunidade
            WHERE status IN ('PENDENTE', 'EM_ANALISE')) AS solicitacoes_pendentes,
          (SELECT COUNT(*) FROM feedback_plataforma
            WHERE status = 'PENDENTE') AS feedback_pendentes,
          (SELECT COUNT(*) FROM eventos_comunidade
            WHERE status = 'PUBLICADO' AND datetime(inicia_em) >= datetime('now')) AS eventos_futuros,
          (SELECT COUNT(*) FROM conversas_privadas
            WHERE ciclo_mes = strftime('%Y-%m','now')) AS conversas_mes`,
      )
      .first<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT s.id, s.solicitante_id, s.nome, s.descricao, s.cidade,
          s.email_institucional, s.ficha_criacao, s.status,
          s.observacao_proprietario, s.comunidade_id, s.criado_em,
          s.atualizado_em, u.nome AS solicitante_nome, u.email AS solicitante_email
         FROM solicitacoes_criacao_comunidade s
         JOIN usuarios u ON u.id = s.solicitante_id
         ORDER BY CASE s.status WHEN 'PENDENTE' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END,
           s.criado_em DESC, s.id DESC
         LIMIT 200`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT c.id, c.nome, c.slug, c.descricao_publica, c.cidade_publica,
          c.status, c.criado_em,
          c.proprietario_usuario_id, u.nome AS proprietario_nome,
          (SELECT cfg.valor FROM configuracoes cfg
            WHERE cfg.chave = 'community_theme:' || c.id LIMIT 1) AS tema,
          (SELECT COUNT(*) FROM usuario_comunidades uc
            WHERE uc.comunidade_id = c.id AND uc.status = 'ATIVO') AS membros,
          (SELECT COUNT(*) FROM ministerios_comunidade m
            WHERE m.comunidade_id = c.id AND m.status = 'ATIVO') AS ministerios
         FROM comunidades c
         LEFT JOIN usuarios u ON u.id = c.proprietario_usuario_id
         ORDER BY c.nome LIMIT 300`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT u.id, u.nome, u.email, u.telefone, u.foto_perfil, u.perfil,
          u.titulo_eclesiastico, u.ativo, u.criado_em,
          (SELECT COUNT(*) FROM usuario_comunidades uc
            WHERE uc.usuario_id = u.id AND uc.status = 'ATIVO') AS comunidades,
          COALESCE((SELECT GROUP_CONCAT(c.nome, ' • ')
            FROM usuario_comunidades uc
            JOIN comunidades c ON c.id = uc.comunidade_id
            WHERE uc.usuario_id = u.id AND uc.status = 'ATIVO'), '') AS comunidades_nomes
         FROM usuarios u ORDER BY u.nome LIMIT 300`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT a.id, a.comunidade_id, a.usuario_id, a.evento, a.resultado,
          a.metadados, a.criado_em, u.nome AS usuario_nome, c.nome AS comunidade_nome
         FROM auditoria_piloto a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN comunidades c ON c.id = a.comunidade_id
         ORDER BY a.id DESC LIMIT ${OWNER_AUDIT_VISIBLE_LIMIT}`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT f.id, f.usuario_id, f.comunidade_id, f.tipo, f.categoria,
          f.mensagem, f.pagina, f.entidade_tipo, f.entidade_id,
          f.imagem_chave, f.imagem_nome, f.status, f.resposta_proprietario,
          f.respondido_por, f.respondido_em, f.arquivado_em,
          f.criado_em, f.atualizado_em,
          u.nome AS usuario_nome, u.email AS usuario_email,
          c.nome AS comunidade_nome, r.nome AS respondido_por_nome
         FROM feedback_plataforma f
         JOIN usuarios u ON u.id = f.usuario_id
         LEFT JOIN comunidades c ON c.id = f.comunidade_id
         LEFT JOIN usuarios r ON r.id = f.respondido_por
         ORDER BY CASE f.status
           WHEN 'PENDENTE' THEN 0 WHEN 'EM_ANALISE' THEN 1
           WHEN 'RESPONDIDO' THEN 2 ELSE 3 END,
           f.criado_em DESC, f.id DESC
         LIMIT 500`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare("SELECT valor FROM configuracoes WHERE chave = 'owner_dashboard_layout' LIMIT 1")
      .first<{ valor: string }>(),
  ]);
  return Response.json(
    {
      owner: { id: access.user.id, nome: access.user.nome, email: access.user.email },
      metrics: metrics || {},
      requests: requests.results,
      communities: communities.results,
      users: users.results,
      audit: audit.results,
      feedback: feedback.results,
      auditRetention: {
        days: AUDIT_RETENTION_DAYS,
        visibleLimit: OWNER_AUDIT_VISIBLE_LIMIT,
      },
      ownerLayout: parseOwnerLayout(ownerLayout?.valor),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireOwner();
  if ("error" in access) return access.error;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  const action = String(payload.action || "").toUpperCase();
  const db = getD1();

  if (["FEEDBACK_EM_ANALISE", "FEEDBACK_RESPONDER", "FEEDBACK_ARQUIVAR", "FEEDBACK_REABRIR", "FEEDBACK_EXCLUIR"].includes(action)) {
    const feedbackId = Number(payload.feedbackId || 0);
    if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
      return Response.json({ error: "Mensagem inválida." }, { status: 400 });
    }
    const item = await db.prepare(
      `SELECT id, usuario_id, comunidade_id, tipo, categoria, mensagem,
        imagem_chave, status
       FROM feedback_plataforma WHERE id = ? LIMIT 1`,
    ).bind(feedbackId).first<{
      id: number;
      usuario_id: number;
      comunidade_id: number | null;
      tipo: string;
      categoria: string;
      mensagem: string;
      imagem_chave: string;
      status: string;
    }>();
    if (!item) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });

    if (action === "FEEDBACK_EXCLUIR") {
      if (item.imagem_chave) {
        const reference = await readStorageReference(item.imagem_chave);
        if (reference?.scope === "feedback" && reference.ownerId === item.usuario_id) {
          const accessToken = await getDriveAccessToken(reference.ownerId).catch(() => "");
          if (accessToken) await deleteDriveFile(accessToken, reference.fileId);
        } else {
          const bucket = getRuntimeEnv().BUCKET;
          if (bucket) await bucket.delete(item.imagem_chave);
        }
      }
      await db.batch([
        db.prepare("DELETE FROM feedback_plataforma WHERE id = ?").bind(feedbackId),
        db.prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (?, ?, 'FEEDBACK_PLATAFORMA_EXCLUIDO', 'SUCESSO', ?)`,
        ).bind(item.comunidade_id, access.user.id, JSON.stringify({ feedbackId, tipo: item.tipo, categoria: item.categoria })),
      ]);
      return Response.json({ ok: true, deleted: true });
    }

    if (action === "FEEDBACK_RESPONDER") {
      const resposta = clean(payload.resposta, 2000);
      if (resposta.length < 2) return Response.json({ error: "Escreva uma resposta." }, { status: 400 });
      await db.batch([
        db.prepare(
          `UPDATE feedback_plataforma
           SET status = 'RESPONDIDO', resposta_proprietario = ?, respondido_por = ?,
             respondido_em = CURRENT_TIMESTAMP, arquivado_em = NULL,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(resposta, access.user.id, feedbackId),
        db.prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (?, ?, 'FEEDBACK_PLATAFORMA_RESPONDIDO', 'SUCESSO', ?)`,
        ).bind(item.comunidade_id, access.user.id, JSON.stringify({ feedbackId, tipo: item.tipo })),
      ]);
      await createSystemNotification(db, {
        tipo: "NOVO",
        titulo: "Resposta do Proprietário",
        mensagem: resposta,
        area: "MENU",
        entidadeId: feedbackId,
        usuarioId: item.usuario_id,
        comunidadeId: item.comunidade_id,
        remetenteUsuarioId: access.user.id,
        destinoRota: "/painel",
        criadoPor: access.user.email,
      });
      return Response.json({ ok: true, status: "RESPONDIDO" });
    }

    const status = action === "FEEDBACK_EM_ANALISE" ? "EM_ANALISE" : action === "FEEDBACK_ARQUIVAR" ? "ARQUIVADO" : "PENDENTE";
    await db.batch([
      db.prepare(
        `UPDATE feedback_plataforma
         SET status = ?, arquivado_em = CASE WHEN ? = 'ARQUIVADO' THEN CURRENT_TIMESTAMP ELSE NULL END,
           atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(status, status, feedbackId),
      db.prepare(
        `INSERT INTO auditoria_piloto
         (comunidade_id, usuario_id, evento, resultado, metadados)
         VALUES (?, ?, ?, 'SUCESSO', ?)`,
      ).bind(item.comunidade_id, access.user.id, `FEEDBACK_PLATAFORMA_${status}`, JSON.stringify({ feedbackId, status })),
    ]);
    return Response.json({ ok: true, status });
  }

  if (action === "ATUALIZAR_LAYOUT_PROPRIETARIO") {
    const gridPreset = String(payload.gridPreset || "");
    if (!["2x2", "2x4", "4x2", "4x4"].includes(gridPreset)) {
      return Response.json({ error: "Organização de cartões inválida." }, { status: 400 });
    }
    const requestedOrder = Array.isArray(payload.metricOrder)
      ? payload.metricOrder.map(String)
      : [];
    const metricOrder = normalizeMetricOrder(requestedOrder);
    await db.batch([
      db
        .prepare(
          `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
           VALUES ('owner_dashboard_layout', ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
             atualizado_por = excluded.atualizado_por,
             atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(JSON.stringify({ gridPreset, metricOrder }), access.user.email),
      db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (NULL, ?, 'LAYOUT_PROPRIETARIO_ATUALIZADO', 'SUCESSO', ?)`,
        )
        .bind(access.user.id, JSON.stringify({ gridPreset, metricOrder })),
    ]);
    return Response.json({ ok: true, gridPreset, metricOrder });
  }

  if (action === "ALTERAR_STATUS_COMUNIDADE") {
    const communityId = Number(payload.communityId || 0);
    const requestedStatus = String(payload.status || "").toUpperCase();
    if (!Number.isInteger(communityId) || communityId <= 0) {
      return Response.json({ error: "Comunidade inválida." }, { status: 400 });
    }
    if (!["ATIVA", "SUSPENSA"].includes(requestedStatus)) {
      return Response.json({ error: "Status solicitado inválido." }, { status: 400 });
    }
    const community = await db
      .prepare("SELECT id, nome, status FROM comunidades WHERE id = ? LIMIT 1")
      .bind(communityId)
      .first<{ id: number; nome: string; status: string }>();
    if (!community) {
      return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    }
    const currentStatus = String(community.status || "").toUpperCase();
    const canActivate = requestedStatus === "ATIVA" && ["ARQUIVADA", "SUSPENSA"].includes(currentStatus);
    const canSuspend = requestedStatus === "SUSPENSA" && currentStatus === "ATIVA";
    if (!canActivate && !canSuspend) {
      return Response.json(
        {
          error:
            currentStatus === requestedStatus
              ? `A comunidade já está ${requestedStatus.toLowerCase()}.`
              : "Este status exige o fluxo protegido de continuidade e não pode ser alterado por este atalho.",
        },
        { status: 409 },
      );
    }
    const event = requestedStatus === "ATIVA"
      ? "COMUNIDADE_RESTAURADA_PELO_PROPRIETARIO"
      : "COMUNIDADE_SUSPENSA_PELO_PROPRIETARIO";
    await db.batch([
      db
        .prepare("UPDATE comunidades SET status = ? WHERE id = ? AND status = ?")
        .bind(requestedStatus, communityId, currentStatus),
      db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (?, ?, ?, 'SUCESSO', ?)`,
        )
        .bind(
          communityId,
          access.user.id,
          event,
          JSON.stringify({ de: currentStatus, para: requestedStatus }),
        ),
    ]);
    return Response.json({ ok: true, status: requestedStatus });
  }

  if (action === "ALTERAR_STATUS_USUARIO") {
    const userId = Number(payload.userId || 0);
    const active = payload.ativo === true;
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "Pessoa inválida." }, { status: 400 });
    }
    const target = await findOwnerUser(db, userId);
    if (!target) {
      return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    }
    if (
      target.id === access.user.id ||
      isSystemOwnerAccount({ email: target.email, criado_em: target.criado_em })
    ) {
      return Response.json(
        { error: "A conta proprietária do sistema não pode ser desativada." },
        { status: 409 },
      );
    }
    if (Boolean(target.ativo) === active) {
      return Response.json({ ok: true, ativo: active });
    }
    const statements = [
      db
        .prepare(
          "UPDATE usuarios SET ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(active ? 1 : 0, userId),
      db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (NULL, ?, ?, 'SUCESSO', ?)`,
        )
        .bind(
          access.user.id,
          active ? "CONTA_REATIVADA_PELO_PROPRIETARIO" : "CONTA_DESATIVADA_PELO_PROPRIETARIO",
          JSON.stringify({ usuarioId: userId, nome: target.nome }),
        ),
    ];
    if (!active) {
      statements.splice(
        1,
        0,
        db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(userId),
      );
    }
    await db.batch(statements);
    return Response.json({ ok: true, ativo: active });
  }

  if (action === "EXCLUIR_USUARIO_DEFINITIVO") {
    const userId = Number(payload.userId || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "Pessoa inválida." }, { status: 400 });
    }
    const target = await findOwnerUser(db, userId);
    if (!target) {
      return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    }
    if (
      target.id === access.user.id ||
      isSystemOwnerAccount({ email: target.email, criado_em: target.criado_em })
    ) {
      return Response.json(
        { error: "A conta proprietária do sistema não pode ser excluída." },
        { status: 409 },
      );
    }
    const dependencies = await findUserDependencies(db, userId);
    if (dependencies.length) {
      await db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (NULL, ?, 'EXCLUSAO_DEFINITIVA_DE_CONTA_BLOQUEADA', 'NEGADO', ?)`,
        )
        .bind(
          access.user.id,
          JSON.stringify({
            usuarioId: userId,
            dependencias: dependencies.slice(0, 12),
          }),
        )
        .run();
      return Response.json(
        {
          error:
            "Esta conta possui vínculos ou históricos funcionais. Desative-a para preservar os dados.",
          dependencies,
        },
        { status: 409 },
      );
    }
    try {
      await db.batch([
        db.prepare("DELETE FROM notificacoes_lidas WHERE usuario_id = ?").bind(userId),
        db
          .prepare(
            "DELETE FROM notificacoes_sistema WHERE usuario_id = ? OR remetente_usuario_id = ?",
          )
          .bind(userId, userId),
        db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(userId),
        db.prepare("DELETE FROM redefinicoes_senha WHERE usuario_id = ?").bind(userId),
        db
          .prepare(
            `INSERT INTO auditoria_piloto
             (comunidade_id, usuario_id, evento, resultado, metadados)
             VALUES (NULL, ?, 'CONTA_DE_TESTE_EXCLUIDA_DEFINITIVAMENTE', 'SUCESSO', ?)`,
          )
          .bind(
            access.user.id,
            JSON.stringify({ usuarioId: userId, motivo: "conta_sem_vinculos_funcionais" }),
          ),
        db.prepare("DELETE FROM usuarios WHERE id = ?").bind(userId),
      ]);
    } catch {
      return Response.json(
        {
          error:
            "A exclusão foi bloqueada por um vínculo protegido não removível. Use a desativação.",
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, deleted: true });
  }

  const requestId = Number(payload.requestId || 0);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  if (!["ANALISAR", "APROVAR", "RECUSAR"].includes(action)) {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  const current = await db
    .prepare(
      `SELECT id, solicitante_id, nome, descricao, cidade, email_institucional,
        ficha_criacao, status
       FROM solicitacoes_criacao_comunidade WHERE id = ? LIMIT 1`,
    )
    .bind(requestId)
    .first<{
      id: number;
      solicitante_id: number;
      nome: string;
      descricao: string;
      cidade: string;
      email_institucional: string;
      ficha_criacao: string;
      status: string;
    }>();
  if (!current) {
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }
  if (!["PENDENTE", "EM_ANALISE"].includes(current.status)) {
    return Response.json(
      { error: "Esta solicitação já recebeu uma decisão final." },
      { status: 409 },
    );
  }
  const note = clean(payload.note, 800);
  const currentSheet = safeJson(current.ficha_criacao) as Record<string, unknown>;
  const modules = normalizeCommunityModules(
    Array.isArray(payload.modules) ? payload.modules : currentSheet.modules,
    COMMUNITY_MODULES.map((module) => module.key),
  );
  if (action !== "RECUSAR" && !modules.length) {
    return Response.json(
      { error: "Mantenha ao menos uma aba operacional na comunidade." },
      { status: 400 },
    );
  }
  const updatedSheet = JSON.stringify({ ...currentSheet, modules });
  if (action === "ANALISAR") {
    await db
      .prepare(
        `UPDATE solicitacoes_criacao_comunidade
         SET status = 'EM_ANALISE', observacao_proprietario = ?, ficha_criacao = ?,
           analisado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'PENDENTE'`,
      )
      .bind(note, updatedSheet, access.user.id, requestId)
      .run();
    return Response.json({ ok: true, status: "EM_ANALISE" });
  }
  if (action === "RECUSAR") {
    if (note.length < 5) {
      return Response.json(
        { error: "Informe o motivo da recusa." },
        { status: 400 },
      );
    }
    await db.batch([
      db
        .prepare(
          `UPDATE solicitacoes_criacao_comunidade
           SET status = 'RECUSADA', observacao_proprietario = ?, ficha_criacao = ?,
             analisado_por = ?, analisado_em = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN ('PENDENTE', 'EM_ANALISE')`,
        )
        .bind(note, updatedSheet, access.user.id, requestId),
      db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (NULL, ?, 'SOLICITACAO_CRIACAO_COMUNIDADE_RECUSADA', 'SUCESSO', ?)`,
        )
        .bind(
          access.user.id,
          JSON.stringify({ solicitacaoId: requestId, motivo: note, modules }),
        ),
    ]);
    await createSystemNotification(db, {
      tipo: "IMPORTANTE",
      titulo: "Solicitação de comunidade recusada",
      mensagem: `${current.nome}: ${note}`,
      area: "SOLICITACOES",
      entidadeId: requestId,
      usuarioId: current.solicitante_id,
      remetenteUsuarioId: access.user.id,
      destinoRota: "/comunidades",
      criadoPor: access.user.email,
    });
    return Response.json({ ok: true, status: "RECUSADA" });
  }

  const nome = clean(payload.nome || current.nome, 120);
  const descricao = clean(payload.descricao || current.descricao, 600);
  const cidade = clean(payload.cidade || current.cidade, 120);
  if (nome.length < 3 || descricao.length < 20 || cidade.length < 2) {
    return Response.json(
      { error: "Revise nome, cidade e descrição antes de aprovar." },
      { status: 400 },
    );
  }
  const baseSlug = slugify(nome) || "comunidade";
  let slug = baseSlug;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const exists = await db
      .prepare("SELECT 1 AS found FROM comunidades WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first<{ found: number }>();
    if (!exists) break;
    slug = `${baseSlug.slice(0, 66)}-${suffix}`;
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO comunidades
         (nome, slug, proprietario_usuario_id, descricao_publica,
          cidade_publica, status, ambiente_demo, feed_publico_habilitado,
          selo_pastoral_status, ficha_criacao)
         VALUES (?, ?, ?, ?, ?, 'ATIVA', 0, 0, 'NAO_APLICAVEL', ?)`,
      )
      .bind(
        nome,
        slug,
        current.solicitante_id,
        descricao,
        cidade,
        JSON.stringify({
          emailInstitucional: current.email_institucional,
          respostas: currentSheet.respostas || {},
          modules,
          aprovadoPeloProprietario: true,
        }),
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO usuario_comunidades
         (usuario_id, comunidade_id, papel, status)
         SELECT ?, id, 'ADMIN_COMUNIDADE', 'ATIVO'
         FROM comunidades WHERE slug = ?`,
      )
      .bind(current.solicitante_id, slug),
    db
      .prepare(
        `INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
         SELECT 'community_theme:' || id, ?, ?, CURRENT_TIMESTAMP
         FROM comunidades WHERE slug = ?`,
      )
      .bind(JSON.stringify(DEFAULT_COMMUNITY_THEME), String(access.user.id), slug),
    db
      .prepare(
        `INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
         SELECT 'community_modules:' || id, ?, ?, CURRENT_TIMESTAMP
         FROM comunidades WHERE slug = ?`,
      )
      .bind(JSON.stringify(modules), String(access.user.id), slug),
    db
      .prepare(
        `INSERT OR IGNORE INTO solicitacao_repositorios
         (comunidade_id, tipo, nome, status)
         SELECT id, 'ORACAO', 'Repositório de orações', 'SUGERIDO'
         FROM comunidades WHERE slug = ?`,
      )
      .bind(slug),
    db
      .prepare(
        `INSERT OR IGNORE INTO solicitacao_repositorios
         (comunidade_id, tipo, nome, status)
         SELECT id, 'VISITA', 'Repositório de visitas', 'SUGERIDO'
         FROM comunidades WHERE slug = ?`,
      )
      .bind(slug),
    db
      .prepare(
        `UPDATE solicitacoes_criacao_comunidade
         SET nome = ?, descricao = ?, cidade = ?, ficha_criacao = ?, status = 'APROVADA',
           observacao_proprietario = ?, analisado_por = ?,
           analisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP,
           comunidade_id = (SELECT id FROM comunidades WHERE slug = ?)
         WHERE id = ? AND status IN ('PENDENTE', 'EM_ANALISE')`,
      )
      .bind(
        nome,
        descricao,
        cidade,
        updatedSheet,
        note,
        access.user.id,
        slug,
        requestId,
      ),
    db
      .prepare(
        `INSERT INTO auditoria_piloto
         (comunidade_id, usuario_id, evento, resultado, metadados)
         SELECT id, ?, 'COMUNIDADE_CRIADA_PELO_PROPRIETARIO', 'SUCESSO', ?
         FROM comunidades WHERE slug = ?`,
      )
      .bind(
        access.user.id,
        JSON.stringify({
          solicitacaoId: requestId,
          solicitanteId: current.solicitante_id,
          modules,
        }),
        slug,
      ),
  ]);
  const community = await db
    .prepare("SELECT id FROM comunidades WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: number }>();
  await createSystemNotification(db, {
    tipo: "NOVO",
    titulo: "Comunidade aprovada",
    mensagem: `${nome} foi aprovada e já pode ser acessada.`,
    area: "SOLICITACOES",
    entidadeId: Number(community?.id || 0),
    usuarioId: current.solicitante_id,
    comunidadeId: Number(community?.id || 0),
    remetenteUsuarioId: access.user.id,
    destinoRota: "/comunidades",
    criadoPor: access.user.email,
  });
  return Response.json({
    ok: true,
    status: "APROVADA",
    communityId: Number(community?.id || 0),
    slug,
  });
}

type OwnerUser = {
  id: number;
  nome: string;
  email: string;
  criado_em: string;
  ativo: number;
};

async function findOwnerUser(db: ReturnType<typeof getD1>, userId: number) {
  return db
    .prepare(
      "SELECT id, nome, email, criado_em, ativo FROM usuarios WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<OwnerUser>();
}

async function findUserDependencies(
  db: ReturnType<typeof getD1>,
  userId: number,
) {
  const ignored = new Set([
    "auditoria_piloto",
    "notificacoes_lidas",
    "notificacoes_sistema",
    "redefinicoes_senha",
    "sessoes",
  ]);
  const tables = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all<{ name: string }>();
  const dependencies: { table: string; column: string; total: number }[] = [];
  for (const entry of tables.results) {
    if (ignored.has(entry.name)) continue;
    const table = entry.name.replaceAll('"', '""');
    const foreignKeys = await db
      .prepare(`PRAGMA foreign_key_list("${table}")`)
      .all<{ table: string; from: string }>();
    for (const foreignKey of foreignKeys.results) {
      if (foreignKey.table !== "usuarios" || !foreignKey.from) continue;
      const column = foreignKey.from.replaceAll('"', '""');
      const count = await db
        .prepare(
          `SELECT COUNT(*) AS total FROM "${table}" WHERE "${column}" = ?`,
        )
        .bind(userId)
        .first<{ total: number }>();
      if (Number(count?.total || 0) > 0) {
        dependencies.push({
          table: entry.name,
          column: foreignKey.from,
          total: Number(count?.total || 0),
        });
      }
    }
  }
  return dependencies;
}

function parseOwnerLayout(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}")) as {
      gridPreset?: string;
      metricOrder?: unknown;
    };
    return {
      gridPreset: ["2x2", "2x4", "4x2", "4x4"].includes(String(parsed.gridPreset))
        ? parsed.gridPreset
        : "2x2",
      metricOrder: normalizeMetricOrder(
        Array.isArray(parsed.metricOrder) ? parsed.metricOrder.map(String) : [],
      ),
    };
  } catch {
    return { gridPreset: "2x2", metricOrder: [...OWNER_METRIC_KEYS] };
  }
}

function normalizeMetricOrder(value: string[]) {
  const allowed = new Set<string>(OWNER_METRIC_KEYS);
  const unique = value.filter(
    (key, index) => allowed.has(key) && value.indexOf(key) === index,
  );
  return [
    ...unique,
    ...OWNER_METRIC_KEYS.filter((key) => !unique.includes(key)),
  ];
}

function safeJson(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
