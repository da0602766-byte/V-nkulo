import { getD1 } from "../../db";
import { hasPermission, type AppUser } from "./access";
import { buildDiaconiaRanking } from "./diaconia-ranking";
import { ensureTodayBirthdayNotices } from "./birthdays";
import { enrichNotices } from "./notice-interactions";
import { loadTeamsWithMembers } from "./diaconia-teams";
import { ACTIVE_NOW_SQL, type DisplayMessage } from "./display-control";

export type Visitor = {
  id: number;
  nome_completo: string;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  batizado: string;
  status: string;
  celula: string | null;
  celula_id: number | null;
  acompanhante: string | null;
  data_entrada: string;
  endereco: string | null;
  encontro_com_deus: number;
  curso_membros: number;
  ministerio: string | null;
  observacoes: string | null;
};

type CountRow = { total: number };
type BucketRow = { bucket: string; total: number };
type CellRow = {
  id: number;
  nome: string;
  responsavel: string;
  membros: string;
  observacoes: string | null;
};
type ConfigRow = { chave: string; valor: string };
type FollowupRow = {
  id: number;
  visitante_id: number;
  visitante_nome: string;
  tipo: string;
  resultado: string;
  descricao: string | null;
  proximo_contato: string | null;
  criado_em: string;
};

async function count(sql: string): Promise<number> {
  const row = await getD1().prepare(sql).first<CountRow>();
  return Number(row?.total ?? 0);
}

function dayLabels() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatter.format(date).replace(".", ""),
    };
  });
}

function monthLabels() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(new Date().getFullYear(), index, 1);
    return {
      key: String(index + 1).padStart(2, "0"),
      label: formatter.format(date).replace(".", ""),
    };
  });
}

