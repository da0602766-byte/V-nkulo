const MINISTRY_CATEGORIES = new Set([
  "LOUVOR",
  "RECEPCAO",
  "CRIANCAS",
  "MIDIA",
  "ACAO_SOCIAL",
  "INTERCESSAO",
  "DIACONIA",
  "ESTACIONAMENTO",
  "OUTRO",
]);
const MINISTRY_STATUSES = new Set(["ATIVO", "INATIVO"]);
const VOLUNTEER_ROLES = new Set(["VOLUNTARIO", "LIDER"]);
const WEEK_DAYS = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);
const PERIODS = new Set(["MANHA", "TARDE", "NOITE", "FLEXIVEL"]);
const SCHEDULE_STATUSES = new Set(["RASCUNHO", "AGENDADA", "PUBLICADA"]);
const CUSTOM_FIELD_TYPES = new Set([
  "TEXTO",
  "NUMERO",
  "DATA",
  "HORA",
  "SELECAO",
  "CHECKBOX",
  "TEXTO_LONGO",
]);
const SECRETARY_LINK_TYPES = new Set([
  "YOUTUBE",
  "SPOTIFY",
  "CIFRA_CLUB",
  "GOOGLE_DRIVE",
  "PERSONALIZADO",
]);

export type SecretaryLink = {
  id: string;
  tipo:
    | "YOUTUBE"
    | "SPOTIFY"
    | "CIFRA_CLUB"
    | "GOOGLE_DRIVE"
    | "PERSONALIZADO";
  titulo: string;
  url: string;
};

export type SecretaryAssignment = {
  voluntarioId: number;
  funcao: string;
};

export type SecretaryChecklistItem = {
  tarefa: string;
  voluntarioId: number | null;
};

export type MinistryCustomField = {
  id: string;
  label: string;
  type:
    | "TEXTO"
    | "NUMERO"
    | "DATA"
    | "HORA"
    | "SELECAO"
    | "CHECKBOX"
    | "TEXTO_LONGO";
  required: boolean;
  options: string[];
};

type ValidationResult<T extends object> =
  | T
  | { error: string };

type MinistryPayload = {
  nome: string;
  descricao: string;
  categoria: string;
  status: string;
  youtubeUrl: string;
  spotifyUrl: string;
  bannerUrl: string;
  responsavelUsuarioId: number | null;
};

type ScheduleTemplatePayload = {
  ministerioId: number;
  nome: string;
  titulo: string;
  duracaoMinutos: number;
  local: string;
  observacoes: string;
  checklist: string[];
  camposPersonalizados: MinistryCustomField[];
};

type SchedulePayload = {
  ministerioId: number;
  equipeId: number | null;
  titulo: string;
  iniciaEm: string;
  terminaEm: string;
  local: string;
  status: string;
  observacoes: string;
  responsavelUsuarioId: number | null;
  publicarEm: string | null;
  repertorio: string[];
  links: SecretaryLink[];
  designacoes: SecretaryAssignment[];
  checklist: SecretaryChecklistItem[];
  camposRespostas: Record<string, unknown>;
};

export function parseMinistryPayload(
  payload: unknown,
): ValidationResult<MinistryPayload> {
  const body = asRecord(payload);
  const nome = cleanText(body.nome, 120);
  const descricao = cleanText(body.descricao, 1200);
  const categoria =
    cleanText(body.categoria, 40).toUpperCase() || "OUTRO";
  const status = cleanText(body.status, 20).toUpperCase() || "ATIVO";
  const youtubeUrl = parseOptionalMediaUrl(body.youtubeUrl, "YOUTUBE");
  const spotifyUrl = parseOptionalMediaUrl(body.spotifyUrl, "SPOTIFY");
  const bannerUrl = parseMinistryAssetUrl(body.bannerUrl);
  const responsavelUsuarioId = positiveInteger(body.responsavelUsuarioId);
  if (!nome) return { error: "O nome do ministério é obrigatório." } as const;
  if (!MINISTRY_CATEGORIES.has(categoria) || !MINISTRY_STATUSES.has(status)) {
    return { error: "Categoria ou status do ministério inválido." } as const;
  }
  if ("error" in youtubeUrl) return { error: youtubeUrl.error };
  if ("error" in spotifyUrl) return { error: spotifyUrl.error };
  if ("error" in bannerUrl) return { error: bannerUrl.error };
  return {
    nome,
    descricao,
    categoria,
    status,
    youtubeUrl: youtubeUrl.value,
    spotifyUrl: spotifyUrl.value,
    bannerUrl: bannerUrl.value,
    responsavelUsuarioId,
  } as const;
}

