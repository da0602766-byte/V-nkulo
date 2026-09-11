import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";
import { notifyUser } from "../../../lib/pilot-notifications";

// A agenda é uma leitura só: várias fontes que já existem no banco viram
// camadas de um mesmo calendário. Só os compromissos pessoais nascem aqui.
const CATEGORIAS_PESSOAIS = new Set([
  "PESSOAL",
  "VISITA",
  "PREPARO",
  "REUNIAO",
  "META",
]);
const MAX_JANELA_DIAS = 62;
const MAX_COMPROMISSOS = 400;

type Camada = "EVENTO" | "ESCALA" | "PESSOAL";

type ItemAgenda = {
  id: string;
  camada: Camada;
  titulo: string;
  descricao: string;
  categoria: string;
  iniciaEm: string;
  terminaEm: string | null;
  local: string;
  diaInteiro: boolean;
  status: string;
  origemId: number;
  visibilidade?: "PRIVADO" | "PUBLICO";
  meu?: boolean;
  aprovacaoStatus?: "PENDENTE" | "APROVADA";
};

function janela(url: URL) {
  const hoje = new Date();
  const brutoDe = url.searchParams.get("de");
  const brutoAte = url.searchParams.get("ate");
  const de = brutoDe && !Number.isNaN(Date.parse(brutoDe))
    ? new Date(brutoDe)
    : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ate = brutoAte && !Number.isNaN(Date.parse(brutoAte))
    ? new Date(brutoAte)
    : new Date(de.getFullYear(), de.getMonth() + 1, 0);
  // Uma janela aberta demais viraria varredura de tabela inteira.
  const limite = new Date(de.getTime() + MAX_JANELA_DIAS * 86400000);
  return {
    de: de.toISOString(),
    ate: (ate > limite ? limite : ate).toISOString(),
  };
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const { comunidadeId, userId, permissions } = access.context;
  const { de, ate } = janela(new URL(request.url));
  const db = getD1();
  const itens: ItemAgenda[] = [];

  // Camada 1 — eventos publicados da comunidade (cultos, encontros).
  if (permissions.includes("events.view")) {
    const eventos = await db
      .prepare(
        `SELECT id, titulo, descricao, categoria, inicia_em, termina_em, local, status
         FROM eventos_comunidade
         WHERE comunidade_id = ?
           AND datetime(inicia_em) BETWEEN datetime(?) AND datetime(?)
         ORDER BY datetime(inicia_em) ASC
         LIMIT ?`,
      )
      .bind(comunidadeId, de, ate, MAX_COMPROMISSOS)
      .all<{
        id: number; titulo: string; descricao: string; categoria: string;
        inicia_em: string; termina_em: string | null; local: string; status: string;
      }>();
    for (const linha of eventos.results || []) {
      itens.push({
        id: `evento-${linha.id}`,
        camada: "EVENTO",
        titulo: linha.titulo,
        descricao: linha.descricao || "",
        categoria: linha.categoria || "OUTRO",
        iniciaEm: linha.inicia_em,
        terminaEm: linha.termina_em,
        local: linha.local || "",
        diaInteiro: false,
        status: linha.status,
        origemId: linha.id,
      });
    }
  }

  // Camada 2 — apenas as escalas em que esta pessoa foi designada.
  const escalas = await db
    .prepare(
      `SELECT e.id, e.titulo, e.inicia_em, e.termina_em, e.local,
        d.funcao, d.status AS resposta
       FROM escala_designacoes d
       JOIN escalas_ministerio e ON e.id = d.escala_id
       WHERE d.comunidade_id = ?
         AND d.usuario_id = ?
         AND d.ativo = 1
         AND datetime(e.inicia_em) BETWEEN datetime(?) AND datetime(?)
       ORDER BY datetime(e.inicia_em) ASC
       LIMIT ?`,
    )
    .bind(comunidadeId, userId, de, ate, MAX_COMPROMISSOS)
    .all<{
      id: number; titulo: string; inicia_em: string; termina_em: string | null;
      local: string; funcao: string; resposta: string;
    }>();
  for (const linha of escalas.results || []) {
    itens.push({
      id: `escala-${linha.id}`,
      camada: "ESCALA",
      titulo: linha.titulo,
      descricao: linha.funcao || "",
      categoria: "ESCALA",
      iniciaEm: linha.inicia_em,
      terminaEm: linha.termina_em,
      local: linha.local || "",
      diaInteiro: false,
      status: linha.resposta,
      origemId: linha.id,
    });
  }

  // Camada 3 — os compromissos da própria pessoa, mais os que outras pessoas
  // marcaram como públicos. O `dono` distingue o que ela pode editar.
  const pessoais = await db
    .prepare(
      `SELECT c.id, c.titulo, c.descricao, c.categoria, c.inicia_em, c.termina_em,
        c.local, c.dia_inteiro, c.concluido, c.visibilidade, c.usuario_id,
        c.aprovacao_status,
        u.nome AS autor
       FROM agenda_compromissos c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.comunidade_id = ?
         AND (c.usuario_id = ? OR (c.visibilidade = 'PUBLICO' AND c.aprovacao_status = 'APROVADA') OR ? = 1)
         AND datetime(c.inicia_em) BETWEEN datetime(?) AND datetime(?)
       ORDER BY datetime(c.inicia_em) ASC
       LIMIT ?`,
    )
    .bind(comunidadeId, userId, permissions.includes("events.manage") ? 1 : 0, de, ate, MAX_COMPROMISSOS)
    .all<{
      id: number; titulo: string; descricao: string; categoria: string;
      inicia_em: string; termina_em: string | null; local: string;
      dia_inteiro: number; concluido: number; visibilidade: string;
      usuario_id: number; autor: string;
      aprovacao_status: string;
    }>();
  for (const linha of pessoais.results || []) {
    const meu = linha.usuario_id === userId;
    itens.push({
      id: `pessoal-${linha.id}`,
      camada: "PESSOAL",
      titulo: linha.titulo,
      // Num compromisso de outra pessoa, saber de quem é vale mais que a
      // observação particular dela — que aliás não deve aparecer aqui.
      descricao: meu ? linha.descricao || "" : `Publicado por ${linha.autor}`,
      categoria: linha.categoria,
      iniciaEm: linha.inicia_em,
      terminaEm: linha.termina_em,
      local: linha.local || "",
      diaInteiro: Boolean(linha.dia_inteiro),
      status: linha.concluido ? "CONCLUIDO" : "ABERTO",
      origemId: linha.id,
      visibilidade: linha.visibilidade === "PUBLICO" ? "PUBLICO" : "PRIVADO",
      meu,
      aprovacaoStatus: linha.aprovacao_status === "PENDENTE" ? "PENDENTE" : "APROVADA",
    });
  }

  itens.sort((a, b) => a.iniciaEm.localeCompare(b.iniciaEm));
  return Response.json({ de, ate, itens });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const { comunidadeId, userId } = access.context;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }

  const titulo = String(corpo.titulo || "").trim().slice(0, 140);
  const iniciaEm = String(corpo.iniciaEm || "").trim();
  if (!titulo) {
    return Response.json({ error: "Dê um título ao compromisso." }, { status: 400 });
  }
  if (!iniciaEm || Number.isNaN(Date.parse(iniciaEm))) {
    return Response.json({ error: "Informe uma data e hora válidas." }, { status: 400 });
  }
  const terminaEmBruto = String(corpo.terminaEm || "").trim();
  if (terminaEmBruto && Number.isNaN(Date.parse(terminaEmBruto))) {
    return Response.json({ error: "O término informado não é uma data válida." }, { status: 400 });
  }
  if (terminaEmBruto && Date.parse(terminaEmBruto) < Date.parse(iniciaEm)) {
    return Response.json({ error: "O término não pode ser antes do início." }, { status: 400 });
  }
  const categoria = String(corpo.categoria || "PESSOAL").toUpperCase();

  const db = getD1();
  const publico = corpo.visibilidade === "PUBLICO";
  const canApprove = access.context.permissions.includes("events.manage") || access.user.system_owner === true;
  const approvalStatus = publico && !canApprove ? "PENDENTE" : "APROVADA";
  const criado = await db
    .prepare(
      `INSERT INTO agenda_compromissos
        (comunidade_id, usuario_id, titulo, descricao, categoria, inicia_em,
         termina_em, local, dia_inteiro, visibilidade, aprovacao_status,
         aprovado_por, aprovado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN ? = 'APROVADA' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING id`,
    )
    .bind(
      comunidadeId,
      userId,
      titulo,
      String(corpo.descricao || "").trim().slice(0, 1000),
      CATEGORIAS_PESSOAIS.has(categoria) ? categoria : "PESSOAL",
      new Date(iniciaEm).toISOString(),
      terminaEmBruto ? new Date(terminaEmBruto).toISOString() : null,
      String(corpo.local || "").trim().slice(0, 180),
      corpo.diaInteiro ? 1 : 0,
      publico ? "PUBLICO" : "PRIVADO",
      approvalStatus,
      approvalStatus === "APROVADA" ? userId : null,
      approvalStatus,
    )
    .first<{ id: number }>();

  if (criado?.id && approvalStatus === "PENDENTE") {
    const managers = await db.prepare(
      `SELECT DISTINCT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         AND (uc.papel IN ('PASTOR','ADMIN_COMUNIDADE') OR u.perfil = 'ADMIN')`,
    ).bind(comunidadeId).all<{ id: number }>();
    await Promise.all(managers.results.filter((item) => item.id !== userId).map((item) => notifyUser(db, {
      userId: item.id, title: "Compromisso aguardando aprovação", message: `${access.user.nome} solicitou publicação de “${titulo}” na agenda.`, entityId: criado.id,
      destination: "/painel?view=eventos", createdBy: "VÍNKULO",
    })));
  }
  return Response.json({ id: criado?.id, aprovacaoStatus: approvalStatus, message: approvalStatus === "PENDENTE" ? "Enviado ao responsável da comunidade para aprovação." : "Compromisso salvo." }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  if (!access.context.permissions.includes("events.manage") && access.user.system_owner !== true) {
    return Response.json({ error: "Somente o responsável da comunidade pode aprovar." }, { status: 403 });
  }
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0 || String(body.acao || "").toUpperCase() !== "APROVAR") {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  const db = getD1();
  const item = await db.prepare("SELECT usuario_id, titulo FROM agenda_compromissos WHERE id = ? AND comunidade_id = ? AND aprovacao_status = 'PENDENTE'").bind(id, access.context.comunidadeId).first<{ usuario_id:number; titulo:string }>();
  if (!item) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  await db.prepare("UPDATE agenda_compromissos SET aprovacao_status = 'APROVADA', aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(access.user.id, id, access.context.comunidadeId).run();
  if (item.usuario_id !== access.user.id) await notifyUser(db, { userId:item.usuario_id, title:"Compromisso aprovado", message:`“${item.titulo}” foi liberado na agenda da comunidade.`, entityId:id, destination:"/painel?view=eventos", createdBy:"VÍNKULO" });
  return Response.json({ ok:true });
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const { comunidadeId, userId } = access.context;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Compromisso não informado." }, { status: 400 });
  }
  // O escopo por usuário e comunidade é o que impede apagar item de outra pessoa.
  const resultado = await getD1()
    .prepare(
      `DELETE FROM agenda_compromissos
       WHERE id = ? AND comunidade_id = ? AND usuario_id = ?`,
    )
    .bind(id, comunidadeId, userId)
    .run();
  if (!resultado.meta.changes) {
    return Response.json({ error: "Compromisso não encontrado." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
