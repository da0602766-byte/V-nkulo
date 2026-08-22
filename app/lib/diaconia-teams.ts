export type BasicDiaconiaUser = {
  id: number;
  nome: string;
  diaconia_equipe_id: number | null;
};

export async function loadDiaconiaUsers(db: D1Database) {
  return db
    .prepare(
      "SELECT id, nome, diaconia_equipe_id FROM usuarios WHERE ativo = 1 ORDER BY nome",
    )
    .all<BasicDiaconiaUser>();
}

export async function loadTeamsWithMembers(db: D1Database) {
  const [teamResult, userResult] = await Promise.all([
    db
      .prepare("SELECT * FROM diaconia_equipes WHERE ativo = 1 ORDER BY nome")
      .all<Record<string, unknown>>(),
    loadDiaconiaUsers(db),
  ]);
  const teams: Record<string, unknown>[] = teamResult.results.map((team) => {
    const members = userResult.results.filter(
      (user) => user.diaconia_equipe_id === Number(team.id),
    );
    const responsible = members.find(
      (user) => user.nome === String(team.responsavel),
    );
    return {
      ...team,
      responsavel_usuario_id: responsible?.id ?? null,
      integrantes: JSON.stringify(
        members.map((user) => ({
          id: user.id,
          nome: user.nome,
          funcao: responsible?.id === user.id ? "Responsável" : "Integrante",
        })),
      ),
    } as Record<string, unknown>;
  });
  return {
    teams,
    users: userResult.results,
  };
}
