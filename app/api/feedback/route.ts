import { getD1 } from "../../../db";
import { getSessionUser } from "../../lib/local-auth";
import { getActiveTenantContext } from "../../lib/tenant";
import {
  deleteDriveFile,
  ensurePersonalDriveStorage,
  getDriveAccessToken,
  makeStorageReference,
  uploadDriveFile,
} from "../../lib/google-integration";

const FEEDBACK_TYPES = new Set(["PROBLEMA", "SUGESTAO", "MELHORIA", "DENUNCIA"]);
const FEEDBACK_CATEGORIES = new Set([
  "ERRO_FUNCIONAL",
  "PROBLEMA_VISUAL",
  "DESEMPENHO",
  "ACESSIBILIDADE",
  "SEGURANCA_PRIVACIDADE",
  "NOVA_FUNCIONALIDADE",
  "USABILIDADE",
  "ORGANIZACAO",
  "CONTEUDO_OFENSIVO",
  "ASSEDIO_DISCRIMINACAO",
  "SPAM_FRAUDE",
  "INFORMACAO_FALSA",
  "DADOS_PESSOAIS",
  "DIREITOS_AUTORAIS",
  "CONTEUDO_IMPROPRIO",
  "OUTRO",
]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Faça login para enviar." }, { status: 401 });
  if (!user.ativo) return Response.json({ error: "Usuário inativo." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Não foi possível ler os dados enviados." }, { status: 400 });
  }

  const tipo = clean(form.get("tipo"), 30).toUpperCase();
  const categoria = clean(form.get("categoria"), 60).toUpperCase();
  const mensagem = clean(form.get("mensagem"), 3000);
  const pagina = internalPath(form.get("pagina"));
  const entidadeTipo = clean(form.get("entidadeTipo"), 40).toUpperCase();
  const entidadeId = positiveInteger(form.get("entidadeId")) || null;
  const image = form.get("imagem");

  if (!FEEDBACK_TYPES.has(tipo) || !FEEDBACK_CATEGORIES.has(categoria)) {
    return Response.json({ error: "Tipo ou categoria inválida." }, { status: 400 });
  }
  if (mensagem.length < 10) {
    return Response.json({ error: "Descreva a situação com pelo menos 10 caracteres." }, { status: 400 });
  }
  if (tipo === "DENUNCIA" && entidadeTipo !== "PUBLICACAO") {
    return Response.json({ error: "A denúncia precisa estar vinculada a uma publicação." }, { status: 400 });
  }

  const hasImage = image instanceof File && image.size > 0;
  if (tipo === "PROBLEMA" && !hasImage) {
    return Response.json({ error: "Adicione uma foto mostrando o problema." }, { status: 400 });
  }
  if (hasImage && (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES)) {
    return Response.json({ error: "Use uma foto JPG, PNG ou WebP de até 8 MB." }, { status: 415 });
  }

  const tenant = await getActiveTenantContext(user);
  const communityId = tenant.context?.comunidadeId || null;
  let imageKey = "";
  let imageName = "";
  let uploadedDriveFileId = "";

  if (hasImage) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!validImage(bytes, image.type)) {
      return Response.json({ error: "O arquivo selecionado não é uma imagem válida." }, { status: 415 });
    }
    try {
      const accessToken = await getDriveAccessToken(user.id);
      const storage = await ensurePersonalDriveStorage(user.id, accessToken);
      const stored = await uploadDriveFile(accessToken, {
        name: `feedback-${crypto.randomUUID()}.${image.type === "image/jpeg" ? "jpg" : image.type === "image/png" ? "png" : "webp"}`,
        type: image.type,
        bytes,
        parentId: storage.mediaFolderId,
        properties: { purpose: "feedback-evidence", uploadedBy: String(user.id) },
      });
      uploadedDriveFileId = stored.id;
      imageKey = await makeStorageReference("feedback", user.id, stored.id);
      imageName = image.name.slice(0, 160);
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 409 });
    }
  }

  const db = getD1();
  try {
    const result = await db.prepare(
      `INSERT INTO feedback_plataforma
       (usuario_id, comunidade_id, tipo, categoria, mensagem, pagina,
        entidade_tipo, entidade_id, imagem_chave, imagem_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      user.id,
      communityId,
      tipo,
      categoria,
      mensagem,
      pagina,
      entidadeTipo,
      entidadeId,
      imageKey,
      imageName,
    ).run();
    const id = Number((result.meta as { last_row_id?: number }).last_row_id || 0);
    await db.prepare(
      `INSERT INTO auditoria_piloto
       (comunidade_id, usuario_id, evento, resultado, metadados)
       VALUES (?, ?, 'FEEDBACK_PLATAFORMA_ENVIADO', 'SUCESSO', ?)`,
    ).bind(communityId, user.id, JSON.stringify({ id, tipo, categoria, pagina })).run();
    return Response.json({ ok: true, id, status: "PENDENTE", userName: user.nome });
  } catch (error) {
    if (uploadedDriveFileId) {
      const token = await getDriveAccessToken(user.id).catch(() => "");
      if (token) await deleteDriveFile(token, uploadedDriveFileId).catch(() => undefined);
    }
    throw error;
  }
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function internalPath(value: unknown) {
  const path = clean(value, 300);
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function validImage(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return type === "image/webp" && bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
