import { getD1 } from "../../../../db";
import { rejectDisabledOffline } from "../../../lib/android-offline-policy";
import { getCurrentSessionTokenHash } from "../../../lib/local-auth";
import { requireTenantPermission } from "../../../lib/tenant";
import { communityThemeStyle, parseCommunityTheme } from "../../../lib/community-theme";

const reply = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store, private", Vary: "Cookie, Origin" },
});
const MAX_BYTES = 1024 * 1024;
const LIMIT = 100;

// Protocol 2 is a complete, bounded replacement, never an incremental merge.
// Only the native HTTPS client can install it in encrypted storage. It is not
// an API token. Protocol 1 remains unchanged for the previous APK.
export async function GET(request: Request) {
  const blocked = await rejectDisabledOffline();
  if (blocked) return blocked;
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ error: "Origem inválida." }, 403);
  }
  const challenge = request.headers.get("x-vinkulo-challenge") || "";
  const client = request.headers.get("x-vinkulo-client");
  const extended = client === "android-read-3";
  const requestsOptIn = extended && request.headers.get("x-vinkulo-requests") === "own";
  if (!/^[a-f0-9]{64}$/.test(challenge) || (!extended && client !== "android-read-2")) {
    return reply({ error: "Versão de consulta incompatível." }, 400);
  }
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return reply({ error: "Entre novamente para atualizar este aparelho." }, access.error.status);
  if (!access.user.ativo || access.context.temporaryAccess || access.context.communityAccess === "FEED_ONLY") {
    return reply({ error: "Este acesso precisa de conexão." }, 403);
  }
  const db = getD1();
  const hash = await getCurrentSessionTokenHash();
  if (!hash) return reply({ error: "Sessão expirada." }, 401);
  const session = await db.prepare(
    "SELECT expira_em FROM sessoes WHERE usuario_id = ? AND token_hash = ? AND datetime(expira_em) > CURRENT_TIMESTAMP LIMIT 1",
  ).bind(access.user.id, hash).first<{ expira_em: string }>();
  const issuedAt = Date.now();
  const expiry = session?.expira_em || "";
  const sessionExpires = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(expiry) ? expiry : `${expiry.replace(" ", "T")}Z`);
  if (!Number.isFinite(sessionExpires) || sessionExpires <= issuedAt) return reply({ error: "Sessão expirada." }, 401);

  const { comunidadeId, permissions } = access.context;
  const userId = access.user.id;
  // Separate explicit consent. Recheck the same resource/plan gate as the
  // online workspace; being a recipient or manager never widens this copy.
  let ownRequestsAllowed = false;
  if (requestsOptIn) {
    const requestsAccess = await requireTenantPermission("dashboard.view", "requests");
    if ("error" in requestsAccess) {
      if (requestsAccess.error.status !== 403) return reply({ error: "Confira seu acesso novamente." }, requestsAccess.error.status);
    } else {
      if (requestsAccess.user.id !== userId || requestsAccess.context.comunidadeId !== comunidadeId
          || !requestsAccess.user.ativo || requestsAccess.context.temporaryAccess || requestsAccess.context.communityAccess === "FEED_ONLY") {
        return reply({ error: "O contexto de acesso mudou." }, 403);
      }
      ownRequestsAllowed = true;
    }
  }
  const from = new Date(issuedAt - 86400000).toISOString();
  const until = new Date(issuedAt + 30 * 86400000).toISOString();
  const sections = ["mural", "eventos", "compromissos", "escalas"] as const;
  const enabled = [permissions.includes("feed.view"), permissions.includes("events.view"), true, permissions.includes("schedules.view")];
  // Narrower than online: no drafts/moderation queue, registrants, team lists,
  // share tokens, profile photos, emails, attachments or another person's diary.
  // One D1 batch supplies a consistent set. No publishing/notification side effects.
  const queries = [
    db.prepare(`SELECT p.id, substr(p.titulo,1,200) AS titulo,
      substr(p.conteudo,1,6000) AS texto, strftime('%Y-%m-%dT%H:%M:%fZ',p.criado_em) AS data,
      substr(COALESCE(u.nome,''),1,160) AS autor
      FROM publicacoes_piloto p LEFT JOIN usuarios u ON u.id = p.criado_por
      WHERE p.comunidade_id = ? AND p.canal_feed = 1 AND p.status = 'PUBLICADA'
        AND (p.audiencia_tipo <> 'MINISTERIOS' OR ? = 1 OR EXISTS (
          SELECT 1 FROM json_each(p.ministerios_json) audiencia
          JOIN ministerio_voluntarios mv ON mv.ministerio_id = CAST(audiencia.value AS INTEGER)
          JOIN ministerios_comunidade m ON m.id = mv.ministerio_id AND m.comunidade_id = p.comunidade_id
          WHERE mv.usuario_id = ? AND mv.ativo = 1 AND mv.comunidade_id = p.comunidade_id
        )) AND ? = 1
      ORDER BY p.criado_em DESC, p.id DESC LIMIT 51`)
      .bind(comunidadeId, permissions.includes("feed.moderate") ? 1 : 0, userId, enabled[0] ? 1 : 0),
    db.prepare(`SELECT id, substr(titulo,1,200) AS titulo, substr(descricao,1,3000) AS texto,
      inicia_em AS data, termina_em AS fim, substr(local,1,300) AS local
      FROM eventos_comunidade WHERE comunidade_id = ? AND status = 'PUBLICADO'
        AND datetime(COALESCE(termina_em,inicia_em)) >= datetime(?) AND datetime(inicia_em) <= datetime(?) AND ? = 1
      ORDER BY datetime(inicia_em), id LIMIT ?`).bind(comunidadeId, from, until, enabled[1] ? 1 : 0, LIMIT + 1),
    db.prepare(`SELECT id, substr(titulo,1,200) AS titulo, substr(descricao,1,3000) AS texto,
      inicia_em AS data, termina_em AS fim, substr(local,1,300) AS local,
      dia_inteiro AS diaInteiro, concluido
      FROM agenda_compromissos WHERE comunidade_id = ? AND usuario_id = ?
        AND datetime(COALESCE(termina_em,inicia_em)) >= datetime(?) AND datetime(inicia_em) <= datetime(?)
      ORDER BY datetime(inicia_em), id LIMIT ?`).bind(comunidadeId, userId, from, until, LIMIT + 1),
    db.prepare(`SELECT d.id, s.id AS escalaId, substr(s.titulo,1,200) AS titulo,
      substr(d.funcao,1,200) AS texto, s.inicia_em AS data, s.termina_em AS fim,
      substr(s.local,1,300) AS local, substr(m.nome,1,160) AS ministerio, d.status AS resposta
      FROM escala_designacoes d
      JOIN escalas_ministerio s ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
      JOIN ministerios_comunidade m ON m.id = s.ministerio_id AND m.comunidade_id = s.comunidade_id
      WHERE d.comunidade_id = ? AND d.usuario_id = ? AND d.ativo = 1 AND s.status = 'PUBLICADA'
        AND datetime(s.termina_em) >= datetime(?) AND datetime(s.inicia_em) <= datetime(?) AND ? = 1
      ORDER BY datetime(s.inicia_em), s.id, d.id LIMIT ?`).bind(comunidadeId, userId, from, until, enabled[3] ? 1 : 0, LIMIT + 1),
  ];
  if (extended) queries.push(db.prepare(`SELECT s.id, substr(s.titulo,1,120) AS titulo,
      substr(s.descricao,1,2000) AS texto, s.tipo, s.status,
      strftime('%Y-%m-%dT%H:%M:%fZ',s.criado_em) AS data,
      strftime('%Y-%m-%dT%H:%M:%fZ',s.atualizado_em) AS atualizado
      FROM solicitacoes_comunidade s
      WHERE s.comunidade_id = ? AND s.solicitante_id = ? AND ? = 1
        AND NOT (s.status = 'CONCLUIDA' AND s.atualizado_em <= datetime('now','-30 days'))
      ORDER BY CASE s.status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END, s.id DESC
      LIMIT 51`).bind(comunidadeId, userId, ownRequestsAllowed ? 1 : 0));
  const results = await db.batch<Record<string, unknown>>(queries);
  if (extended && (!results[4].success || !results[4].results)) throw new Error("Requests snapshot unavailable");
  const requestRows = results[4]?.results || [];
  const data = Object.fromEntries(sections.map((name, index) => {
    const limit = index === 0 ? 50 : LIMIT;
    const rows = results[index].results;
    if (!results[index].success || !rows) throw new Error("Snapshot unavailable");
    return [name, { allowed: enabled[index], hasMore: rows.length > limit, items: rows.slice(0, limit) }];
  }));
  const value = {
    protocol: extended ? 3 : 2, challenge, accountId: userId, communityId: comunidadeId,
    communityName: access.context.comunidadeNome.slice(0, 160), issuedAt,
    expiresAt: Math.min(sessionExpires, issuedAt + 8 * 60 * 60 * 1000),
    capabilities: ["shell.open", "snapshot.read"],
    // Optional additive contract: old APKs receive exactly the previous shape.
    ...(extended && request.headers.get("x-vinkulo-theme") === "palette-1" ? {
      theme: await offlineTheme(db, comunidadeId),
    } : {}),
    snapshot: { from, until, ...data, ...(extended ? {
      pedidos: { allowed: ownRequestsAllowed, hasMore: requestRows.length > 50, items: requestRows.slice(0,50) },
    } : {}) },
  };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) {
    return reply({ error: "Conteúdo acima do limite seguro. Consulte online." }, 413);
  }
  return reply(value);
}

async function offlineTheme(db: ReturnType<typeof getD1>, communityId: number) {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(`community_theme:${communityId}`).first<{ valor: string }>();
  let source;
  try { source = JSON.parse(row?.valor || "{}"); } catch { source = {}; }
  const { paletteId } = parseCommunityTheme(source);
  const styles = communityThemeStyle(paletteId) as Record<string, string>;
  const colors = ["bg", "surface", "surface-2", "text", "muted", "line", "primary", "on-primary", "link"];
  const mode = (name: string) => Object.fromEntries(colors.map(key => [key, styles[`--community-${name}-${key}`]]));
  // No media, URLs, arbitrary CSS, preference cookies or additional user data.
  return { version: 1, paletteId, light: mode("light"), dark: mode("dark") };
}
