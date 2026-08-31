import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import type { TenantContext } from "../../../lib/tenant";
import {
  assuntoValido,
  chaveDoAssunto,
  parseAlvo,
  podeReverter,
  type EnsaioAlvo,
  type EnsaioAssunto,
} from "../../../lib/platform-rehearsal";

const semCache = { headers: { "Cache-Control": "no-store" } };

type EnsaioRow = {
  id: number;
  assunto: string;
  titulo: string;
  valor_json: string;
  estado: string;
  alvo_tipo: string;
  alvo_json: string;
  observacao: string;
  criado_em: string;
  publicado_em: string | null;
  revertido_em: string | null;
  comunidades_afetadas: number;
  criado_por_nome: string | null;
  publicado_por_nome: string | null;
};

/* Toda escrita aqui pode atingir a plataforma inteira, então exige as duas
 * coisas: a permissão de administração e a conta de proprietário do sistema.
 * A permissão sozinha não basta — ela existe para leitura. */
async function exigirProprietario() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access;
  if (!access.user.system_owner) {
    return {
      error: Response.json(
        { error: "Somente o proprietário pode ensaiar e publicar configurações." },
        { status: 403 },
      ),
    } as const;
  }
  return access;
}

async function comunidadesAlvo(alvo: EnsaioAlvo) {
  const db = getD1();
  if (alvo.tipo === "TODAS") {
    const { results } = await db
      .prepare("SELECT id, nome FROM comunidades WHERE status = 'ATIVA' ORDER BY nome")
      .all<{ id: number; nome: string }>();
    return results;
  }
  if (!alvo.ids.length) return [];
  const marcadores = alvo.ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, nome FROM comunidades
       WHERE status = 'ATIVA' AND id IN (${marcadores}) ORDER BY nome`,
    )
    .bind(...alvo.ids)
    .all<{ id: number; nome: string }>();
  return results;
}

export async function GET() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  const db = getD1();

  const [{ results: ensaios }, { results: comunidades }] = await Promise.all([
    db
      .prepare(
        `SELECT e.id, e.assunto, e.titulo, e.valor_json, e.estado, e.alvo_tipo,
                e.alvo_json, e.observacao, e.criado_em, e.publicado_em,
                e.revertido_em, e.comunidades_afetadas,
                autor.nome AS criado_por_nome,
                publicador.nome AS publicado_por_nome
         FROM plataforma_ensaios e
         LEFT JOIN usuarios autor ON autor.id = e.criado_por_usuario_id
         LEFT JOIN usuarios publicador ON publicador.id = e.publicado_por_usuario_id
         ORDER BY e.id DESC LIMIT 40`,
      )
      .all<EnsaioRow>(),
    db
      .prepare("SELECT id, nome FROM comunidades WHERE status = 'ATIVA' ORDER BY nome")
      .all<{ id: number; nome: string }>(),
  ]);

  /* Só o último publicado de cada assunto é reversível: reverter um anterior
   * apagaria o que veio depois. */
  const ultimoPublicado = new Map<string, number>();
  for (const linha of ensaios) {
    if (linha.estado === "PUBLICADO" && !ultimoPublicado.has(linha.assunto)) {
      ultimoPublicado.set(linha.assunto, linha.id);
    }
  }

  return Response.json(
    {
      ensaios: ensaios.map((linha) => ({
        ...linha,
        reversivel: podeReverter(linha, ultimoPublicado),
      })),
      comunidades,
      podeEditar: Boolean(access.user.system_owner),
    },
    semCache,
  );
}

export async function POST(request: Request) {
  const access = await exigirProprietario();
  if ("error" in access) return access.error;
  const db = getD1();
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const assunto = corpo.assunto;
  if (!assuntoValido(assunto)) {
    return Response.json({ error: "Assunto inválido." }, { status: 400 });
  }
  const titulo = String(corpo.titulo || "").trim().slice(0, 120);
  if (!titulo) {
    return Response.json({ error: "Dê um nome ao ensaio." }, { status: 400 });
  }
  const valor = corpo.valor;
  if (valor === undefined || valor === null) {
    return Response.json({ error: "O ensaio precisa de um valor." }, { status: 400 });
  }
  const alvo = parseAlvo(corpo.alvoTipo, corpo.alvoIds);
  if (alvo.tipo === "ESPECIFICAS" && !alvo.ids.length) {
    return Response.json(
      { error: "Escolha ao menos uma comunidade ou publique para todas." },
      { status: 400 },
    );
  }

  const criado = await db
    .prepare(
      `INSERT INTO plataforma_ensaios
        (assunto, titulo, valor_json, estado, alvo_tipo, alvo_json, observacao,
         criado_por_usuario_id)
       VALUES (?, ?, ?, 'RASCUNHO', ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      assunto,
      titulo,
      JSON.stringify(valor),
      alvo.tipo,
      JSON.stringify(alvo.tipo === "ESPECIFICAS" ? alvo.ids : []),
      String(corpo.observacao || "").trim().slice(0, 400),
      access.user.id,
    )
    .first<{ id: number }>();

  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PLATAFORMA_ENSAIO_CRIADO",
    "SUCESSO",
    { ensaioId: criado?.id, assunto, alvo: alvo.tipo },
  );

  return Response.json({ id: criado?.id }, semCache);
}

