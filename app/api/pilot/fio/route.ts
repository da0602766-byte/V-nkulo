import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

// O Fio do dia é uma leitura de várias fontes que já existem, ordenada pela
// hora em que cada coisa aconteceu. Só os registros manuais nascem aqui — o
// que o sistema não capta sozinho, como uma visita pastoral ou um imprevisto.

const CAMADAS = ["CULTOS", "PESSOAS", "OPERACAO", "CUIDADO"] as const;
const VISIBILIDADES = ["COMUNIDADE", "LIDERANCA", "PASTORAL"] as const;
type Camada = (typeof CAMADAS)[number];
type Visibilidade = (typeof VISIBILIDADES)[number];

const MAX_ITENS = 200;
const MAX_TITULO = 160;
const MAX_DETALHE = 900;

type ItemFio = {
  id: string;
  camada: Camada;
  titulo: string;
  detalhe: string;
  ocorreEm: string;
  origem: string;
  origemId: number;
  manual: boolean;
  autor?: string;
};

// A janela é sempre um dia civil. Sem isso a consulta viraria varredura da
// tabela inteira assim que a comunidade tivesse algum histórico.
function dia(url: URL) {
  const bruto = url.searchParams.get("dia");
  const base = bruto && !Number.isNaN(Date.parse(bruto))
    ? new Date(bruto)
    : new Date();
  const inicio = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
  );
  const fim = new Date(inicio.getTime() + 86400000 - 1000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function normalizarCamada(valor: unknown): Camada {
  const candidato = String(valor || "").toUpperCase();
  return (CAMADAS as readonly string[]).includes(candidato)
    ? (candidato as Camada)
    : "PESSOAS";
}

function normalizarVisibilidade(valor: unknown): Visibilidade {
  const candidato = String(valor || "").toUpperCase();
  return (VISIBILIDADES as readonly string[]).includes(candidato)
    ? (candidato as Visibilidade)
    : "LIDERANCA";
}

// Quem lê o quê. Um registro marcado para a pastoral não aparece para a
// liderança comum, e o de liderança não aparece para membro — a filtragem é
// feita no SQL, não na interface, para não depender de botão escondido.
function visibilidadesVisiveis(permissions: string[]): Visibilidade[] {
  const visiveis: Visibilidade[] = ["COMUNIDADE"];
  if (permissions.includes("people.view") || permissions.includes("leadership.panel.view")) {
    visiveis.push("LIDERANCA");
  }
  if (
    permissions.includes("pastoral.panel.view") ||
    permissions.includes("community.admin.view")
  ) {
    visiveis.push("PASTORAL");
  }
  return visiveis;
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const { comunidadeId, userId, permissions } = access.context;
  const { inicio, fim } = dia(new URL(request.url));
  const db = getD1();
  const itens: ItemFio[] = [];

  // Cultos e encontros do dia.
  if (permissions.includes("events.view")) {
    const eventos = await db
      .prepare(
        `SELECT id, titulo, descricao, local, inicia_em
         FROM eventos_comunidade
         WHERE comunidade_id = ?
           AND datetime(inicia_em) BETWEEN datetime(?) AND datetime(?)
         ORDER BY datetime(inicia_em) ASC
         LIMIT ?`,
      )
      .bind(comunidadeId, inicio, fim, MAX_ITENS)
      .all<{ id: number; titulo: string; descricao: string; local: string; inicia_em: string }>();
    for (const linha of eventos.results || []) {
      itens.push({
        id: `evento-${linha.id}`,
        camada: "CULTOS",
        titulo: linha.titulo,
        detalhe: linha.local || linha.descricao || "",
        ocorreEm: linha.inicia_em,
        origem: "Evento",
        origemId: linha.id,
        manual: false,
      });
    }
  }

  // Escalas em que esta pessoa foi designada.
  const escalas = await db
    .prepare(
      `SELECT e.id, e.titulo, e.local, e.inicia_em, d.funcao, d.status
       FROM escala_designacoes d
       JOIN escalas_ministerio e ON e.id = d.escala_id
       WHERE d.comunidade_id = ?
         AND d.usuario_id = ?
         AND d.ativo = 1
         AND datetime(e.inicia_em) BETWEEN datetime(?) AND datetime(?)
       ORDER BY datetime(e.inicia_em) ASC
       LIMIT ?`,
    )
    .bind(comunidadeId, userId, inicio, fim, MAX_ITENS)
    .all<{ id: number; titulo: string; local: string; inicia_em: string; funcao: string; status: string }>();
  for (const linha of escalas.results || []) {
    itens.push({
      id: `escala-${linha.id}`,
      camada: "CULTOS",
      titulo: linha.titulo,
      detalhe: [linha.funcao, linha.local].filter(Boolean).join(" · "),
      ocorreEm: linha.inicia_em,
      origem: "Escala",
      origemId: linha.id,
      manual: false,
    });
  }

  // Visitantes recebidos no dia, agrupados: quatorze linhas iguais não são
  // catorze acontecimentos, são um só.
  if (permissions.includes("visitors.view")) {
    const visitantes = await db
      .prepare(
        `SELECT COUNT(*) AS total, MIN(criado_em) AS primeiro
         FROM visitantes
         WHERE comunidade_id = ?
           AND ativo = 1
           AND escopo_confirmado = 1
           AND datetime(criado_em) BETWEEN datetime(?) AND datetime(?)`,
      )
      .bind(comunidadeId, inicio, fim)
      .first<{ total: number; primeiro: string | null }>();
    const total = Number(visitantes?.total || 0);
    if (total > 0 && visitantes?.primeiro) {
      itens.push({
        id: "visitantes-do-dia",
        camada: "PESSOAS",
        titulo: total === 1 ? "1 visitante recebido" : `${total} visitantes recebidos`,
        detalhe: "Abrir a lista para acompanhar o contato",
        ocorreEm: visitantes.primeiro,
        origem: "Visitantes",
        origemId: 0,
        manual: false,
      });
    }
  }

  // Pedidos abertos no dia — só a contagem, nunca o corpo. O que é
  // confidencial não vaza para o fio de quem não pode abrir o pedido.
  const pedidos = await db
    .prepare(
      `SELECT COUNT(*) AS total, MIN(criado_em) AS primeiro
       FROM solicitacoes_comunidade
       WHERE comunidade_id = ?
         AND datetime(criado_em) BETWEEN datetime(?) AND datetime(?)`,
    )
    .bind(comunidadeId, inicio, fim)
    .first<{ total: number; primeiro: string | null }>();
  const totalPedidos = Number(pedidos?.total || 0);
  if (totalPedidos > 0 && pedidos?.primeiro) {
    itens.push({
      id: "pedidos-do-dia",
      camada: "CUIDADO",
      titulo: totalPedidos === 1 ? "1 pedido recebido" : `${totalPedidos} pedidos recebidos`,
      detalhe: "Abrir a triagem para ver o que precisa de resposta",
      ocorreEm: pedidos.primeiro,
      origem: "Pedidos",
      origemId: 0,
      manual: false,
    });
  }

  // Publicações do mural.
  const publicacoes = await db
    .prepare(
      `SELECT id, titulo, criado_em
       FROM publicacoes_piloto
       WHERE comunidade_id = ?
         AND status = 'PUBLICADA'
         AND datetime(criado_em) BETWEEN datetime(?) AND datetime(?)
       ORDER BY datetime(criado_em) ASC
       LIMIT 20`,
    )
    .bind(comunidadeId, inicio, fim)
    .all<{ id: number; titulo: string; criado_em: string }>();
  for (const linha of publicacoes.results || []) {
    itens.push({
      id: `publicacao-${linha.id}`,
      camada: "PESSOAS",
      titulo: linha.titulo,
      detalhe: "Publicado no mural",
      ocorreEm: linha.criado_em,
      origem: "Mural",
      origemId: linha.id,
      manual: false,
    });
  }

  // Registros manuais, respeitando a visibilidade de cada um.
  const visiveis = visibilidadesVisiveis(permissions);
  const marcadores = visiveis.map(() => "?").join(",");
  const registros = await db
    .prepare(
      `SELECT f.id, f.camada, f.titulo, f.detalhe, f.ocorre_em, u.nome AS autor
       FROM fio_registros f
       LEFT JOIN usuarios u ON u.id = f.autor_usuario_id
       WHERE f.comunidade_id = ?
         AND f.ativo = 1
         AND f.visibilidade IN (${marcadores})
         AND datetime(f.ocorre_em) BETWEEN datetime(?) AND datetime(?)
       ORDER BY datetime(f.ocorre_em) ASC
       LIMIT ?`,
    )
    .bind(comunidadeId, ...visiveis, inicio, fim, MAX_ITENS)
    .all<{
      id: number; camada: string; titulo: string; detalhe: string;
      ocorre_em: string; autor: string | null;
    }>();
  for (const linha of registros.results || []) {
    itens.push({
      id: `fio-${linha.id}`,
      camada: normalizarCamada(linha.camada),
      titulo: linha.titulo,
      detalhe: linha.detalhe || "",
      ocorreEm: linha.ocorre_em,
      origem: "Registro",
      origemId: linha.id,
      manual: true,
      autor: linha.autor || undefined,
    });
  }

  itens.sort(
    (esquerda, direita) =>
      Date.parse(esquerda.ocorreEm) - Date.parse(direita.ocorreEm),
  );
  return Response.json({ ok: true, dia: inicio, itens: itens.slice(0, MAX_ITENS) });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const { comunidadeId, userId } = access.context;
  const db = getD1();

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }

  const titulo = String(corpo.titulo || "").trim().slice(0, MAX_TITULO);
  if (!titulo) {
    return Response.json(
      { error: "Escreva um título para o registro." },
      { status: 400 },
    );
  }
  const detalhe = String(corpo.detalhe || "").trim().slice(0, MAX_DETALHE);
  const camada = normalizarCamada(corpo.camada);
  const visibilidade = normalizarVisibilidade(corpo.visibilidade);
  const bruto = String(corpo.ocorreEm || "");
  const ocorreEm = bruto && !Number.isNaN(Date.parse(bruto))
    ? new Date(bruto).toISOString()
    : new Date().toISOString();

  const inserido = await db
    .prepare(
      `INSERT INTO fio_registros
        (comunidade_id, autor_usuario_id, camada, titulo, detalhe, ocorre_em, visibilidade)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(comunidadeId, userId, camada, titulo, detalhe, ocorreEm, visibilidade)
    .first<{ id: number }>();

  await recordTenantAudit(
    db,
    access.context,
    userId,
    "FIO_REGISTRO_CRIADO",
    "SUCESSO",
    { registroId: inserido?.id, camada, visibilidade },
  );

  return Response.json({
    ok: true,
    id: inserido?.id,
    message: "Registro adicionado ao fio do dia.",
  });
}