export function parseMinistryAssetUrl(
  value: unknown,
): ValidationResult<{ value: string }> {
  const url = cleanText(value, 600);
  if (!url) return { value: "" } as const;
  if (
    !/^\/api\/pilot\/uploads\/images\/ministry-banner\/ministry-\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(
      url,
    )
  ) {
    return {
      error: "Use uma imagem enviada pela área do próprio ministério.",
    } as const;
  }
  return { value: url } as const;
}

export function parseCustomFunctionPayload(
  payload: unknown,
): ValidationResult<{ nome: string; descricao: string }> {
  const body = asRecord(payload);
  const nome = cleanText(body.nome, 100);
  const descricao = cleanText(body.descricao, 300);
  if (!nome) {
    return { error: "O nome da função é obrigatório." } as const;
  }
  return { nome, descricao } as const;
}

export function parseScheduleTemplatePayload(
  payload: unknown,
): ValidationResult<ScheduleTemplatePayload> {
  const body = asRecord(payload);
  const ministerioId = positiveInteger(body.ministerioId);
  const nome = cleanText(body.nome, 100);
  const titulo = cleanText(body.titulo, 140);
  const duracaoMinutos = Number(body.duracaoMinutos);
  const local = cleanText(body.local, 180);
  const observacoes = cleanText(body.observacoes, 1200);
  const checklist = Array.isArray(body.checklist)
    ? [
        ...new Set(
          body.checklist
            .map((item) => cleanText(item, 180))
            .filter(Boolean),
        ),
      ].slice(0, 30)
    : [];
  const customFields = parseCustomFields(body.camposPersonalizados);
  if ("error" in customFields) return { error: customFields.error };
  if (!ministerioId || !nome || !titulo) {
    return {
      error: "Ministério, nome do modelo e título são obrigatórios.",
    } as const;
  }
  if (
    !Number.isInteger(duracaoMinutos) ||
    duracaoMinutos < 15 ||
    duracaoMinutos > 1440
  ) {
    return {
      error: "A duração deve ficar entre 15 e 1.440 minutos.",
    } as const;
  }
  return {
    ministerioId,
    nome,
    titulo,
    duracaoMinutos,
    local,
    observacoes,
    checklist,
    camposPersonalizados: customFields.value,
  } as const;
}

export function parseMinistryChecklistUpdate(
  payload: unknown,
): ValidationResult<{ itemId: number; status: string; observacao: string }> {
  const body = asRecord(payload);
  const itemId = positiveInteger(body.itemId);
  const status = cleanText(body.status, 30).toUpperCase();
  const observacao = cleanText(body.observacao, 600);
  if (
    !itemId ||
    !new Set(["PENDENTE", "FEITO", "NAO_FEITO"]).has(status)
  ) {
    return { error: "Item ou status do checklist inválido." } as const;
  }
  return { itemId, status, observacao } as const;
}

export function parseVolunteerPayload(payload: unknown): ValidationResult<{
  usuarioId: number;
  funcao: string;
  papel: string;
  periodoPreferido: string;
  diasDisponiveis: string[];
}> {
  const body = asRecord(payload);
  const usuarioId = positiveInteger(body.usuarioId);
  const funcao = cleanText(body.funcao, 100);
  const papel =
    cleanText(body.papel, 20).toUpperCase() || "VOLUNTARIO";
  const periodoPreferido =
    cleanText(body.periodoPreferido, 20).toUpperCase() || "FLEXIVEL";
  const diasDisponiveis = Array.isArray(body.diasDisponiveis)
    ? [
        ...new Set(
          body.diasDisponiveis
            .map((item) => cleanText(item, 3).toUpperCase())
            .filter((item) => WEEK_DAYS.has(item)),
        ),
      ]
    : [];
  if (!usuarioId || !funcao) {
    return { error: "Pessoa e função são obrigatórias." } as const;
  }
  if (!VOLUNTEER_ROLES.has(papel) || !PERIODS.has(periodoPreferido)) {
    return { error: "Papel ou disponibilidade inválida." } as const;
  }
  return {
    usuarioId,
    funcao,
    papel,
    periodoPreferido,
    diasDisponiveis,
  } as const;
}

export function parseAvailabilityPayload(payload: unknown): ValidationResult<{
  diasDisponiveis: string[];
  periodoPreferido: string;
}> {
  const parsed = parseVolunteerPayload({
    ...asRecord(payload),
    usuarioId: 1,
    funcao: "Disponibilidade pessoal",
    papel: "VOLUNTARIO",
  });
  if ("error" in parsed) return parsed;
  return {
    diasDisponiveis: parsed.diasDisponiveis,
    periodoPreferido: parsed.periodoPreferido,
  } as const;
}

