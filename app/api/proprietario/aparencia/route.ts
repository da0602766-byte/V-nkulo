import { getD1 } from "../../../../db";
import {
  COMMUNITY_PALETTES,
  parseCommunityTheme,
  type CommunityTheme,
} from "../../../lib/community-theme";
import { getSessionUser } from "../../../lib/local-auth";

type CommunityRow = {
  id: number;
  nome: string;
  cidade_publica: string | null;
  status: string;
  tema: string | null;
};

async function requireOwner() {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  }
  if (!user.ativo || !user.system_owner) {
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

function parseJson(value?: string | null) {
  try {
    return value ? (JSON.parse(value) as Partial<CommunityTheme>) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const access = await requireOwner();
  if ("error" in access) return access.error;
  const db = getD1();
  const rows = await db
    .prepare(
      `SELECT id, nome, cidade_publica, status,
        (SELECT cfg.valor FROM configuracoes cfg
          WHERE cfg.chave = 'community_theme:' || comunidades.id LIMIT 1) AS tema
       FROM comunidades ORDER BY nome LIMIT 500`,
    )
    .all<CommunityRow>();
  const communities = rows.results.map((row) => ({
    id: row.id,
    nome: row.nome,
    cidadePublica: row.cidade_publica || "",
    status: row.status,
    tema: parseCommunityTheme(parseJson(row.tema)),
  }));
  return Response.json(
    { communities, palettes: COMMUNITY_PALETTES },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireOwner();
  if ("error" in access) return access.error;
  let payload: {
    scope?: string;
    communityId?: number;
    theme?: Partial<CommunityTheme>;
    fields?: string[];
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  const scope = String(payload.scope || "").toUpperCase();
  if (!["TODAS", "UNICA"].includes(scope)) {
    return Response.json({ error: "Escolha aplicar a todas ou a uma comunidade." }, { status: 400 });
  }
  const db = getD1();

  if (scope === "UNICA") {
    const communityId = Number(payload.communityId || 0);
    if (!Number.isInteger(communityId) || communityId <= 0) {
      return Response.json({ error: "Selecione uma comunidade." }, { status: 400 });
    }
    const community = await db
      .prepare("SELECT id, nome FROM comunidades WHERE id = ? LIMIT 1")
      .bind(communityId)
      .first<{ id: number; nome: string }>();
    if (!community) {
      return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    }
    const theme = parseCommunityTheme(payload.theme);
    await db.batch([
      db
        .prepare(
          `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(chave) DO UPDATE SET
             valor = excluded.valor,
             atualizado_por = excluded.atualizado_por,
             atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(`community_theme:${communityId}`, JSON.stringify(theme), String(access.user.id)),
      db
        .prepare(
          `INSERT INTO auditoria_piloto
           (comunidade_id, usuario_id, evento, resultado, metadados)
           VALUES (?, ?, 'APARENCIA_COMUNIDADE_ATUALIZADA_PELO_PROPRIETARIO', 'SUCESSO', ?)`,
        )
        .bind(communityId, access.user.id, JSON.stringify({ comunidadeNome: community.nome, tema: theme })),
    ]);
    return Response.json({ ok: true, communityId, theme });
  }

  // scope === "TODAS": aplica a paleta a todas as comunidades de uma vez.
  // Logotipo, banner e papel de parede continuam próprios de cada comunidade
  // e não são sobrescritos aqui — evita apagar a identidade visual de cada
  // igreja sem intenção.
  const requestedPaletteId = String(payload.theme?.paletteId || "").toUpperCase();
  const palette = COMMUNITY_PALETTES.find((item) => item.id === requestedPaletteId);
  if (!palette) {
    return Response.json({ error: "Escolha uma paleta válida." }, { status: 400 });
  }
  const paletteId = palette.id;
  const rows = await db
    .prepare(
      `SELECT id,
        (SELECT cfg.valor FROM configuracoes cfg
          WHERE cfg.chave = 'community_theme:' || comunidades.id LIMIT 1) AS tema
       FROM comunidades`,
    )
    .all<{ id: number; tema: string | null }>();
  const communities = rows.results;
  if (!communities.length) {
    return Response.json({ error: "Nenhuma comunidade cadastrada ainda." }, { status: 409 });
  }
  const writes = communities.map((community) => {
    const current = parseCommunityTheme(parseJson(community.tema));
    const theme = parseCommunityTheme({ ...current, paletteId });
    return db
      .prepare(
        `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(chave) DO UPDATE SET
           valor = excluded.valor,
           atualizado_por = excluded.atualizado_por,
           atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(`community_theme:${community.id}`, JSON.stringify(theme), String(access.user.id));
  });
  writes.push(
    db
      .prepare(
        `INSERT INTO auditoria_piloto
         (comunidade_id, usuario_id, evento, resultado, metadados)
         VALUES (NULL, ?, 'APARENCIA_APLICADA_A_TODAS_COMUNIDADES', 'SUCESSO', ?)`,
      )
      .bind(access.user.id, JSON.stringify({ paletteId, comunidades: communities.length })),
  );
  await db.batch(writes);
  return Response.json({ ok: true, paletteId, comunidades: communities.length });
}
