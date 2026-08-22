import { getD1 } from "../../../../db";
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "../../../lib/local-auth";
import { getPilotLoginConfig } from "../../../lib/pilot-login-config";
import { PILOT_CONFIG } from "../../../lib/pilot-config";

export async function POST(request: Request) {
  const loginConfig = await getPilotLoginConfig();
  if (
    !PILOT_CONFIG.openRegistrationEnabled ||
    !loginConfig.cadastroHabilitado
  ) {
    return Response.json(
      {
        error: "A criação pública de conta está temporariamente desativada.",
        openRegistrationEnabled: false,
      },
      { status: 403 },
    );
  }
  let payload: {
    nome?: unknown;
    email?: unknown;
    senha?: unknown;
    confirmarSenha?: unknown;
    aceiteTermos?: unknown;
    [key: string]: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const nome = String(payload.nome || "").trim().slice(0, 120);
  const email = normalizeEmail(payload.email);
  const senha = String(payload.senha || "");
  const cadastroDados: Record<string, { label: string; value: string }> = {};
  for (const field of loginConfig.signupFields.filter((item) => item.enabled)) {
    const value = String(payload[`cadastro_${field.id}`] || "").trim().slice(0, 500);
    if (field.required && !value) {
      return Response.json(
        { error: `Preencha o campo obrigatório: ${field.label}.` },
        { status: 400 },
      );
    }
    if (value) cadastroDados[field.id] = { label: field.label, value };
  }
  const telefone = cadastroDados.telefone?.value.slice(0, 30) || "";
  if (nome.length < 3) {
    return Response.json(
      { error: "Informe seu nome completo." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
    return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  const passwordError = validatePassword(senha);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }
  if (senha !== String(payload.confirmarSenha || "")) {
    return Response.json({ error: "As senhas não conferem." }, { status: 400 });
  }
  if (payload.aceiteTermos !== true) {
    return Response.json(
      { error: "Aceite os Termos e a Política de Privacidade para continuar." },
      { status: 400 },
    );
  }
  const db = getD1();
  const existing = await db
    .prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: number }>();
  if (existing) {
    return Response.json(
      { error: "Já existe uma conta com este e-mail." },
      { status: 409 },
    );
  }
  const password = await hashPassword(senha);
  try {
    const result = await db
      .prepare(
        `INSERT INTO usuarios
        (nome, email, perfil, permissoes, telefone, cadastro_dados, senha_hash, senha_salt,
          titulo_eclesiastico, ativo)
        VALUES (?, ?, 'LEITURA', '', ?, ?, ?, ?, 'VISITANTE', 1)`,
      )
      .bind(
        nome,
        email,
        telefone || null,
        JSON.stringify(cadastroDados),
        password.hash,
        password.salt,
      )
      .run();
    const userId = Number(result.meta.last_row_id);
    await db
      .prepare(
        `INSERT INTO auditoria_piloto
        (comunidade_id, usuario_id, evento, resultado, metadados)
        VALUES (NULL, ?, 'CONTA_PUBLICA_V45_CRIADA', 'SUCESSO', ?)`,
      )
      .bind(
        userId,
        JSON.stringify({ membershipCreated: false, roleGranted: false }),
      )
      .run();
    return Response.json(
      {
        ok: true,
        message:
          "Conta criada. Entre e solicite acesso à sua comunidade; o vínculo depende de aprovação.",
        membershipCreated: false,
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "Não foi possível criar a conta. Verifique os dados e tente novamente." },
      { status: 409 },
    );
  }
}