export async function getDashboardData(user: AppUser) {
  const db = getD1();
  await ensureTodayBirthdayNotices();
  const isAdmin = user.perfil === "ADMIN";
  const can = (permission: string) => hasPermission(user, permission);
  const visitorAccess = can("VISITANTES_VER");
  const metricsAccess = visitorAccess || can("VISAO_GERAL_VER");
  const managesDiaconia = can("DIACONIA_GERENCIAR");
  const assignedTeamId = Number(user.diaconia_equipe_id) || 0;
  const [
    monthTotal,
    activeTotal,
    pendingTotal,
    integratedTotal,
    visitorsResult,
    userResult,
    noticeResult,
    worshipResult,
    deaconryResult,
    deaconryTeamData,
    moduleResult,
    moduleRecordResult,
    cellResult,
    configResult,
    followupResult,
    teenResult,
    teenFollowupResult,
    displayMessageResult,
    blockResult,
  ] = await Promise.all([
    metricsAccess
      ? count(
          "SELECT COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND data_entrada >= date('now', 'start of month')",
        )
      : 0,
    metricsAccess
      ? count(
          "SELECT COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND status = 'EM_ACOMPANHAMENTO'",
        )
      : 0,
    metricsAccess
      ? count(
          "SELECT COUNT(*) AS total FROM acompanhamentos WHERE proximo_contato IS NOT NULL AND proximo_contato <= date('now')",
        )
      : 0,
    metricsAccess
      ? count(
          "SELECT COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND status = 'INTEGRADO'",
        )
      : 0,
    visitorAccess
      ? db
          .prepare(
            "SELECT id, nome_completo, data_nascimento, telefone, email, batizado, status, endereco, acompanhante, celula, celula_id, encontro_com_deus, curso_membros, ministerio, data_entrada, observacoes FROM visitantes WHERE ativo = 1 ORDER BY criado_em DESC LIMIT 100",
          )
          .all<Visitor>()
      : Promise.resolve({ results: [] as Visitor[] }),
    isAdmin
      ? db
          .prepare(
            `SELECT u.id, u.nome, u.email, u.perfil, u.permissoes, u.foto_perfil, u.telefone,
        u.data_nascimento, u.endereco, u.celula, u.ministerio, u.observacoes, u.nome_pais,
        u.diaconia_equipe_id, d.nome AS diaconia_equipe_nome, u.tema_preferido,
        EXISTS(SELECT 1 FROM culto_rotinas c WHERE c.registrador_usuario_id = u.id AND c.status = 'ABERTA') AS culto_registrador,
        u.titulo_eclesiastico, u.ativo, u.criado_em,
        CASE WHEN datetime(u.criado_em) >= datetime('now', '-30 days') THEN 1 ELSE 0 END AS novo_cadastro,
        CASE WHEN u.senha_hash IS NOT NULL THEN 1 ELSE 0 END AS tem_senha,
        EXISTS(SELECT 1 FROM redefinicoes_senha r WHERE r.usuario_id = u.id AND r.usado = 0 AND r.token_hash IS NULL) AS redefinicao_pendente
        FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id ORDER BY u.nome`,
          )
          .all<AppUser>()
      : Promise.resolve({ results: [] as AppUser[] }),
    db
      .prepare(
        "SELECT * FROM avisos WHERE publicado = 1 ORDER BY CASE prioridade WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END, publicado_em DESC LIMIT 30",
      )
      .all(),
    can("LOUVOR_VER")
      ? db
          .prepare(
            "SELECT * FROM louvor_escalas ORDER BY data_culto DESC LIMIT 30",
          )
          .all()
      : Promise.resolve({ results: [] }),
    can("DIACONIA_VER")
      ? managesDiaconia
        ? db
            .prepare(
              `SELECT d.*, e.nome AS equipe_nome, e.cor AS equipe_cor
        FROM diaconias d LEFT JOIN diaconia_equipes e ON e.id = d.equipe_id
        ORDER BY d.data_servico DESC LIMIT 100`,
            )
            .all()
        : assignedTeamId
          ? db
              .prepare(
                `SELECT d.*, e.nome AS equipe_nome, e.cor AS equipe_cor
          FROM diaconias d LEFT JOIN diaconia_equipes e ON e.id = d.equipe_id
          WHERE d.equipe_id = ? ORDER BY d.data_servico DESC LIMIT 100`,
              )
              .bind(assignedTeamId)
              .all()
          : Promise.resolve({ results: [] })
      : Promise.resolve({ results: [] }),
    can("DIACONIA_VER")
      ? loadTeamsWithMembers(db)
      : Promise.resolve({ teams: [] as Record<string, unknown>[], users: [] }),
    can("MODULOS_PERSONALIZADOS_VER") || can("MODULOS_GERENCIAR")
      ? db
          .prepare(
            "SELECT * FROM ministerio_modulos WHERE ativo = 1 OR ? = 1 ORDER BY ordem, nome",
          )
          .bind(isAdmin ? 1 : 0)
          .all()
      : Promise.resolve({ results: [] }),
    can("MODULOS_PERSONALIZADOS_VER")
      ? db
          .prepare(
            "SELECT * FROM ministerio_registros ORDER BY criado_em DESC LIMIT 100",
          )
          .all()
      : Promise.resolve({ results: [] }),
    can("CELULAS_VER")
      ? db.prepare("SELECT * FROM celulas ORDER BY nome").all<CellRow>()
      : Promise.resolve({ results: [] as CellRow[] }),
    db
      .prepare(
        "SELECT chave, valor FROM configuracoes WHERE chave IN ('tema', 'abas', 'site', 'login', 'diaconia_ranking', 'manutencao', 'ordem_menu', 'textos', 'layout_abas', 'abas_ocultas', 'hierarquias')",
      )
      .all<ConfigRow>(),
    visitorAccess
      ? db
          .prepare(
            "SELECT a.*, v.nome_completo AS visitante_nome FROM acompanhamentos a JOIN visitantes v ON v.id = a.visitante_id WHERE v.ativo = 1 ORDER BY a.criado_em DESC LIMIT 100",
          )
          .all<FollowupRow>()
      : Promise.resolve({ results: [] as FollowupRow[] }),
    can("TEENS_VER")
      ? db
          .prepare(
            `SELECT u.id, u.nome, u.data_nascimento, u.nome_pais, u.telefone,
      CAST((julianday('now') - julianday(u.data_nascimento)) / 365.2425 AS INTEGER) AS idade,
      d.nome AS diaconia_equipe_nome FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id
      WHERE u.ativo = 1 AND u.data_nascimento IS NOT NULL AND date(u.data_nascimento, '+17 years') > date('now') ORDER BY u.nome`,
          )
          .all()
      : Promise.resolve({ results: [] }),
    can("TEENS_VER")
      ? db
          .prepare(
            `SELECT t.*, u.nome AS usuario_nome FROM teens_acompanhamentos t
      JOIN usuarios u ON u.id = t.usuario_id ORDER BY t.criado_em DESC LIMIT 200`,
          )
          .all()
      : Promise.resolve({ results: [] }),
    isAdmin
      ? db
          .prepare(
            `SELECT *, ${ACTIVE_NOW_SQL} AS ativo_agora
             FROM mensagens_exibicao
             ORDER BY ativo_agora DESC,
                      CASE tipo WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,
                      atualizado_em DESC`,
          )
          .all<DisplayMessage>()
      : db
          .prepare(
            `SELECT *, 1 AS ativo_agora FROM mensagens_exibicao
             WHERE ativo = 1
               AND (inicia_em IS NULL OR datetime(inicia_em) <= CURRENT_TIMESTAMP)
               AND (termina_em IS NULL OR datetime(termina_em) > CURRENT_TIMESTAMP)
             ORDER BY CASE tipo WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,
                      atualizado_em DESC`,
          )
          .all<DisplayMessage>(),
    db
      .prepare(
        "SELECT * FROM blocos_texto WHERE ativo = 1 ORDER BY area, posicao, ordem, id",
      )
      .all(),
  ]);

  const weekRows = metricsAccess
    ? await db
        .prepare(
          "SELECT date(data_entrada) AS bucket, COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND data_entrada >= date('now', '-6 days') GROUP BY date(data_entrada)",
        )
        .all<BucketRow>()
    : { results: [] as BucketRow[] };
  const monthRows = metricsAccess
    ? await db
        .prepare(
          "SELECT CAST(((CAST(strftime('%d', data_entrada) AS INTEGER) - 1) / 7) AS INTEGER) + 1 AS bucket, COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND strftime('%Y-%m', data_entrada) = strftime('%Y-%m', 'now') GROUP BY bucket",
        )
        .all<BucketRow>()
    : { results: [] as BucketRow[] };
  const yearRows = metricsAccess
    ? await db
        .prepare(
          "SELECT strftime('%m', data_entrada) AS bucket, COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND strftime('%Y', data_entrada) = strftime('%Y', 'now') GROUP BY bucket",
        )
        .all<BucketRow>()
    : { results: [] as BucketRow[] };

  const week = dayLabels();
  const months = monthLabels();
  const rankingSetting = configResult.results.find(
    (item: Record<string, unknown>) =>
      String(item.chave) === "diaconia_ranking",
  ) as { valor?: string } | undefined;
  let rankingPublicado = false;
  try {
    rankingPublicado = Boolean(
      rankingSetting?.valor && JSON.parse(rankingSetting.valor).publicado,
    );
  } catch {
    rankingPublicado = false;
  }
  const canSeeRanking =
    can("DIACONIA_RANKING_PUBLICAR") ||
    (rankingPublicado && can("DIACONIA_RANKING_VER"));
  const visibleTeamData = managesDiaconia
    ? deaconryTeamData
    : {
        teams: deaconryTeamData.teams.filter(
          (team: Record<string, unknown>) => Number(team.id) === assignedTeamId,
        ),
        users: deaconryTeamData.users.filter(
          (member: { diaconia_equipe_id: number | null }) =>
            Number(member.diaconia_equipe_id) === assignedTeamId,
        ),
      };
  const visibleDeaconry = can("DIACONIA_CHECKLIST_GERENCIAR")
    ? deaconryResult.results
    : deaconryResult.results.map((service: Record<string, unknown>) => ({
        ...service,
        checklist: "[]",
        cumprida: 0,
        tarefas: hideTaskResults(service.tarefas),
      }));
  const mapValues = (
    labels: { key: string; label: string }[],
    rows: BucketRow[],
  ) => ({
    labels: labels.map((item) => item.label),
    values: labels.map((item) =>
      Number(rows.find((row) => String(row.bucket) === item.key)?.total ?? 0),
    ),
  });

  return {
    metrics: { monthTotal, activeTotal, pendingTotal, integratedTotal },
    charts: {
      semana: mapValues(week, weekRows.results),
      mes: mapValues(
        [1, 2, 3, 4, 5].map((number) => ({
          key: String(number),
          label: `S${number}`,
        })),
        monthRows.results,
      ),
      ano: mapValues(months, yearRows.results),
    },
    visitors: visitorsResult.results,
    users: userResult.results,
    celulas: cellResult.results,
    configuracoes: configResult.results,
    acompanhamentos: followupResult.results,
    teens: teenResult.results,
    teensAcompanhamentos: teenFollowupResult.results,
    mensagensExibicao: displayMessageResult.results,
    portal: {
      avisos: await enrichNotices(
        db,
        noticeResult.results as Record<string, unknown>[],
        user,
      ),
      louvor: worshipResult.results,
      diaconias: visibleDeaconry,
      equipesDiaconia: visibleTeamData.teams,
      usuariosDiaconia: visibleTeamData.users,
      rankingDiaconia: canSeeRanking
        ? buildDiaconiaRanking(deaconryResult.results)
        : { equipes: [], pessoas: [] },
      rankingPublicado: canSeeRanking ? rankingPublicado : false,
      modulos: moduleResult.results,
      registros: moduleRecordResult.results,
      blocosTexto: blockResult.results,
    },
  };
}

function hideTaskResults(value: unknown) {
  try {
    const tasks = typeof value === "string" ? JSON.parse(value) : [];
    return JSON.stringify(
      Array.isArray(tasks)
        ? tasks.map((task) => ({
            ...task,
            status: "PENDENTE",
            motivoAusencia: "",
            substitutoUsuarioId: null,
            substitutoNome: "",
          }))
        : [],
    );
  } catch {
    return "[]";
  }
}
