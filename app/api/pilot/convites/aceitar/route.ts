import { getD1 } from "../../../../../db";
import {
  attachSessionCookie,
  createSession,
  hashPassword,
  normalizeEmail,
  setUserPassword,
  sha256,
  validatePassword,
  verifyPassword,
} from "../../../../lib/local-auth";

type InviteRow = {
  id: number;
  comunidade_id: number;
  email: string;
  papel: string;
};
type ExistingUser = {
  id: number;
  senha_hash: string | null;
  senha_salt: string | null;
  ativo: number;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    token?: string;
    nome?: string;
    email?: string;
    senha?: string;
  };
  const token = String(payload.token || "");
  const nome = String(payload.nome || "").trim();
  const email = normalizeEmail(payload.email);
  const senha = String(payload.senha || "");
  const passwordError = validatePassword(senha);
  if (token.length < 40 || nome.length < 3 || passwordError) {
    return Response.json(
      { error: passwordError || "Preencha os dados solicitados." },
      { status: 400 },
    );
  }

  const db = getD1();
  const invite = await db
    .prepare(
      `SELECT id, comunidade_id, email, papel
      FROM convites_comunidade
      WHERE token_hash = ? AND status = 'PENDENTE'
        AND datetime(expira_em) > CURRENT_TIMESTAMP
      LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<InviteRow>();
  if (!invite || normalizeEmail(invite.email) !== email) {
    return Response.json(
      { error: "Convite inválido, expirado ou incompatível com este e-mail." },
      { status: 404 },
    );
  }
  if (invite.papel !== "MEMBRO") {
    return Response.json(
      { error: "Convites privilegiados estão desativados no piloto." },
      { status: 403 },
    );
  }

  let user = await db
    .prepare(
      "SELECT id, senha_hash, senha_salt, ativo FROM usuarios WHERE email = ? LIMIT 1",
    )
    .bind(email)
    .first<ExistingUser>();
  if (user && !user.ativo) {
    return Response.json(
      { error: "Este cadastro está inativo. Solicite revisão ao suporte." },
      { status: 403 },
    );
  }
  if (user?.senha_hash && user.senha_salt) {
    const valid = await verifyPassword(senha, user.senha_salt, user.senha_hash);
    if (!valid) {
      return Response.json(
        { error: "Entre com a senha já cadastrada para aceitar o convite." },
        { status: 401 },
      );
    }
  } else if (user) {
    await setUserPassword(user.id, senha);
  } else {
    const password = await hashPassword(senha);
    await db
      .prepare(
        `INSERT INTO usuarios
        (nome, email, perfil, permissoes, senha_hash, senha_salt, ativo)
        VALUES (?, ?, 'ACOMPANHANTE', '', ?, ?, 1)`,
      )
      .bind(nome, email, password.hash, password.salt)
      .run();
    user = await db
      .prepare(
        "SELECT id, senha_hash, senha_salt, ativo FROM usuarios WHERE email = ? LIMIT 1",
      )
      .bind(email)
      .first<ExistingUser>();
  }
  if (!user) {
    return Response.json(
      { error: "Não foi possível concluir o cadastro." },
      { status: 500 },
    );
  }

  const results = await db.batch([
    db
      .prepare(
        `UPDATE convites_comunidade
        SET status = 'ACEITO', usado_por = ?, usado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'PENDENTE'
          AND datetime(expira_em) > CURRENT_TIMESTAMP`,
      )
      .bind(user.id, invite.id),
    db
      .prepare(
        `INSERT OR IGNORE INTO usuario_comunidades
        (usuario_id, comunidade_id, papel, status)
        SELECT ?, ?, 'MEMBRO', 'ATIVO'
        WHERE EXISTS (
          SELECT 1 FROM convites_comunidade
          WHERE id = ? AND status = 'ACEITO' AND usado_por = ?
        )`,
      )
      .bind(user.id, invite.comunidade_id, invite.id, user.id),
  ]);
  if (Number(results[0].meta.changes || 0) !== 1) {
    return Response.json(
      { error: "Este convite já foi utilizado." },
      { status: 409 },
    );
  }
  await db
    .prepare(
      `INSERT INTO auditoria_piloto
      (comunidade_id, usuario_id, evento, resultado, metadados)
      VALUES (?, ?, 'CONVITE_MEMBRO_ACEITO', 'SUCESSO', ?)`,
    )
    .bind(
      invite.comunidade_id,
      user.id,
      JSON.stringify({ conviteId: invite.id, papel: "MEMBRO" }),
    )
    .run();
  const session = await createSession(user.id);
  return attachSessionCookie(
    Response.json({ ok: true, redirect: "/painel" }),
    session,
  );
}

