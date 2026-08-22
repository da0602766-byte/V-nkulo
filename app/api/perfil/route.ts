import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";
import { normalizeEmail, verifyPassword } from "../../lib/local-auth";

export async function GET() {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  return Response.json({ usuario: access.user });
}

export async function PATCH(request: Request) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const { fotoPerfil, nome, email, senhaAtual, telefone, dataNascimento, endereco, celula, ministerio, observacoes } = await request.json() as { fotoPerfil?: string | null; nome?: string; email?: string; senhaAtual?: string; telefone?: string; dataNascimento?: string; endereco?: string; celula?: string; ministerio?: string; observacoes?: string };
  if (fotoPerfil && (!fotoPerfil.startsWith("data:image/") || fotoPerfil.length > 900000)) return Response.json({ error: "A foto convertida ficou grande demais. Tente outra imagem." }, { status: 400 });
  const cleanName = String(nome || access.user!.nome).trim();
  const cleanEmail = normalizeEmail(email || access.user!.email);
  if (!cleanName) return Response.json({ error: "Informe seu nome." }, { status: 400 });
  if (!cleanEmail.includes("@")) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  const db = getD1();
  if (cleanEmail !== access.user!.email) {
    const credentials = await db.prepare("SELECT senha_hash, senha_salt FROM usuarios WHERE id = ?").bind(access.user!.id).first<{ senha_hash: string | null; senha_salt: string | null }>();
    if (!senhaAtual || !credentials?.senha_hash || !credentials.senha_salt || !(await verifyPassword(senhaAtual, credentials.senha_salt, credentials.senha_hash))) {
      return Response.json({ error: "Digite sua senha atual corretamente para trocar o e-mail." }, { status: 403 });
    }
    const existing = await db.prepare("SELECT id FROM usuarios WHERE email = ? AND id <> ?").bind(cleanEmail, access.user!.id).first();
    if (existing) return Response.json({ error: "Este e-mail já está sendo usado por outra conta." }, { status: 409 });
  }
  await db.prepare("UPDATE usuarios SET nome = ?, email = ?, telefone = ?, data_nascimento = ?, endereco = ?, celula = ?, ministerio = ?, observacoes = ?, foto_perfil = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(cleanName, cleanEmail, optional(telefone), optional(dataNascimento), optional(endereco), optional(celula), optional(ministerio), optional(observacoes), fotoPerfil || null, access.user!.id).run();
  return Response.json({ nome: cleanName, email: cleanEmail, telefone: optional(telefone), data_nascimento: optional(dataNascimento), endereco: optional(endereco), celula: optional(celula), ministerio: optional(ministerio), observacoes: optional(observacoes), foto_perfil: fotoPerfil || null });
}

function optional(value?: string) { return String(value || "").trim() || null; }