export async function PATCH(request: Request) {
  const access = await exigirProprietario();
  if ("error" in access) return access.error;
  const db = getD1();
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(corpo.id);
  const acao = String(corpo.acao || "");

  const ensaio = await db
    .prepare(
      `SELECT id, assunto, titulo, valor_json, estado, alvo_tipo, alvo_json,
              anterior_json
       FROM plataforma_ensaios WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{
      id: number;
      assunto: string;
      titulo: string;
      valor_json: string;
      estado: string;
      alvo_tipo: string;
      alvo_json: string;
      anterior_json: string;
    }>();
  if (!ensaio) {
    return Response.json({ error: "Ensaio não encontrado." }, { status: 404 });
  }

  if (acao === "PUBLICAR") return publicar(ensaio, access.context, access.user.id);
  if (acao === "REVERTER") return reverter(ensaio, access.context, access.user.id);
  return Response.json({ error: "Ação desconhecida." }, { status: 400 });
}

async function publicar(
  ensaio: {
    id: number;
    assunto: string;
    titulo: string;
    valor_json: string;
    estado: string;
    alvo_tipo: string;
    alvo_json: string;
  },
  context: TenantContext,
  usuarioId: number,
) {
  if (ensaio.estado !== "RASCUNHO") {
    return Response.json(
      { error: "Só um rascunho pode ser publicado." },
      { status: 409 },
    );
  }
  const db = getD1();
  const alvo = parseAlvo(ensaio.alvo_tipo, ensaio.alvo_json);
  const comunidades = await comunidadesAlvo(alvo);
  if (!comunidades.length) {
    return Response.json(
      { error: "Nenhuma comunidade ativa no alvo escolhido." },
      { status: 409 },
    );
  }

  /* O retrato do "antes", comunidade por comunidade. É gravado no mesmo lote
   * da publicação: se a escrita falhar, não fica um ensaio publicado sem como
   * voltar. Uma comunidade que ainda não tinha valor entra como null, e a
   * reversão apaga a chave em vez de escrever "null". */
  const anterior: Record<string, string | null> = {};
  const comandos = [];
  for (const comunidade of comunidades) {
    const chave = chaveDoAssunto(ensaio.assunto as EnsaioAssunto, comunidade.id);
    const atual = await db
      .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
      .bind(chave)
      .first<{ valor: string }>();
    anterior[chave] = atual ? atual.valor : null;
    comandos.push(
      db
        .prepare(
          `INSERT INTO configuracoes (chave, valor, atualizado_por)
           VALUES (?, ?, ?)
           ON CONFLICT(chave) DO UPDATE SET
             valor = excluded.valor,
             atualizado_por = excluded.atualizado_por,
             atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(chave, ensaio.valor_json, `ensaio:${ensaio.id}`),
    );
  }

  comandos.push(
    db
      .prepare(
        `UPDATE plataforma_ensaios
         SET estado = 'PUBLICADO', anterior_json = ?, publicado_por_usuario_id = ?,
             publicado_em = CURRENT_TIMESTAMP, comunidades_afetadas = ?
         WHERE id = ?`,
      )
      .bind(JSON.stringify(anterior), usuarioId, comunidades.length, ensaio.id),
  );

  await db.batch(comandos);
  await recordTenantAudit(
    db,
    context,
    usuarioId,
    "PLATAFORMA_ENSAIO_PUBLICADO",
    "SUCESSO",
    { ensaioId: ensaio.id, assunto: ensaio.assunto, comunidades: comunidades.length },
  );

  return Response.json(
    { publicado: true, comunidades: comunidades.length },
    semCache,
  );
}