export function parseSchedulePayload(
  payload: unknown,
): ValidationResult<SchedulePayload> {
  const body = asRecord(payload);
  const ministerioId = positiveInteger(body.ministerioId);
  const equipeId = positiveInteger(body.equipeId);
  const titulo = cleanText(body.titulo, 140);
  const iniciaEm = normalizeDateTime(body.iniciaEm);
  const terminaEm = normalizeDateTime(body.terminaEm);
  const local = cleanText(body.local, 180);
  const status =
    cleanText(body.status, 20).toUpperCase() || "RASCUNHO";
  const publicarEm = normalizeDateTime(body.publicarEm);
  const observacoes = cleanText(body.observacoes, 1200);
  const responsavelUsuarioId = positiveInteger(body.responsavelUsuarioId);
  const repertorio = Array.isArray(body.repertorio)
    ? [
        ...new Set(
          body.repertorio
            .map((item) => cleanText(item, 180))
            .filter(Boolean),
        ),
      ].slice(0, 80)
    : [];
  const links = parseSecretaryLinks(body.links);
  if ("error" in links) return { error: links.error };
  const designacoes = parseSecretaryAssignments(body.designacoes);
  if ("error" in designacoes) return { error: designacoes.error };
  const checklist = parseSecretaryChecklist(body.checklist);
  if ("error" in checklist) return { error: checklist.error };
  if (!ministerioId || !titulo || !iniciaEm || !terminaEm) {
    return {
      error: "Ministério, título, início e término são obrigatórios.",
    } as const;
  }
  if (Date.parse(terminaEm) <= Date.parse(iniciaEm)) {
    return { error: "O término deve ser posterior ao início." } as const;
  }
  if (!SCHEDULE_STATUSES.has(status)) {
    return { error: "Status da escala inválido." } as const;
  }
  if (status === "AGENDADA" && (!publicarEm || Date.parse(publicarEm) <= Date.now())) {
    return { error: "Escolha um horário futuro para publicar a escala." } as const;
  }
  return {
    ministerioId,
    equipeId,
    titulo,
    iniciaEm,
    terminaEm,
    local,
    status,
    observacoes,
    responsavelUsuarioId,
    publicarEm: status === "AGENDADA" ? publicarEm : null,
    repertorio,
    links: links.value,
    designacoes: designacoes.value,
    checklist: checklist.value,
    camposRespostas:
      body.camposRespostas && typeof body.camposRespostas === "object"
        ? (body.camposRespostas as Record<string, unknown>)
        : {},
  } as const;
}

export function parseSecretaryLinks(
  value: unknown,
): ValidationResult<{ value: SecretaryLink[] }> {
  if (!Array.isArray(value)) return { value: [] as SecretaryLink[] } as const;
  if (value.length > 20) {
    return { error: "A escala aceita no máximo 20 links." } as const;
  }
  const links: SecretaryLink[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = asRecord(value[index]);
    const tipo = cleanText(source.tipo, 30).toUpperCase();
    const titulo = cleanText(source.titulo, 100);
    const rawUrl = cleanText(source.url, 800);
    if (!SECRETARY_LINK_TYPES.has(tipo) || !titulo || !rawUrl) {
      return { error: "Revise o tipo, o título e o endereço dos links." } as const;
    }
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:") {
        return { error: "Todos os links da escala devem usar HTTPS." } as const;
      }
      links.push({
        id: cleanText(source.id, 60) || `link-${index + 1}`,
        tipo: tipo as SecretaryLink["tipo"],
        titulo,
        url: url.toString(),
      });
    } catch {
      return { error: `O link “${titulo}” é inválido.` } as const;
    }
  }
  return { value: links } as const;
}

function parseSecretaryAssignments(
  value: unknown,
): ValidationResult<{ value: SecretaryAssignment[] }> {
  if (!Array.isArray(value)) {
    return { value: [] as SecretaryAssignment[] } as const;
  }
  if (value.length > 100) {
    return { error: "A escala aceita no máximo 100 integrantes." } as const;
  }
  const assignments: SecretaryAssignment[] = [];
  const ids = new Set<number>();
  for (const item of value) {
    const source = asRecord(item);
    const voluntarioId = positiveInteger(source.voluntarioId);
    const funcao = cleanText(source.funcao, 100);
    if (!voluntarioId || !funcao) {
      return { error: "Revise os integrantes e suas funções." } as const;
    }
    if (!ids.has(voluntarioId)) {
      ids.add(voluntarioId);
      assignments.push({ voluntarioId, funcao });
    }
  }
  return { value: assignments } as const;
}

function parseSecretaryChecklist(
  value: unknown,
): ValidationResult<{ value: SecretaryChecklistItem[] }> {
  if (!Array.isArray(value)) {
    return { value: [] as SecretaryChecklistItem[] } as const;
  }
  if (value.length > 50) {
    return { error: "O checklist aceita no máximo 50 responsabilidades." } as const;
  }
  const checklist: SecretaryChecklistItem[] = [];
  for (const item of value) {
    const source = asRecord(item);
    const tarefa = cleanText(source.tarefa, 180);
    if (!tarefa) continue;
    checklist.push({
      tarefa,
      voluntarioId: positiveInteger(source.voluntarioId),
    });
  }
  return { value: checklist } as const;
}

