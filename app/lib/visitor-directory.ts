import { getD1 } from "../../db";
import { visitorSearch } from "./visitor-search";
import { visitorToday } from "./visitor-attention";

// This projection reads the existing visitor and follow-up records. No parallel registry.
function directoryQuery(communityId: number, params: URLSearchParams) {
  const today = visitorToday();
  const base = `WITH people AS (
    SELECT v.*, c.nome AS categoria_nome, c.cor AS categoria_cor, cell.nome AS celula_nome,
      COALESCE(c.ministerio_nome, NULLIF(trim(v.ministerio), ''), '') AS ministerio_nome,
      COALESCE(NULLIF(trim(v.responsavel_acompanhamento), ''), c.responsavel_nome, '') AS responsavel_nome,
      a.criado_em AS ultimo_contato, a.proximo_contato,
      CASE WHEN v.data_proxima_acao IS NULL THEN a.proximo_contato
        WHEN a.proximo_contato IS NULL THEN v.data_proxima_acao
        ELSE min(v.data_proxima_acao, a.proximo_contato) END AS proxima_data
    FROM visitantes v
    LEFT JOIN celulas cell ON cell.id = v.celula_id AND cell.comunidade_id = v.comunidade_id AND cell.escopo_confirmado = 1
    LEFT JOIN (SELECT vc.*, m.nome AS ministerio_nome, u.nome AS responsavel_nome
      FROM visitante_categorias vc
      LEFT JOIN ministerios_comunidade m ON m.id = vc.ministerio_id AND m.comunidade_id = vc.comunidade_id AND m.status = 'ATIVO'
      LEFT JOIN usuarios u ON u.id = vc.responsavel_usuario_id
      WHERE vc.comunidade_id = ? AND vc.ativa = 1) c ON c.id = v.categoria_id
    LEFT JOIN acompanhamentos a ON a.id = (SELECT max(ax.id) FROM acompanhamentos ax
      WHERE ax.visitante_id = v.id AND ax.comunidade_id = v.comunidade_id AND ax.escopo_confirmado = 1)
    WHERE v.comunidade_id = ? AND v.escopo_confirmado = 1 AND v.ativo = 1
  )`;
  const conditions: string[] = [];
  const bindings: (string | number)[] = [communityId, communityId];
  const add = (sql: string, value: string | number) => { conditions.push(sql); bindings.push(value); };
  const search = (params.get("busca") || "").trim().slice(0, 80);
  if (search) {
    const normalized = visitorSearch(search);
    conditions.push(normalized.sql);
    bindings.push(...normalized.bindings);
  }
  const status = params.get("status") || "";
  if (["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"].includes(status)) add("status = ?", status);
  if (params.get("contexto") === "acompanhamentos") conditions.push("status = 'EM_ACOMPANHAMENTO'");
  const category = params.get("categoria");
  if (category === "sem-categoria") conditions.push("categoria_id IS NULL");
  else if (category && Number(category) > 0) add("categoria_id = ?", Number(category));
  for (const [param, column] of [["ministerio", "ministerio_nome"], ["responsavel", "responsavel_nome"]]) {
    const value = params.get(param);
    if (value === "__none") conditions.push(`${column} = ''`);
    else if (value) add(`${column} = ?`, value.slice(0, 180));
  }
  const period = params.get("periodo");
  if (period === "nunca") conditions.push("ultimo_contato IS NULL");
  else if (period === "7" || period === "30") {
    conditions.push("date(ultimo_contato, '-3 hours') BETWEEN date(?, ?) AND date(?)");
    bindings.push(today, `-${Number(period) - 1} days`, today);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy: Record<string, string> = {
    prioridade: "CASE WHEN proxima_data <= ? THEN 0 WHEN status = 'NOVO' THEN 1 ELSE 2 END, proxima_data IS NULL, proxima_data ASC, nome_completo COLLATE NOCASE ASC, id ASC",
    nome: "nome_completo COLLATE NOCASE ASC, id ASC",
    nome_desc: "nome_completo COLLATE NOCASE DESC, id DESC",
    contato: "ultimo_contato DESC, id DESC",
    acao: "proxima_data IS NULL, proxima_data ASC, id ASC",
  };
  const sort = params.get("ordem") || "prioridade";
  const order = orderBy[sort] || orderBy.prioridade;
  return { base, where, bindings, order, today };
}

export async function directoryExportRows(db: ReturnType<typeof getD1>, communityId: number, params: URLSearchParams) {
  const { base, where, bindings, order, today } = directoryQuery(communityId, params);
  const selected = params.get("selecionados");
  let selection = "";
  if (selected !== null) {
    const ids = [...new Set(selected.split(",").map(Number))];
    if (!ids.length || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new RangeError("Seleção inválida. Selecione até 50 fichas.");
    selection = `${where ? " AND" : "WHERE"} id IN (${ids.map(() => "?").join(",")})`;
    bindings.push(...ids);
  }
  const result = await db.prepare(`${base} SELECT * FROM people ${where} ${selection} ORDER BY ${order} LIMIT 10001`)
    .bind(...bindings, ...(order.includes("?") ? [today] : [])).all<Record<string, unknown>>();
  if (result.results.length > 10000) throw new RangeError("O limite é de 10.000 fichas. Restrinja os filtros.");
  return result.results;
}

export async function readVisitorDirectory(db: ReturnType<typeof getD1>, communityId: number, params: URLSearchParams) {
  const { base, where, bindings, order, today } = directoryQuery(communityId, params);
  const total = await db.prepare(`${base} SELECT count(*) AS total FROM people ${where}`).bind(...bindings).first<{total: number}>();
  const pageSize = 15;
  const pages = Math.max(1, Math.ceil(Number(total?.total || 0) / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get("pagina")) || 1)));
  const rows = await db.prepare(`${base} SELECT * FROM people ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...bindings, ...(order.includes("?") ? [today] : []), pageSize, (page - 1) * pageSize).all();
  const stats = await db.prepare(`${base} SELECT count(*) AS total,
    sum(date(criado_em, '-3 hours') BETWEEN date(?, '-6 days') AND date(?)) AS semana,
    sum(status = 'EM_ACOMPANHAMENTO') AS acompanhamento,
    sum(proxima_data <= ?) AS retornos FROM people`).bind(communityId, communityId, today, today, today).first();
  const options = await db.prepare(`${base} SELECT DISTINCT ministerio_nome, responsavel_nome FROM people`).bind(communityId, communityId).all<{ministerio_nome: string; responsavel_nome: string}>();
  const groups = await db.prepare(`${base} SELECT categoria_id, categoria_nome, ministerio_nome, count(*) AS total FROM people ${where} GROUP BY categoria_id, categoria_nome, ministerio_nome`).bind(...bindings).all();
  return Response.json({ visitantes: rows.results, total: total?.total || 0, pagina: page, paginas: pages, limite: pageSize, hoje: today, indicadores: stats,
    ministerios: [...new Set(options.results.map(r => r.ministerio_nome).filter(Boolean))].sort(),
    responsaveis: [...new Set(options.results.map(r => r.responsavel_nome).filter(Boolean))].sort(), grupos: groups.results,
  }, { headers: { "Cache-Control": "no-store" } });
}
