import { getD1 } from "../../../../../db";
import { getMemberRegistrationForm } from "../../../../lib/member-registration";
import { createFirstAccessToken, generateTemporaryPassword, hashPassword } from "../../../../lib/local-auth";

type Context = { params: Promise<{ token: string }> };
const DAY_VALUES = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);
const PERIOD_VALUES = new Set(["MANHA", "TARDE", "NOITE", "FLEXIVEL"]);

export async function GET(_request: Request, context: Context) {
  const token = (await context.params).token;
  const form = await getMemberRegistrationForm(getD1(), token);
  if (!form) {
    return Response.json({ error: "Link de cadastro inválido." }, { status: 404 });
  }
  return Response.json(form, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const token = (await context.params).token;
  const db = getD1();
  const registration = await getMemberRegistrationForm(db, token);
  if (!registration) {
    return Response.json({ error: "Link de cadastro inválido." }, { status: 404 });
  }
  if (registration.state !== "ABERTO") {
    return Response.json(
      {
        error: registration.state === "AGUARDANDO"
          ? "O período de cadastro ainda não começou."
          : registration.state === "ENCERRADO"
            ? "O período de cadastro já terminou."
            : "Este link de cadastro foi cancelado.",
        state: registration.state,
      },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Não foi possível ler o formulário." }, { status: 400 });
  }
  const fullName = clean(form.get("fullName"), 120);
  const email = clean(form.get("email"), 180).toLocaleLowerCase("pt-BR");
  const cpf = digits(form.get("cpf")).slice(0, 11);
  const cep = digits(form.get("cep")).slice(0, 8);
  const birthDate = clean(form.get("birthDate"), 10);
  const communityId = positiveInteger(form.get("communityId"));
  const anointing = clean(form.get("anointing"), 40).toUpperCase();
  const ministryId = positiveInteger(form.get("ministryId"));
  const functionId = positiveInteger(form.get("functionId"));
  const period = clean(form.get("period"), 20).toUpperCase();
  const acceptedTerms = String(form.get("acceptedTerms")) === "true";
  const days = form.getAll("availableDays").map(String).filter((day) => DAY_VALUES.has(day));
  const community = registration.communities.find((item) => item.id === communityId);
  const ministry = community?.ministries.find((item) => item.id === ministryId);
  const ministryFunction = functionId
    ? ministry?.functions.find((item) => item.id === functionId)
    : undefined;
  if (
    fullName.length < 5 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    cep.length !== 8 ||
    !validBirthDate(birthDate) ||
    !community ||
    !community.anointings.some((item) => item.id === anointing) ||
    !ministry
  ) {
    return Response.json(
      { error: "Revise nome, e-mail, CEP, nascimento, comunidade, unção e ministério." },
      { status: 400 },
    );
  }
  if (cpf && !validCpf(cpf)) {
    return Response.json({ error: "O CPF informado é inválido." }, { status: 400 });
  }
  if (functionId && !ministryFunction) {
    return Response.json({ error: "A função escolhida não pertence a este ministério." }, { status: 400 });
  }
  if (period && !PERIOD_VALUES.has(period)) {
    return Response.json({ error: "Período disponível inválido." }, { status: 400 });
  }
  if (!acceptedTerms) return Response.json({ error: "Aceite os Termos de Uso e a Política de Privacidade." }, { status: 400 });

  const existingUser = await db.prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1").bind(email).first<{ id: number }>();
  if (existingUser) return Response.json({ error: "Já existe uma conta com este e-mail. Entre com sua conta ou use outro e-mail." }, { status: 409 });

  const duplicate = await db
    .prepare("SELECT id FROM cadastros_membros_temporarios WHERE link_id = ? AND email = ? LIMIT 1")
    .bind(registration.id, email)
    .first<{ id: number }>();
  if (duplicate) {
    return Response.json(
      { error: "Este e-mail já enviou um cadastro por este link." },
      { status: 409 },
    );
  }

  const customAnswers: Record<string, string> = {};
  for (const field of ministry.extraFields) {
    const value = clean(form.get(`extra:${field.id}`), 500);
    if (field.required && !value) {
      return Response.json({ error: `Preencha “${field.label}”.` }, { status: 400 });
    }
    if (value) customAnswers[field.id] = value;
  }

  const photoUrl = "";

  const temporaryPassword = generateTemporaryPassword();
  const passwordData = await hashPassword(temporaryPassword);
  const account = await db.prepare(
    `INSERT INTO usuarios
     (nome, email, perfil, permissoes, senha_hash, senha_salt, titulo_eclesiastico, ativo, cadastro_dados)
     VALUES (?, ?, 'LEITURA', '', ?, ?, 'MEMBRO', 1, ?)`,
  ).bind(fullName, email, passwordData.hash, passwordData.salt, JSON.stringify({ origem: "LINK_CADASTRO_MEMBROS" })).run();
  const userId = Number(account.meta.last_row_id);
  await db.prepare(
    `INSERT INTO usuario_comunidades (usuario_id, comunidade_id, papel, status)
     VALUES (?, ?, 'MEMBRO', 'ATIVO')
     ON CONFLICT(usuario_id, comunidade_id) DO UPDATE SET status = 'ATIVO', papel = 'MEMBRO'`,
  ).bind(userId, community.id).run();

  let firstAccess: Awaited<ReturnType<typeof createFirstAccessToken>>;
  try {
    firstAccess = await createFirstAccessToken(userId);
  } catch {
    await db.prepare("DELETE FROM usuarios WHERE id = ?").bind(userId).run();
    return Response.json(
      { error: "Não foi possível preparar o primeiro acesso. Tente novamente." },
      { status: 503 },
    );
  }

  const result = await db
    .prepare(
      `INSERT INTO cadastros_membros_temporarios
       (link_id, comunidade_id, ministerio_id, nome_completo, email, cpf, cep,
        data_nascimento, uncao, foto_url, ministerio_dados, status)
       SELECT ?, c.id, m.id, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE'
       FROM comunidades c
       JOIN ministerios_comunidade m
         ON m.id = ? AND m.comunidade_id = c.id AND m.status = 'ATIVO'
       WHERE c.id = ? AND c.proprietario_usuario_id = ? AND c.status = 'ATIVA'`,
    )
    .bind(
      registration.id,
      fullName,
      email,
      cpf,
      cep,
      birthDate,
      anointing,
      photoUrl,
      JSON.stringify({
        functionId: ministryFunction?.id || null,
        functionName: ministryFunction?.name || "",
        availableDays: [...new Set(days)],
        preferredPeriod: period || "FLEXIVEL",
        customAnswers,
      }),
      ministry.id,
      community.id,
      registration.creatorId,
    )
    .run();
  if (!Number(result.meta.changes)) {
    await db.prepare("DELETE FROM usuarios WHERE id = ?").bind(userId).run();
    return Response.json(
      { error: "A comunidade ou o ministério não está mais disponível neste formulário." },
      { status: 409 },
    );
  }
  return Response.json(
    {
      submitted: true,
      accountCreated: true,
      membershipCreated: true,
      registrationId: Number(result.meta.last_row_id),
      firstAccess: {
        path: `/primeiro-acesso?token=${encodeURIComponent(firstAccess.token)}&login=${encodeURIComponent(email)}`,
        login: email,
        temporaryPassword,
        expiresAt: firstAccess.expiresAt,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}
function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function positiveInteger(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now();
}
function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const numbers = cpf.split("").map(Number);
  for (let position = 9; position <= 10; position += 1) {
    const sum = numbers.slice(0, position).reduce((total, digit, index) => total + digit * (position + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== numbers[position]) return false;
  }
  return true;
}
function hasValidImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return type === "image/webp" && bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