export function parseCustomFieldAnswers(
  answers: Record<string, unknown>,
  fields: MinistryCustomField[],
): ValidationResult<{ value: Record<string, string | number | boolean> }> {
  const normalized: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const raw = answers[field.id];
    if (field.type === "CHECKBOX") {
      const value = raw === true || raw === "true" || raw === "on";
      if (field.required && !value) {
        return { error: `Confirme o campo “${field.label}”.` } as const;
      }
      normalized[field.id] = value;
      continue;
    }
    const text = cleanText(raw, field.type === "TEXTO_LONGO" ? 1200 : 240);
    if (field.required && !text) {
      return { error: `Preencha o campo “${field.label}”.` } as const;
    }
    if (!text) {
      normalized[field.id] = "";
      continue;
    }
    if (field.type === "NUMERO") {
      const number = Number(text.replace(",", "."));
      if (!Number.isFinite(number)) {
        return { error: `Informe um número válido em “${field.label}”.` } as const;
      }
      normalized[field.id] = number;
      continue;
    }
    if (field.type === "SELECAO" && !field.options.includes(text)) {
      return { error: `Selecione uma opção válida em “${field.label}”.` } as const;
    }
    if (field.type === "DATA" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return { error: `Informe uma data válida em “${field.label}”.` } as const;
    }
    if (field.type === "HORA" && !/^\d{2}:\d{2}$/.test(text)) {
      return { error: `Informe um horário válido em “${field.label}”.` } as const;
    }
    normalized[field.id] = text;
  }
  return { value: normalized } as const;
}

export function parseAssignmentPayload(
  payload: unknown,
): ValidationResult<{ voluntarioId: number; funcao: string }> {
  const body = asRecord(payload);
  const voluntarioId = positiveInteger(body.voluntarioId);
  const funcao = cleanText(body.funcao, 100);
  if (!voluntarioId || !funcao) {
    return { error: "Voluntário e função são obrigatórios." } as const;
  }
  return { voluntarioId, funcao } as const;
}

export function cleanAction(value: unknown) {
  return cleanText(value, 50).toUpperCase();
}

function asRecord(value: unknown) {
  return (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeDateTime(value: unknown) {
  const text = cleanText(value, 40);
  const timestamp = Date.parse(text);
  return text && Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function parseOptionalMediaUrl(
  value: unknown,
  provider: "YOUTUBE" | "SPOTIFY",
): ValidationResult<{ value: string }> {
  const text = cleanText(value, 500);
  if (!text) return { value: "" } as const;
  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase();
    const allowed =
      provider === "YOUTUBE"
        ? new Set([
            "youtube.com",
            "www.youtube.com",
            "youtu.be",
            "music.youtube.com",
          ])
        : new Set(["open.spotify.com"]);
    if (url.protocol !== "https:" || !allowed.has(hostname)) {
      return {
        error: `Use um link HTTPS válido do ${
          provider === "YOUTUBE" ? "YouTube" : "Spotify"
        }.`,
      } as const;
    }
    return { value: url.toString() } as const;
  } catch {
    return {
      error: `O link do ${
        provider === "YOUTUBE" ? "YouTube" : "Spotify"
      } é inválido.`,
    } as const;
  }
}

function parseCustomFields(
  value: unknown,
): ValidationResult<{ value: MinistryCustomField[] }> {
  if (!Array.isArray(value)) return { value: [] as MinistryCustomField[] } as const;
  if (value.length > 20) {
    return { error: "Cada modelo aceita no máximo 20 campos personalizados." } as const;
  }
  const fields: MinistryCustomField[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const source = asRecord(value[index]);
    const label = cleanText(source.label, 80);
    const type = cleanText(source.type, 20).toUpperCase();
    const id =
      cleanText(source.id, 60)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || `campo-${index + 1}`;
    const options = Array.isArray(source.options)
      ? [
          ...new Set(
            source.options
              .map((item) => cleanText(item, 80))
              .filter(Boolean),
          ),
        ].slice(0, 20)
      : [];
    if (!label || !CUSTOM_FIELD_TYPES.has(type)) {
      return { error: "Revise o nome e o tipo dos campos personalizados." } as const;
    }
    if (ids.has(id)) {
      return { error: "Cada campo personalizado precisa ter um identificador único." } as const;
    }
    if (type === "SELECAO" && options.length < 2) {
      return { error: `Inclua ao menos duas opções em “${label}”.` } as const;
    }
    ids.add(id);
    fields.push({
      id,
      label,
      type: type as MinistryCustomField["type"],
      required: Boolean(source.required),
      options,
    });
  }
  return { value: fields } as const;
}
