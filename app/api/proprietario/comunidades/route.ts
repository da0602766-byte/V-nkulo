// Gestão administrativa das comunidades.
//
// Complementa (não substitui) o que /api/proprietario já faz: lá ficam a
// aprovação de criação, os módulos e o par ativar/suspender. Aqui entram o
// modo de manutenção com prazo, o arquivamento, os limites, o bloqueio
// administrativo e a redefinição do Dono da Comunidade.
//
// Isolamento: nenhuma consulta lê conteúdo produzido dentro das comunidades.
// O consumo é contagem, e a transferência de propriedade só aceita alguém já
// vinculado àquela comunidade — nunca um usuário de fora.
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  LIMITES_COMUNIDADE,
  ROTULOS_STATUS_COMUNIDADE,
  STATUS_COMUNIDADE,
  situacaoLimite,
  validarLimites,
} from "../../../lib/global-controls.mjs";

type Db = ReturnType<typeof getD1>;

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function owner() {
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

async function audit(
  db: Db,
  userId: number,
  evento: string,
  comunidadeId: number | null,
  metadados: Record<string, unknown>,
  resultado = "SUCESSO",
) {
  await db
    .prepare(
      `INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(comunidadeId, userId, evento, resultado, JSON.stringify(metadados))
    .run();
}

function parseJson(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Consulta que depende de tabela criada em migração recente. */
async function opcional<T>(promise: Promise<T>, padrao: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return padrao;
  }
}

type CommunityRow = {
  id: number;
  nome: string;
  slug: string;
  status: string;
  limites_json: string;
  manutencao_motivo: string;
  manutencao_ate: string | null;
  proprietario_usuario_id: number | null;
  proprietario_nome: string | null;
  criado_em: string;
  membros: number;
  membros_ativos_30d: number;
  publicacoes: number;
  eventos: number;
};

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();

  const [comunidades, assinaturas, incidentes] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.nome, c.slug, c.status, c.limites_json,
                c.manutencao_motivo, c.manutencao_ate,
                c.proprietario_usuario_id, u.nome AS proprietario_nome, c.criado_em,
                (SELECT COUNT(*) FROM usuario_comunidades uc
                  WHERE uc.comunidade_id = c.id AND uc.status = 'ATIVO') AS membros,
                (SELECT COUNT(DISTINCT uc.usuario_id) FROM usuario_comunidades uc
                  WHERE uc.comunidade_id = c.id AND uc.status = 'ATIVO'
                    AND EXISTS (SELECT 1 FROM sessoes s
                      WHERE s.usuario_id = uc.usuario_id
                        AND date(s.criado_em) >= date('now', '-30 days'))) AS membros_ativos_30d,
                (SELECT COUNT(*) FROM publicacoes_piloto p
                  WHERE p.comunidade_id = c.id) AS publicacoes,
                (SELECT COUNT(*) FROM eventos_comunidade e
                  WHERE e.comunidade_id = c.id) AS eventos
         FROM comunidades c
         LEFT JOIN usuarios u ON u.id = c.proprietario_usuario_id
         ORDER BY c.nome LIMIT 200`,
      )
      .all<CommunityRow>(),
    opcional(
      db
        .prepare(
          `SELECT a.comunidade_id, a.status, a.renova_em, a.teste_ate,
                  p.id AS plano_id, p.nome AS plano_nome,
                  p.limite_membros, p.limite_armazenamento_mb
           FROM assinaturas_comunidade a
           JOIN planos_plataforma p ON p.id = a.plano_id
           WHERE a.status <> 'CANCELADA'`,
        )
        .all<Record<string, unknown>>(),
      { results: [] as Record<string, unknown>[] },
    ),
    opcional(
      db
        .prepare(
          `SELECT o.comunidade_id,
                  COUNT(DISTINCT i.id) AS incidentes,
                  COALESCE(SUM(CASE WHEN i.gravidade = 'CRITICA' THEN 1 ELSE 0 END), 0) AS criticos,
                  MAX(i.ultima_ocorrencia) AS ultima
           FROM incidente_ocorrencias o
           JOIN incidentes_plataforma i ON i.id = o.incidente_id
           WHERE o.comunidade_id IS NOT NULL
             AND i.status NOT IN ('RESOLVIDO', 'IGNORADO')
           GROUP BY o.comunidade_id`,
        )
        .all<Record<string, unknown>>(),
      { results: [] as Record<string, unknown>[] },
    ),
  ]);

  const porComunidadeAssinatura = new Map(
    (assinaturas.results || []).map((linha) => [Number(linha.comunidade_id), linha]),
  );
  const porComunidadeIncidente = new Map(
    (incidentes.results || []).map((linha) => [Number(linha.comunidade_id), linha]),
  );

  const lista = (comunidades.results || []).map((linha) => {
    const assinatura = porComunidadeAssinatura.get(linha.id) || null;
    const limites = parseJson(linha.limites_json);
    // O plano define o teto padrão; o limite salvo na comunidade sobrepõe.
    const tetoMembros =
      Number(limites.membros ?? assinatura?.limite_membros ?? 0) || 0;
    const tetoArmazenamento =
      Number(limites.armazenamento_mb ?? assinatura?.limite_armazenamento_mb ?? 0) || 0;
    const emManutencao =
      linha.status === "MANUTENCAO" ||
      Boolean(linha.manutencao_ate && linha.manutencao_ate > new Date().toISOString());
    return {
      id: linha.id,
      nome: linha.nome,
      slug: linha.slug,
      status: linha.status,
      statusRotulo:
        (ROTULOS_STATUS_COMUNIDADE as Record<string, string>)[linha.status] || linha.status,
      criadoEm: linha.criado_em,
      dono: {
        id: linha.proprietario_usuario_id || 0,
        nome: linha.proprietario_nome || "Sem dono definido",
      },
      manutencao: {
        ativa: emManutencao,
        motivo: linha.manutencao_motivo || "",
        ate: linha.manutencao_ate,
      },
      assinatura: assinatura
        ? {
            planoId: Number(assinatura.plano_id),
            plano: String(assinatura.plano_nome),
            status: String(assinatura.status),
            renovaEm: assinatura.renova_em ? String(assinatura.renova_em) : null,
            testeAte: assinatura.teste_ate ? String(assinatura.teste_ate) : null,
          }
        : null,
      limites,
      consumo: {
        membros: situacaoLimite(linha.membros, tetoMembros),
        publicacoes: situacaoLimite(linha.publicacoes, Number(limites.publicacoes || 0)),
        eventos: situacaoLimite(linha.eventos, Number(limites.eventos || 0)),
        armazenamentoMb: situacaoLimite(0, tetoArmazenamento),
      },
      atividade: { membros: linha.membros, ativos30d: linha.membros_ativos_30d },
      // Só contagem e data: nada do conteúdo do incidente sai por aqui.
      problemas: porComunidadeIncidente.get(linha.id)
        ? {
            incidentes: Number(porComunidadeIncidente.get(linha.id)?.incidentes || 0),
            criticos: Number(porComunidadeIncidente.get(linha.id)?.criticos || 0),
            ultima: String(porComunidadeIncidente.get(linha.id)?.ultima || ""),
          }
        : { incidentes: 0, criticos: 0, ultima: "" },
    };
  });

  return Response.json(
    {
      comunidades: lista,
      limitesDisponiveis: LIMITES_COMUNIDADE,
      statusDisponiveis: STATUS_COMUNIDADE,
      rotulosStatus: ROTULOS_STATUS_COMUNIDADE,
      // O armazenamento por comunidade depende de medição do provedor, que não
      // chega a este ambiente: o teto é configurável, mas o consumo fica em
      // zero em vez de receber um número estimado.
      semMedicao: ["armazenamento_mb"],
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const ACOES = [
  "SET_MAINTENANCE",
  "CLEAR_MAINTENANCE",
  "ARCHIVE",
  "SET_LIMITS",
  "TRANSFER_OWNER",
  "BLOCK",
  "UNBLOCK",
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

  const action = clean(body.action, 30).toUpperCase();
  if (!(ACOES as readonly string[]).includes(action)) {
    return Response.json({ error: "Ação não reconhecida." }, { status: 400 });
  }

  const comunidadeId = id(body.comunidadeId);
  if (!comunidadeId) {
    return Response.json({ error: "Selecione a comunidade." }, { status: 400 });
  }

  const db = getD1();
  const community = await db
    .prepare(
      `SELECT id, nome, status, proprietario_usuario_id, limites_json
       FROM comunidades WHERE id = ? LIMIT 1`,
    )
    .bind(comunidadeId)
    .first<{
      id: number;
      nome: string;
      status: string;
      proprietario_usuario_id: number | null;
      limites_json: string;
    }>();
  if (!community) {
    return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
  }

  const motivo = clean(body.motivo, 500);
  const base = { comunidade: community.nome, statusAnterior: community.status };

  if (action === "SET_MAINTENANCE") {
    // Manutenção é interrupção de serviço para os membros: sem justificativa
    // registrada, ninguém depois sabe por que a comunidade ficou fora.
    if (motivo.length < 10) {
      return Response.json(
        { error: "Descreva o motivo da manutenção com pelo menos 10 caracteres." },
        { status: 400 },
      );
    }
    const horas = Math.min(720, Math.max(1, Math.trunc(Number(body.horas) || 0) || 4));
    const ate = new Date(Date.now() + horas * 3600_000).toISOString();
    await db
      .prepare(
        `UPDATE comunidades
         SET status = 'MANUTENCAO', manutencao_motivo = ?, manutencao_ate = ?
         WHERE id = ?`,
      )
      .bind(motivo, ate, comunidadeId)
      .run();
    await audit(db, access.user.id, "COMUNIDADE_MANUTENCAO_ATIVADA", comunidadeId, {
      ...base,
      motivo,
      ate,
      horas,
    });
    return Response.json({ ok: true, status: "MANUTENCAO", ate });
  }

  if (action === "CLEAR_MAINTENANCE") {
    await db
      .prepare(
        `UPDATE comunidades
         SET status = CASE WHEN status = 'MANUTENCAO' THEN 'ATIVA' ELSE status END,
             manutencao_motivo = '', manutencao_ate = NULL
         WHERE id = ?`,
      )
      .bind(comunidadeId)
      .run();
    await audit(db, access.user.id, "COMUNIDADE_MANUTENCAO_ENCERRADA", comunidadeId, {
      ...base,
      motivo,
    });
    return Response.json({ ok: true });
  }

  if (action === "ARCHIVE") {
    if (motivo.length < 10) {
      return Response.json(
        { error: "Descreva o motivo do arquivamento com pelo menos 10 caracteres." },
        { status: 400 },
      );
    }
    await db
      .prepare("UPDATE comunidades SET status = 'ARQUIVADA' WHERE id = ?")
      .bind(comunidadeId)
      .run();
    await audit(db, access.user.id, "COMUNIDADE_ARQUIVADA", comunidadeId, {
      ...base,
      motivo,
    });
    return Response.json({ ok: true, status: "ARQUIVADA" });
  }

  if (action === "BLOCK" || action === "UNBLOCK") {
    const bloquear = action === "BLOCK";
    if (bloquear && motivo.length < 10) {
      return Response.json(
        { error: "Descreva o motivo do bloqueio com pelo menos 10 caracteres." },
        { status: 400 },
      );
    }
    if (bloquear && community.status === "ARQUIVADA") {
      return Response.json(
        { error: "Comunidade arquivada não precisa de bloqueio administrativo." },
        { status: 409 },
      );
    }
    await db
      .prepare("UPDATE comunidades SET status = ? WHERE id = ?")
      .bind(bloquear ? "SUSPENSA" : "ATIVA", comunidadeId)
      .run();
    await audit(
      db,
      access.user.id,
      bloquear ? "COMUNIDADE_BLOQUEADA" : "COMUNIDADE_DESBLOQUEADA",
      comunidadeId,
      { ...base, motivo },
    );
    return Response.json({ ok: true, status: bloquear ? "SUSPENSA" : "ATIVA" });
  }

  if (action === "SET_LIMITS") {
    const resultado = validarLimites(body.limites);
    if (!resultado.valido) {
      return Response.json({ error: resultado.erro }, { status: 400 });
    }
    await db
      .prepare("UPDATE comunidades SET limites_json = ? WHERE id = ?")
      .bind(JSON.stringify(resultado.limites), comunidadeId)
      .run();
    await audit(db, access.user.id, "COMUNIDADE_LIMITES_DEFINIDOS", comunidadeId, {
      ...base,
      limitesAnteriores: parseJson(community.limites_json),
      limites: resultado.limites,
      motivo,
    });
    return Response.json({ ok: true, limites: resultado.limites });
  }

  // TRANSFER_OWNER
  const novoDonoId = id(body.novoDonoId);
  if (!novoDonoId) {
    return Response.json({ error: "Selecione o novo dono." }, { status: 400 });
  }
  if (motivo.length < 10) {
    return Response.json(
      { error: "Descreva o motivo da transferência com pelo menos 10 caracteres." },
      { status: 400 },
    );
  }
  if (novoDonoId === community.proprietario_usuario_id) {
    return Response.json(
      { error: "Esta pessoa já é a dona desta comunidade." },
      { status: 409 },
    );
  }
  // O novo dono precisa estar ativo E já vinculado a esta comunidade: sem essa
  // checagem a transferência viraria uma porta de entrada para alguém de fora,
  // furando o isolamento entre comunidades.
  const candidato = await db
    .prepare(
      `SELECT u.id, u.nome, u.email
       FROM usuarios u
       JOIN usuario_comunidades uc
         ON uc.usuario_id = u.id AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
       WHERE u.id = ? AND u.ativo = 1 LIMIT 1`,
    )
    .bind(comunidadeId, novoDonoId)
    .first<{ id: number; nome: string; email: string }>();
  if (!candidato) {
    await audit(
      db,
      access.user.id,
      "COMUNIDADE_DONO_REDEFINIDO",
      comunidadeId,
      { ...base, novoDonoId, motivo, recusa: "sem vínculo ativo na comunidade" },
      "NEGADO",
    );
    return Response.json(
      {
        error:
          "O novo dono precisa ser uma conta ativa e já vinculada a esta comunidade.",
      },
      { status: 409 },
    );
  }

  const donoAnterior = await db
    .prepare("SELECT id, nome FROM usuarios WHERE id = ? LIMIT 1")
    .bind(community.proprietario_usuario_id || 0)
    .first<{ id: number; nome: string }>();

  await db
    .prepare("UPDATE comunidades SET proprietario_usuario_id = ? WHERE id = ?")
    .bind(novoDonoId, comunidadeId)
    .run();
  // O novo dono passa a ADMIN_COMUNIDADE no vínculo que já existia.
  await db
    .prepare(
      `UPDATE usuario_comunidades SET papel = 'ADMIN_COMUNIDADE'
       WHERE usuario_id = ? AND comunidade_id = ?`,
    )
    .bind(novoDonoId, comunidadeId)
    .run();

  await audit(db, access.user.id, "COMUNIDADE_DONO_REDEFINIDO", comunidadeId, {
    ...base,
    motivo,
    donoAnterior: donoAnterior
      ? { id: donoAnterior.id, nome: donoAnterior.nome }
      : null,
    donoNovo: { id: candidato.id, nome: candidato.nome },
  });

  return Response.json({
    ok: true,
    dono: { id: candidato.id, nome: candidato.nome },
  });
}
