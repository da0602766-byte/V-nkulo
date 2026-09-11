import { hasPermission, permissionList, type AppUser } from "./access";

export type CultCustomField = {
  id: string;
  label: string;
  type: "numero" | "texto" | "data" | "sim_nao";
};

export type CultRoutineRow = Record<string, unknown> & {
  id: number;
  data_culto: string;
  registrador_usuario_id: number | null;
  campos_extras: string;
  status: string;
};

export type CultEntryRow = Record<string, unknown> & {
  id: number;
  rotina_id: number;
  pessoas_culto: number;
  extras: string;
};

export function canViewAllCultRoutines(user: AppUser) {
  return (
    hasPermission(user, "CULTOS_GERENCIAR") ||
    permissionList(user).includes("CULTOS_VER")
  );
}

export function canWriteCultRoutine(user: AppUser, routine: CultRoutineRow) {
  return (
    hasPermission(user, "CULTOS_GERENCIAR") ||
    (hasPermission(user, "CULTOS_REGISTRAR") &&
      Number(routine.registrador_usuario_id) === user.id)
  );
}

export function normalizeCustomFields(value: unknown): CultCustomField[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  return value
    .slice(0, 20)
    .map((item, index) => {
      const raw = item as Partial<CultCustomField>;
      const label = String(raw.label || "")
        .trim()
        .slice(0, 80);
      let id = String(raw.id || slugify(label) || `campo_${index + 1}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 60);
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      const supportedTypes: CultCustomField["type"][] = [
        "numero",
        "texto",
        "data",
        "sim_nao",
      ];
      return {
        id,
        label,
        type: supportedTypes.includes(raw.type as CultCustomField["type"])
          ? (raw.type as CultCustomField["type"])
          : "texto",
      };
    })
    .filter((item) => item.label);
}

export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function countValue(value: unknown) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(number, 1_000_000));
}

export function normalizeCultExtras(value: unknown, fields: CultCustomField[]) {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.type === "numero"
        ? countValue(input[field.id])
        : field.type === "sim_nao"
          ? ["Sim", "Não"].includes(String(input[field.id] || ""))
            ? String(input[field.id])
            : ""
          : String(input[field.id] || "")
              .trim()
              .slice(0, 500),
    ]),
  );
}

export function enrichCultRoutines(
  routines: CultRoutineRow[],
  entries: CultEntryRow[],
  user: AppUser,
) {
  return routines.map((routine) => ({
    ...routine,
    campos_extras: safeJson<CultCustomField[]>(routine.campos_extras, []),
    pode_registrar: canWriteCultRoutine(user, routine),
    lancamentos: entries
      .filter((entry) => Number(entry.rotina_id) === Number(routine.id))
      .map((entry) => ({
        ...entry,
        extras: safeJson<Record<string, string | number>>(entry.extras, {}),
      })),
  }));
}

export function buildCultCharts(
  routines: CultRoutineRow[],
  entries: CultEntryRow[],
) {
  const [currentYear, currentMonth, currentDay] = saoPauloDateKey(new Date())
    .split("-")
    .map(Number);
  const today = new Date(currentYear, currentMonth - 1, currentDay, 12);
  const todayKey = localDateKey(today);
  const routineById = new Map(
    routines.map((routine) => [Number(routine.id), routine]),
  );
  const points = entries
    .map((entry) => {
      const routine = routineById.get(Number(entry.rotina_id));
      return routine
        ? {
            date: String(routine.data_culto),
            value: Number(entry.pessoas_culto) || 0,
            label: String(routine.horario || routine.titulo || "Culto"),
          }
        : null;
    })
    .filter(Boolean) as { date: string; value: number; label: string }[];

  const dayPoints = points.filter((point) => point.date === todayKey);
  const day = dayPoints.length
    ? {
        labels: dayPoints.map(
          (point, index) => point.label || `Registro ${index + 1}`,
        ),
        values: dayPoints.map((point) => point.value),
      }
    : { labels: ["Hoje"], values: [0] };

  const weekLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: localDateKey(date),
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
        .format(date)
        .replace(".", ""),
    };
  });

  const monthLabels = [1, 2, 3, 4, 5].map((week) => ({
    key: week,
    label: `S${week}`,
  }));
  const yearLabels = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), index, 1);
    return {
      key: index,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(date)
        .replace(".", ""),
    };
  });

  return {
    dia: day,
    semana: {
      labels: weekLabels.map((item) => item.label),
      values: weekLabels.map((item) =>
        sum(points, (point) => point.date === item.key),
      ),
    },
    mes: {
      labels: monthLabels.map((item) => item.label),
      values: monthLabels.map((item) =>
        sum(points, (point) => {
          const date = parseDate(point.date);
          return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            Math.min(5, Math.floor((date.getDate() - 1) / 7) + 1) === item.key
          );
        }),
      ),
    },
    ano: {
      labels: yearLabels.map((item) => item.label),
      values: yearLabels.map((item) =>
        sum(points, (point) => {
          const date = parseDate(point.date);
          return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === item.key
          );
        }),
      ),
    },
  };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saoPauloDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), day || 1);
}

function sum(
  points: { date: string; value: number }[],
  predicate: (point: { date: string; value: number }) => boolean,
) {
  return points.reduce(
    (total, point) => total + (predicate(point) ? point.value : 0),
    0,
  );
}
