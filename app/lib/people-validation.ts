import { normalizeOfficialPermissions } from "./tenant-policy.mjs";

const OFFICIAL_TITLES = [
  "LÍDER",
  "DIÁCONO",
  "DIACONISA",
  "PRESBÍTERO",
  "PRESBÍTERA",
  "EVANGELISTA",
  "MISSIONÁRIO",
  "MISSIONÁRIA",
  "PASTOR",
  "PASTORA",
  "SECRETÁRIO",
  "SECRETÁRIA",
] as const;

export function parseOfficialUpdate(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "Dados da função inválidos." } as const;
  }
  const payload = value as Record<string, unknown>;
  const membershipId = Number(payload.membershipId);
  const oficial = Boolean(payload.oficial);
  const papel = String(payload.papel || "MEMBRO").toUpperCase();
  const titulo = String(payload.titulo || "")
    .trim()
    .toUpperCase()
    .slice(0, 40);
  if (!Number.isSafeInteger(membershipId) || membershipId <= 0) {
    return { error: "Pessoa inválida." } as const;
  }
  if (!["MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"].includes(papel)) {
    return { error: "Função inválida." } as const;
  }
  if (oficial && !OFFICIAL_TITLES.includes(titulo as never)) {
    return { error: "Selecione um título oficial válido." } as const;
  }
  return {
    data: {
      membershipId,
      oficial,
      papel: oficial ? papel : "MEMBRO",
      titulo: oficial ? titulo : "",
      permissions: oficial
        ? normalizeOfficialPermissions(payload.permissions)
        : [],
    },
  } as const;
}

export function parseSelfProfileUpdate(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "Dados do perfil inválidos." } as const;
  }
  const payload = value as Record<string, unknown>;
  const telefone = clean(payload.telefone, 30);
  const dataNascimento = clean(payload.dataNascimento, 10);
  const endereco = clean(payload.endereco, 180);
  const celula = clean(payload.celula, 100);
  const ministerio = clean(payload.ministerio, 100);
  if (dataNascimento && !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
    return { error: "Data de nascimento inválida." } as const;
  }
  return {
    data: { telefone, dataNascimento, endereco, celula, ministerio },
  } as const;
}

function clean(value: unknown, limit: number) {
  return String(value || "")
    .trim()
    .slice(0, limit);
}
