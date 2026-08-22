import { getD1 } from "../../../../db";
import { hasPermission, requireApiPermission } from "../../../lib/access";
import { loadTeamsWithMembers } from "../../../lib/diaconia-teams";
import { createSystemNotification } from "../../../lib/system-notifications";

export async function GET() {
  const access = await requireApiPermission("DIACONIA_VER");
  if (access.error) return access.error;
  const result = await loadTeamsWithMembers(getD1());
  if (hasPermission(access.user!, "DIACONIA_GERENCIAR")) {
    return Response.json({ equipes: result.teams, usuarios: result.users });
  }
  const assignedTeamId = Number(access.user!.diaconia_equipe_id) || 0;
  return Response.json({
    equipes: result.teams.filter((team) => Number(team.id) === assignedTeamId),
    usuarios: result.users.filter(
      (member) => Number(member.diaconia_equipe_id) === assignedTeamId,
    ),
  });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as {
    nome?: string;
    cor?: string;
    responsavelUsuarioId?: number | string;
    usuarioIds?: (number | string)[];
  };
  const nome = String(payload.nome || "").trim();
  const cor = validColor(payload.cor) ? String(payload.cor) : "#17877f";
  const db = getD1();
  const members = await selectedUsers(
    db,
    payload.usuarioIds,
    payload.responsavelUsuarioId,
  );
  const responsible = members.find(
    (item) => item.id === Number(payload.responsavelUsuarioId),
  );
  if (!nome || !responsible)
    return Response.json(
      { error: "Nome e responsável cadastrado são obrigatórios." },
      { status: 400 },
    );
  try {
    const result = await db
      .prepare(
        "INSERT INTO diaconia_equipes (nome, cor, responsavel, integrantes, criado_por) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        nome,
        cor,
        responsible.nome,
        JSON.stringify(
          members.map((item) => ({
            id: item.id,
            nome: item.nome,
            funcao: item.id === responsible.id ? "Responsável" : "Integrante",
          })),
        ),
        access.user!.email,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await assignUsers(
      db,
      id,
      members.map((item) => item.id),
    );
    await Promise.all(
      members.map((member) =>
        createSystemNotification(db, {
          tipo: "IMPORTANTE",
          titulo: "Você foi incluído em uma diaconia",
          mensagem: `Você agora faz parte da equipe ${nome}. Consulte a área de Diaconia para acompanhar suas escalas.`,
          area: "DIACONIA",
          entidadeId: id,
          usuarioId: member.id,
          criadoPor: access.user!.email,
        }),
      ),
    );
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Já existe uma equipe com este nome." },
      { status: 409 },
    );
  }
}

function validColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}
async function selectedUsers(
  db: D1Database,
  ids?: (number | string)[],
  responsibleId?: number | string,
) {
  const selected = [
    ...new Set(
      [...(ids || []).map(Number), Number(responsibleId || 0)].filter(Boolean),
    ),
  ];
  if (!selected.length) return [];
  return (
    await db
      .prepare(
        `SELECT id, nome FROM usuarios WHERE ativo = 1 AND id IN (${selected.map(() => "?").join(",")}) ORDER BY nome`,
      )
      .bind(...selected)
      .all<{ id: number; nome: string }>()
  ).results;
}
async function assignUsers(db: D1Database, teamId: number, ids: number[]) {
  if (!ids.length) return;
  await db
    .prepare(
      `UPDATE usuarios SET diaconia_equipe_id = ? WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(teamId, ...ids)
    .run();
}
