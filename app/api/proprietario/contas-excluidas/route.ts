// Registro administrativo de contas excluídas.
//
// Por privacidade, este endpoint NUNCA devolve nome, e-mail ou qualquer dado
// pessoal da conta excluída: só a referência técnica (identificador opaco),
// a comunidade, a data, o motivo administrativo e a janela de restauração.

import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";

async function owner() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  if (!user.ativo || !user.system_owner)
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  return { user } as const;
}

async function audit(
  db: ReturnType<typeof getD1>,
  userId: number,
  event: string,
  comunidadeId: number | null,
  metadata: Record<string, unknown>,
) {
  await db
    .prepare(
      "INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (?, ?, ?, 'SUCESSO', ?)",
    )
    .bind(comunidadeId, userId, event, JSON.stringify(metadata))
    .run();
}

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

type Row = {
  id: number;
  referencia_tecnica: string;
  comunidade_id: number | null;
  comunidade_nome: string | null;
  perfil: string;
  motivo: string;
  origem: string;
  excluido_em: string;
  restauravel_ate: string | null;
  restaurado_em: string | null;
  purgado_em: string | null;
  restauravel: number;
};

const SELECT = `SELECT e.id, e.referencia_tecnica, e.comunidade_id, e.perfil, e.motivo, e.origem,
    e.excluido_em, e.restauravel_ate, e.restaurado_em, e.purgado_em,
    c.nome AS comunidade_nome,
    CASE WHEN e.purgado_em IS NULL AND e.restaurado_em IS NULL
              AND e.restauravel_ate IS NOT NULL
              AND datetime(e.restauravel_ate) > CURRENT_TIMESTAMP
         THEN 1 ELSE 0 END AS restauravel
  FROM contas_excluidas e
  LEFT JOIN comunidades c ON c.id = e.comunidade_id`;

function view(row: Row) {
  return {
    id: Number(row.id),
    referenciaTecnica: row.referencia_tecnica,
    comunidade: row.comunidade_nome || "Sem comunidade vinculada",
    comunidadeId: row.comunidade_id == null ? null : Number(row.comunidade_id),
    perfil: row.perfil || "",
    motivo: row.motivo || "",
    origem: row.origem || "",
    excluidoEm: row.excluido_em,
    restauravelAte: row.restauravel_ate,
    restauradoEm: row.restaurado_em,
    purgadoEm: row.purgado_em,
    restauravel: Number(row.restauravel) === 1,
  };
}

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();
  const rows = await db
    .prepare(`${SELECT} ORDER BY datetime(e.excluido_em) DESC, e.id DESC LIMIT 300`)
    .all<Row>();
  const accounts = rows.results.map(view);
  return Response.json(
    {
      total: accounts.length,
      restauraveis: accounts.filter((item) => item.restauravel).length,
      purgadas: accounts.filter((item) => item.purgadoEm).length,
      restauradas: accounts.filter((item) => item.restauradoEm).length,
      accounts,
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const recordId = id(body.id);
  if (!recordId) return Response.json({ error: "Registro inválido." }, { status: 400 });
  const action = clean(body.action, 20).toUpperCase();
  const motivo = clean(body.motivo, 500);
  const db = getD1();
  const current = await db.prepare(`${SELECT} WHERE e.id = ? LIMIT 1`).bind(recordId).first<Row>();
  if (!current) return Response.json({ error: "Registro não encontrado." }, { status: 404 });
  const comunidadeId = current.comunidade_id == null ? null : Number(current.comunidade_id);

  if (action === "RESTORE") {
    if (current.purgado_em)
      return Response.json(
        { error: "Este registro já foi purgado e não pode ser restaurado." },
        { status: 409 },
      );
    if (current.restaurado_em)
      return Response.json({ error: "Esta conta já foi restaurada." }, { status: 409 });
    if (Number(current.restauravel) !== 1)
      return Response.json(
        { error: "A janela de restauração desta conta já terminou." },
        { status: 409 },
      );
    await db
      .prepare(
        "UPDATE contas_excluidas SET restaurado_em = CURRENT_TIMESTAMP, restaurado_por = ? WHERE id = ? AND purgado_em IS NULL AND restaurado_em IS NULL AND datetime(restauravel_ate) > CURRENT_TIMESTAMP",
      )
      .bind(access.user.id, recordId)
      .run();
    await audit(db, access.user.id, "CONTA_EXCLUIDA_RESTAURADA", comunidadeId, {
      recordId,
      referenciaTecnica: current.referencia_tecnica,
      motivo,
    });
    return Response.json({ ok: true });
  }

  if (action === "PURGE") {
    if (current.purgado_em)
      return Response.json({ error: "Este registro já foi purgado." }, { status: 409 });
    await db
      .prepare("UPDATE contas_excluidas SET purgado_em = CURRENT_TIMESTAMP WHERE id = ? AND purgado_em IS NULL")
      .bind(recordId)
      .run();
    await audit(db, access.user.id, "CONTA_EXCLUIDA_PURGADA", comunidadeId, {
      recordId,
      referenciaTecnica: current.referencia_tecnica,
      motivo,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação não reconhecida." }, { status: 400 });
}
