export type DiaconiaRanking = {
  equipes: { id: number; nome: string; cor: string; pontos: number }[];
  pessoas: { nome: string; equipe: string; cor: string; pontos: number }[];
};

type ServiceRow = {
  equipe_id?: number | null;
  equipe_nome?: string | null;
  equipe_cor?: string | null;
  cumprida?: number | boolean;
  checklist?: string | null;
  tarefas?: string | null;
};

type ChecklistItem = { nome?: string; cumpriu?: boolean };

export function buildDiaconiaRanking(services: unknown[]): DiaconiaRanking {
  const teams = new Map<number, { id: number; nome: string; cor: string; pontos: number }>();
  const people = new Map<string, { nome: string; equipe: string; cor: string; pontos: number }>();

  for (const value of services) {
    const service = value as ServiceRow;
    const teamId = Number(service.equipe_id || 0);
    const teamName = service.equipe_nome || "Equipe não definida";
    const color = service.equipe_cor || "#17877f";
    const tasks = parseTasks(service.tarefas);
    const completedSchedule = tasks.length > 0 && tasks.every((task) => task.status === "FEITA" || task.status === "SUBSTITUTO");
    if (teamId && (completedSchedule || (!tasks.length && service.cumprida))) {
      const current = teams.get(teamId) || { id: teamId, nome: teamName, cor: color, pontos: 0 };
      current.pontos += 1;
      teams.set(teamId, current);
    }

    for (const task of tasks) {
      if (task.status !== "FEITA" && task.status !== "SUBSTITUTO") continue;
      const name = String(task.status === "SUBSTITUTO" ? task.substitutoNome : task.responsavel || "").trim();
      if (!name) continue;
      const key = `${teamId}:${name.toLocaleLowerCase("pt-BR")}`;
      const current = people.get(key) || { nome: name, equipe: teamName, cor: color, pontos: 0 };
      current.pontos += 1;
      people.set(key, current);
    }

    for (const item of tasks.length ? [] : parseChecklist(service.checklist)) {
      const name = String(item.nome || "").trim();
      if (!name || !item.cumpriu) continue;
      const key = `${teamId}:${name.toLocaleLowerCase("pt-BR")}`;
      const current = people.get(key) || { nome: name, equipe: teamName, cor: color, pontos: 0 };
      current.pontos += 1;
      people.set(key, current);
    }
  }

  const byPointsThenName = <T extends { pontos: number; nome: string }>(left: T, right: T) =>
    right.pontos - left.pontos || left.nome.localeCompare(right.nome, "pt-BR");

  return {
    equipes: [...teams.values()].sort(byPointsThenName),
    pessoas: [...people.values()].sort(byPointsThenName),
  };
}

function parseTasks(value?: string | null): { responsavel?: string; status?: string; substitutoNome?: string }[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseChecklist(value?: string | null): ChecklistItem[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