async function reverter(
  ensaio: { id: number; assunto: string; estado: string; anterior_json: string },
  context: TenantContext,
  usuarioId: number,
) {
  if (ensaio.estado !== "PUBLICADO") {
    return Response.json(
      { error: "Só um ensaio publicado pode ser revertido." },
      { status: 409 },
    );
  }
  const db = getD1();

  /* Reverter um ensaio que não é o último do assunto apagaria o que veio
   * depois. A checagem é feita aqui, e não só na interface, porque a interface
   * pode estar olhando uma lista de trinta segundos atrás. */
  const ultimo = await db
    .prepare(
      `SELECT id FROM plataforma_ensaios
       WHERE assunto = ? AND estado = 'PUBLICADO'
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(ensaio.assunto)
    .first<{ id: number }>();
  if (Number(ultimo?.id) !== Number(ensaio.id)) {
    return Response.json(
      {
        error:
          "Outro ensaio deste assunto foi publicado depois. Reverta o mais recente primeiro.",
      },
      { status: 409 },
    );
  }

  let anterior: Record<string, string | null> = {};
  try {
    anterior = JSON.parse(ensaio.anterior_json || "{}") as Record<string, string | null>;
  } catch {
    return Response.json(
      { error: "O retrato anterior está ilegível; a reversão automática não é segura." },
      { status: 409 },
    );
  }

  const comandos = Object.entries(anterior).map(([chave, valor]) =>
    valor === null
      ? db.prepare("DELETE FROM configuracoes WHERE chave = ?").bind(chave)
      : db
          .prepare(
            `INSERT INTO configuracoes (chave, valor, atualizado_por)
             VALUES (?, ?, ?)
             ON CONFLICT(chave) DO UPDATE SET
               valor = excluded.valor,
               atualizado_por = excluded.atualizado_por,
               atualizado_em = CURRENT_TIMESTAMP`,
          )
          .bind(chave, valor, `reversao:${ensaio.id}`),
  );
  comandos.push(
    db
      .prepare(
        `UPDATE plataforma_ensaios
         SET estado = 'REVERTIDO', revertido_em = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(ensaio.id),
  );

  await db.batch(comandos);
  await recordTenantAudit(
    db,
    context,
    usuarioId,
    "PLATAFORMA_ENSAIO_REVERTIDO",
    "SUCESSO",
    { ensaioId: ensaio.id, assunto: ensaio.assunto, chaves: Object.keys(anterior).length },
  );

  return Response.json(
    { revertido: true, chaves: Object.keys(anterior).length },
    semCache,
  );
}

export async function DELETE(request: Request) {
  const access = await exigirProprietario();
  if ("error" in access) return access.error;
  const db = getD1();
  const id = Number(new URL(request.url).searchParams.get("id"));

  /* Só rascunho se apaga. Um ensaio publicado é registro do que aconteceu com
   * as comunidades, e apagá-lo levaria junto o retrato que permite reverter. */
  const alterado = await db
    .prepare("DELETE FROM plataforma_ensaios WHERE id = ? AND estado = 'RASCUNHO'")
    .bind(id)
    .run();
  if (!alterado.meta.changes) {
    return Response.json(
      { error: "Só rascunhos podem ser descartados." },
      { status: 409 },
    );
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PLATAFORMA_ENSAIO_DESCARTADO",
    "SUCESSO",
    { ensaioId: id },
  );
  return Response.json({ descartado: true }, semCache);
}
