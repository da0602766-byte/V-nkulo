import { getD1 } from "../../../db";
import { hasPermission, requireApiPermission } from "../../lib/access";
import { buildDiaconiaRanking } from "../../lib/diaconia-ranking";
import { loadTeamsWithMembers } from "../../lib/diaconia-teams";

export async function GET() {
  const access = await requireApiPermission("DIACONIA_VER");
  if (access.error) return access.error;
  const db = getD1();
  const user = access.user!;
  const managesDiaconia = hasPermission(user, "DIACONIA_GERENCIAR");
  const assignedTeamId = Number(user.diaconia_equipe_id) || 0;
  const [services, teamData, setting] = await Promise.all([
    managesDiaconia
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
        : Promise.resolve({ results: [] }),
    loadTeamsWithMembers(db),
    db
      .prepare(
        "SELECT valor FROM configuracoes WHERE chave = 'diaconia_ranking' LIMIT 1",
      )
      .first<{ valor: string }>(),
  ]);
  let rankingPublicado = false;
  try {
    rankingPublicado = Boolean(
      setting?.valor && JSON.parse(setting.valor).publicado,
    );
  } catch {
    rankingPublicado = false;
  }
  const canSeeRanking =
    hasPermission(user, "DIACONIA_RANKING_PUBLICAR") ||
    (rankingPublicado && hasPermission(user, "DIACONIA_RANKING_VER"));
  const canManageChecklist = hasPermission(
    user,
    "DIACONIA_CHECKLIST_GERENCIAR",
  );
  const visibleTeamData = managesDiaconia
    ? teamData
    : {
        teams: teamData.teams.filter(
          (team) => Number(team.id) === assignedTeamId,
        ),
        users: teamData.users.filter(
          (member) => Number(member.diaconia_equipe_id) === assignedTeamId,
        ),
      };
  const visibleServices = canManageChecklist
    ? services.results
    : services.results.map((service: Record<string, unknown>) => ({
        ...service,
        checklist: "[]",
        cumprida: 0,
        tarefas: hideTaskResults(service.tarefas),
      }));
  return Response.json({
    diaconias: visibleServices,
    equipes: visibleTeamData.teams,
    usuarios: visibleTeamData.users,
    ranking: canSeeRanking
      ? buildDiaconiaRanking(services.results)
      : { equipes: [], pessoas: [] },
    rankingPublicado: canSeeRanking ? rankingPublicado : false,
  });
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

export async function POST(request: Request) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as {
    titulo?: string;
    dataServico?: string;
    responsavel?: string;
    integrantes?: unknown[];
    tarefas?: unknown[];
    observacoes?: string;
    status?: string;
    equipeId?: number;
    checklist?: unknown[];
    cumprida?: boolean;
  };
  const titulo = payload.titulo?.trim() ?? "";
  const responsavel = payload.responsavel?.trim() ?? "";
  if (!titulo || !payload.dataServico || !responsavel) {
    return Response.json(
      { error: "Título, data e responsável são obrigatórios." },
      { status: 400 },
    );
  }
  const checklist = Array.isArray(payload.integrantes)
    ? payload.integrantes
        .map((item) => ({
          nome: String((item as { nome?: unknown }).nome || "").trim(),
          cumpriu: false,
        }))
        .filter((item) => item.nome)
    : [];
  const result = await getD1()
    .prepare(
      "INSERT INTO diaconias (titulo, data_servico, responsavel, integrantes, tarefas, equipe_id, checklist, cumprida, observacoes, status, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      titulo,
      payload.dataServico,
      responsavel,
      JSON.stringify(payload.integrantes ?? []),
      JSON.stringify(payload.tarefas ?? []),
      Number(payload.equipeId) || null,
      JSON.stringify(checklist),
      0,
      payload.observacoes || null,
      payload.status || "PLANEJADA",
      access.user!.email,
    )
    .run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
