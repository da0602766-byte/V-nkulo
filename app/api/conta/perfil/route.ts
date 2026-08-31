import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { getPilotLoginConfig } from "../../../lib/pilot-login-config";

type StoredField = { label?: string; value?: string };
type StoredData = Record<string, StoredField | Record<string, boolean>>;

function parseStored(value: unknown): StoredData {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function clean(value: unknown, maximum = 250) {
  return String(value ?? "").trim().slice(0, maximum);
}

function profilePhoto(value: unknown) {
  const candidate = clean(value, 900);
  return (
    /^\/api\/pilot\/uploads\/images\/profile-photo\/user-\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(candidate) ||
    /^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(candidate) ||
    /^\/local-media\/[0-9a-f-]{36}$/i.test(candidate)
  )
    ? candidate
    : "";
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const [row, config] = await Promise.all([
    getD1()
      .prepare(
        `SELECT id, nome, email, telefone, data_nascimento, endereco,
          foto_perfil, cadastro_dados, criado_em
         FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1`,
      )
      .bind(user.id)
      .first<Record<string, unknown>>(),
    getPilotLoginConfig(),
  ]);
  if (!row) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
  const stored = parseStored(row.cadastro_dados);
  const privacy =
    stored.__privacy && typeof stored.__privacy === "object"
      ? (stored.__privacy as Record<string, boolean>)
      : {};
  return Response.json(
    {
      account: {
        id: row.id,
        nome: row.nome,
        email: row.email,
        telefone: row.telefone || "",
        dataNascimento: row.data_nascimento || "",
        endereco: row.endereco || "",
        fotoPerfil: row.foto_perfil || "",
        criadoEm: row.criado_em,
        biografia: String((stored.biografia as StoredField | undefined)?.value || ""),
      },
      fields: config.signupFields
        .filter((field) => field.enabled)
        .map((field) => ({
          ...field,
          value:
            field.id === "telefone"
              ? String(row.telefone || "")
              : field.id === "endereco"
                ? String(row.endereco || "")
                : String((stored[field.id] as StoredField | undefined)?.value || ""),
          private: privacy[field.id] === true,
        })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const payload = (await request.json()) as Record<string, unknown>;
  const config = await getPilotLoginConfig();
  const fieldsPayload =
    payload.fields && typeof payload.fields === "object"
      ? (payload.fields as Record<string, unknown>)
      : {};
  const privacyPayload =
    payload.privacy && typeof payload.privacy === "object"
      ? (payload.privacy as Record<string, unknown>)
      : {};
  const db = getD1();
  const current = await db
    .prepare("SELECT cadastro_dados FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1")
    .bind(user.id)
    .first<{ cadastro_dados: string }>();
  if (!current) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
  const stored = parseStored(current.cadastro_dados);
  const privacy: Record<string, boolean> = {};
  for (const field of config.signupFields.filter((item) => item.enabled)) {
    const value = clean(fieldsPayload[field.id], field.type === "textarea" ? 800 : 250);
    if (field.required && !value) {
      return Response.json(
        { error: `${field.label} é obrigatório.` },
        { status: 400 },
      );
    }
    stored[field.id] = { label: field.label, value };
    privacy[field.id] = privacyPayload[field.id] === true;
  }
  stored.__privacy = privacy;
  stored.biografia = {
    label: "Biografia",
    value: clean(payload.biografia, 500),
  };
  const nome = clean(payload.nome, 120);
  if (!nome) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
  const telefone = clean(fieldsPayload.telefone ?? payload.telefone, 40);
  const endereco = clean(fieldsPayload.endereco ?? payload.endereco, 300);
  const fotoPerfil = profilePhoto(payload.fotoPerfil);
  await db
    .prepare(
      `UPDATE usuarios
       SET nome = ?, telefone = ?, data_nascimento = ?, endereco = ?,
         foto_perfil = ?, cadastro_dados = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND ativo = 1`,
    )
    .bind(
      nome,
      telefone || null,
      clean(payload.dataNascimento, 20) || null,
      endereco || null,
      fotoPerfil || null,
      JSON.stringify(stored),
      user.id,
    )
    .run();
  return Response.json({ updated: true });
}
