import { getD1 } from "../../../db";
import { ALL_PERMISSIONS, requireApiPermission } from "../../lib/access";
import { createSystemNotification } from "../../lib/system-notifications";

const PROFILES = new Set(["ADMIN", "RECEPCAO", "ACOMPANHANTE", "LIDER_CELULA"]);

export async function GET() {
  const access = await requireApiPermission("USUARIOS_GERENCIAR");
  if (access.error) return access.error;
  const result = await getD1()
    .prepare(
      `SELECT u.id, u.nome, u.email, u.perfil, u.permissoes, u.foto_perfil, u.telefone,
      u.data_nascimento, u.endereco, u.celula, u.ministerio, u.observacoes, u.nome_pais,
      u.diaconia_equipe_id, d.nome AS diaconia_equipe_nome, u.tema_preferido,
      EXISTS(SELECT 1 FROM culto_rotinas c WHERE c.registrador_usuario_id = u.id) AS culto_registrador,
      u.titulo_eclesiastico, u.ativo, u.criado_em,
      CASE WHEN datetime(u.criado_em) >= datetime('now', '-30 days') THEN 1 ELSE 0 END AS novo_cadastro,
      CASE WHEN u.senha_hash IS NOT NULL THEN 1 ELSE 0 END AS tem_senha,
      EXISTS(SELECT 1 FROM redefinicoes_senha r WHERE r.usuario_id = u.id AND r.usado = 0 AND r.token_hash IS NULL) AS redefinicao_pendente
     FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id ORDER BY u.nome`,
    )
    .all();
  return Response.json({ usuarios: result.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("USUARIOS_GERENCIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as {
    nome?: string;
    email?: string;
    telefone?: string;
    dataNascimento?: string;
    endereco?: string;
    celula?: string;
    ministerio?: string;
    observacoes?: string;
    nomePais?: string;
    diaconiaEquipeId?: number | string | null;
    tituloEclesiastico?: string;
    perfil?: string;
    permissoes?: string[];
  };
  const nome = payload.nome?.trim() ?? "";
  const email = payload.email?.trim().toLowerCase() ?? "";
  const perfil = payload.perfil?.toUpperCase() ?? "ACOMPANHANTE";
  const requestedTitle = String(payload.tituloEclesiastico || "MEMBRO").trim().toUpperCase();
  const title =
    access.user!.perfil === "ADMIN" &&
    /^[A-Z0-9_]{2,40}$/.test(requestedTitle)
      ? requestedTitle
      : "MEMBRO";
  const permissions = (payload.permissoes ?? []).filter((item) =>
    ALL_PERMISSIONS.includes(item as never),
  );
  if (!nome || !email.includes("@") || !PROFILES.has(perfil)) {
    return Response.json(
      { error: "Nome, e-mail e perfil válidos são obrigatórios." },
      { status: 400 },
    );
  }
  const db = getD1();
  const hierarchyPermissions = await configuredHierarchyPermissions(db, title);
  const permissionText = perfil === "ADMIN"
    ? ALL_PERMISSIONS.join(",")
    : [...new Set([...(hierarchyPermissions ? ["HIERARQUIA_CONFIGURADA", ...hierarchyPermissions] : []), ...permissions])].join(",");
  const teamId = await validTeamId(db, payload.diaconiaEquipeId);
  if (teamId === undefined)
    return Response.json(
      { error: "Selecione uma equipe de diaconia válida." },
      { status: 400 },
    );
  const result = await db
    .prepare(
      `INSERT INTO usuarios (nome, email, telefone, data_nascimento, endereco, celula, ministerio, observacoes, nome_pais, diaconia_equipe_id, titulo_eclesiastico, perfil, permissoes, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(email) DO UPDATE SET nome = excluded.nome, perfil = excluded.perfil,
       telefone = excluded.telefone, data_nascimento = excluded.data_nascimento, endereco = excluded.endereco,
       celula = excluded.celula, ministerio = excluded.ministerio, observacoes = excluded.observacoes,
       nome_pais = excluded.nome_pais, diaconia_equipe_id = excluded.diaconia_equipe_id,
       titulo_eclesiastico = excluded.titulo_eclesiastico,
       permissoes = excluded.permissoes, ativo = 1, atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      nome,
      email,
      optional(payload.telefone),
      optional(payload.dataNascimento),
      optional(payload.endereco),
      optional(payload.celula),
      optional(payload.ministerio),
      optional(payload.observacoes),
      optional(payload.nomePais),
      teamId,
      title,
      perfil,
      permissionText,
    )
    .run();
  await createSystemNotification(db, {
    tipo: "NOVO",
    titulo: "Novo usuário cadastrado",
    mensagem: `${nome} foi adicionado ao sistema.`,
    area: "USUARIOS",
    entidadeId: Number(result.meta.last_row_id) || null,
    criadoPor: access.user!.email,
  });
  return Response.json({ ok: true }, { status: 201 });
}

function optional(value?: string) {
  return String(value || "").trim() || null;
}
async function validTeamId(db: D1Database, value?: number | string | null) {
  const id = Number(value || 0);
  if (!id) return null;
  const team = await db
    .prepare("SELECT id FROM diaconia_equipes WHERE id = ? AND ativo = 1")
    .bind(id)
    .first<{ id: number }>();
  if (!team) return undefined;
  return id;
}
async function configuredHierarchyPermissions(db: D1Database, title: string) {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = 'hierarquias'").first<{ valor: string }>();
  if (!row?.valor) return null;
  try {
    const items = JSON.parse(row.valor) as { id: string; permissoes?: string[] }[];
    return items.find((item) => item.id === title)?.permissoes?.filter((key) => ALL_PERMISSIONS.includes(key as never)) ?? null;
  } catch {
    return null;
  }
}
