import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  CHAVES_CONFIGURACAO,
  ESCOPOS_CONFIGURACAO,
  FLAGS_CONHECIDAS,
  MODULOS_PLATAFORMA,
  avaliarLiberacaoGradual,
  configuracaoPorChave,
  ehAlteracaoCritica,
  escopoPermitido,
  validarValorConfiguracao,
} from "../../../lib/global-controls.mjs";

// Controles globais do proprietário: configurações versionadas (modo de
// manutenção, versão mínima de APK/PWA, bloqueio emergencial) e feature flags
// com liberação gradual.
//
// Duas regras estruturam este arquivo:
// 1. Nada é sobrescrito em silêncio — toda alteração grava o estado anterior
//    em `configuracoes_globais_historico` / `feature_flags_historico`, e a
//    reversão é só reaplicar um estado do histórico, gerando histórico novo.
//    A trilha nunca é reescrita nem apagada.
// 2. As flags continuam na tabela `feature_flags` que a plataforma já lê em
//    pilot-data.ts. Por isso o escopo COMUNIDADE desta tela é gravado como
//    `scope_type = 'COMMUNITY'`, exatamente o código que aquela leitura
//    espera — não existe segunda tabela de flags.

type ConfigRow = {
  id: number;
  chave: string;
  escopo_tipo: string;
  escopo_id: number;
  valor: string;
  versao: number;
  critica: number;
  motivo: string;
  alterado_por: number | null;
  atualizado_em: string;
  alterado_nome: string | null;
  escopo_nome: string | null;
};

type FlagRow = {
  id: number;
  flag_key: string;
  scope_type: string;
  scope_id: number;
  enabled: number;
  inicia_em: string | null;
  termina_em: string | null;
  config_json: string;
  alterado_por: number | null;
  alterado_em: string;
  escopo_nome: string | null;
  alterado_nome: string | null;
};

const clean = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

// O escopo COMUNIDADE da tela usa o código já gravado na tabela existente.
const ESCOPO_PARA_FLAG: Record<string, string> = {
  GLOBAL: "GLOBAL",
  COMUNIDADE: "COMMUNITY",
};
const FLAG_PARA_ESCOPO: Record<string, string> = {
  GLOBAL: "GLOBAL",
  COMMUNITY: "COMUNIDADE",
};

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

function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function audit(
  db: ReturnType<typeof getD1>,
  userId: number,
  event: string,
  metadata: Record<string, unknown>,
  comunidadeId: number | null = null,
) {
  await db
    .prepare(
      "INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (?, ?, ?, 'SUCESSO', ?)",
    )
    .bind(comunidadeId, userId, event, JSON.stringify(metadata))
    .run();
}

function parseJson(raw: string, fallback: unknown) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function parseData(value: unknown) {
  const texto = clean(value, 40);
  if (!texto) return { ok: true, valor: null as string | null };
  const tempo = Date.parse(texto.includes("T") ? texto : `${texto}T00:00:00Z`);
  if (Number.isNaN(tempo)) return { ok: false, valor: null as string | null };
  return { ok: true, valor: new Date(tempo).toISOString() };
}

function viewConfig(row: ConfigRow) {
  const catalogo = configuracaoPorChave(row.chave);
  return {
    id: row.id,
    chave: row.chave,
    rotulo: catalogo?.rotulo || row.chave,
    escopoTipo: row.escopo_tipo,
    escopoId: row.escopo_id,
    escopoNome: row.escopo_nome,
    valor: parseJson(row.valor, catalogo?.padrao ?? null),
    versao: row.versao,
    critica: Boolean(row.critica),
    motivo: row.motivo,
    alteradoPor: row.alterado_nome,
    atualizadoEm: row.atualizado_em,
  };
}

function viewFlag(row: FlagRow) {
  const config = parseJson(row.config_json, {}) as Record<string, unknown>;
  const catalogo = FLAGS_CONHECIDAS.find((item) => item.chave === row.flag_key);
  return {
    id: row.id,
    chave: row.flag_key,
    rotulo: catalogo?.rotulo || row.flag_key,
    critica: Boolean(catalogo?.critica),
    escopoTipo: FLAG_PARA_ESCOPO[row.scope_type] || row.scope_type,
    escopoId: row.scope_id,
    escopoNome: row.escopo_nome,
    habilitado: Boolean(row.enabled),
    iniciaEm: row.inicia_em,
    terminaEm: row.termina_em,
    percentual:
      config.percentual === undefined || config.percentual === null
        ? null
        : Number(config.percentual),
    comunidades: Array.isArray(config.comunidades)
      ? (config.comunidades as unknown[]).map((item) => Number(item))
      : [],
    config,
    alteradoPor: row.alterado_nome,
    alteradoEm: row.alterado_em,
    // Prévia honesta: o que a regra decide agora para o próprio escopo.
    situacao: avaliarLiberacaoGradual({
      enabled: Boolean(row.enabled),
      config,
      comunidadeId: row.scope_type === "COMMUNITY" ? row.scope_id : 0,
      iniciaEm: row.inicia_em,
      terminaEm: row.termina_em,
    }),
  };
}

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();

  const [configs, flags, historicoConfig, historicoFlag, comunidades] =
    await Promise.all([
      db
        .prepare(
          `SELECT g.*, u.nome AS alterado_nome,
             CASE WHEN g.escopo_tipo = 'COMUNIDADE' THEN c.nome ELSE NULL END AS escopo_nome
           FROM configuracoes_globais g
           LEFT JOIN usuarios u ON u.id = g.alterado_por
           LEFT JOIN comunidades c ON c.id = g.escopo_id
           ORDER BY g.escopo_tipo, g.chave
           LIMIT 400`,
        )
        .all<ConfigRow>(),
      db
        .prepare(
          `SELECT f.*, u.nome AS alterado_nome,
             CASE WHEN f.scope_type = 'COMMUNITY' THEN c.nome ELSE NULL END AS escopo_nome
           FROM feature_flags f
           LEFT JOIN usuarios u ON u.id = f.alterado_por
           LEFT JOIN comunidades c ON c.id = f.scope_id
           ORDER BY f.flag_key, f.scope_type, f.scope_id
           LIMIT 300`,
        )
        .all<FlagRow>(),
      db
        .prepare(
          `SELECT h.id, h.configuracao_id, h.chave, h.escopo_tipo, h.escopo_id,
             h.valor_anterior, h.valor_novo, h.versao, h.motivo, h.criado_em,
             u.nome AS alterado_nome
           FROM configuracoes_globais_historico h
           LEFT JOIN usuarios u ON u.id = h.alterado_por
           ORDER BY h.criado_em DESC, h.id DESC
           LIMIT 60`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT h.id, h.flag_key, h.escopo_tipo, h.escopo_id,
             h.habilitado_anterior, h.habilitado_novo, h.config_anterior,
             h.config_nova, h.motivo, h.criado_em, u.nome AS alterado_nome
           FROM feature_flags_historico h
           LEFT JOIN usuarios u ON u.id = h.alterado_por
           ORDER BY h.criado_em DESC, h.id DESC
           LIMIT 60`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT id, nome, status FROM comunidades
           WHERE status <> 'ARQUIVADA' ORDER BY nome LIMIT 300`,
        )
        .all<{ id: number; nome: string; status: string }>(),
    ]);

  return Response.json(
    {
      catalogo: CHAVES_CONFIGURACAO,
      escopos: ESCOPOS_CONFIGURACAO,
      modulos: MODULOS_PLATAFORMA,
      flagsConhecidas: FLAGS_CONHECIDAS,
      configuracoes: configs.results.map(viewConfig),
      flags: flags.results.map(viewFlag),
      historicoConfiguracoes: historicoConfig.results.map((row) => ({
        id: Number(row.id),
        configuracaoId: Number(row.configuracao_id),
        chave: String(row.chave),
        rotulo: configuracaoPorChave(row.chave)?.rotulo || String(row.chave),
        escopoTipo: String(row.escopo_tipo),
        escopoId: Number(row.escopo_id),
        valorAnterior: parseJson(String(row.valor_anterior || "{}"), null),
        valorNovo: parseJson(String(row.valor_novo || "{}"), null),
        versao: Number(row.versao),
        motivo: String(row.motivo || ""),
        critica: ehAlteracaoCritica(row.chave),
        alteradoPor: row.alterado_nome ? String(row.alterado_nome) : null,
        criadoEm: String(row.criado_em),
      })),
      historicoFlags: historicoFlag.results.map((row) => ({
        id: Number(row.id),
        chave: String(row.flag_key),
        rotulo:
          FLAGS_CONHECIDAS.find((item) => item.chave === row.flag_key)?.rotulo ||
          String(row.flag_key),
        escopoTipo:
          FLAG_PARA_ESCOPO[String(row.escopo_tipo)] || String(row.escopo_tipo),
        escopoId: Number(row.escopo_id),
        habilitadoAnterior: Boolean(row.habilitado_anterior),
        habilitadoNovo: Boolean(row.habilitado_novo),
        configAnterior: parseJson(String(row.config_anterior || "{}"), {}),
        configNova: parseJson(String(row.config_nova || "{}"), {}),
        motivo: String(row.motivo || ""),
        alteradoPor: row.alterado_nome ? String(row.alterado_nome) : null,
        criadoEm: String(row.criado_em),
      })),
      comunidades: comunidades.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Access = { user: { id: number } };

async function gravarConfiguracao(
  db: ReturnType<typeof getD1>,
  access: Access,
  entrada: {
    chave: string;
    escopoTipo: string;
    escopoId: number;
    valor: unknown;
    motivo: string;
    evento: string;
    extra?: Record<string, unknown>;
  },
) {
  const atual = await db
    .prepare(
      `SELECT id, valor, versao FROM configuracoes_globais
       WHERE chave = ? AND escopo_tipo = ? AND escopo_id = ? LIMIT 1`,
    )
    .bind(entrada.chave, entrada.escopoTipo, entrada.escopoId)
    .first<{ id: number; valor: string; versao: number }>();

  const critica = ehAlteracaoCritica(entrada.chave);
  const versao = (atual?.versao || 0) + 1;
  const valorNovo = JSON.stringify(entrada.valor ?? null);
  const valorAnterior = atual?.valor ?? "{}";

  await db
    .prepare(
      `INSERT INTO configuracoes_globais
         (chave, escopo_tipo, escopo_id, valor, versao, critica, alterado_por,
          motivo, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave, escopo_tipo, escopo_id) DO UPDATE SET
         valor = excluded.valor,
         versao = excluded.versao,
         critica = excluded.critica,
         alterado_por = excluded.alterado_por,
         motivo = excluded.motivo,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      entrada.chave,
      entrada.escopoTipo,
      entrada.escopoId,
      valorNovo,
      versao,
      critica ? 1 : 0,
      access.user.id,
      entrada.motivo,
    )
    .run();

  const gravada = await db
    .prepare(
      `SELECT id FROM configuracoes_globais
       WHERE chave = ? AND escopo_tipo = ? AND escopo_id = ? LIMIT 1`,
    )
    .bind(entrada.chave, entrada.escopoTipo, entrada.escopoId)
    .first<{ id: number }>();
  if (!gravada) throw new Error("Não foi possível gravar a configuração.");

  // O histórico é sempre acrescentado — nunca atualizado nem removido.
  await db
    .prepare(
      `INSERT INTO configuracoes_globais_historico
         (configuracao_id, chave, escopo_tipo, escopo_id, valor_anterior,
          valor_novo, versao, motivo, alterado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      gravada.id,
      entrada.chave,
      entrada.escopoTipo,
      entrada.escopoId,
      valorAnterior,
      valorNovo,
      versao,
      entrada.motivo,
      access.user.id,
    )
    .run();

  await audit(
    db,
    access.user.id,
    entrada.evento,
    {
      chave: entrada.chave,
      escopoTipo: entrada.escopoTipo,
      escopoId: entrada.escopoId,
      versao,
      valorAnterior: parseJson(valorAnterior, null),
      valorNovo: entrada.valor ?? null,
      motivo: entrada.motivo,
      critica,
      // Destaque para a leitura da auditoria: mudança crítica não pode passar
      // no meio do ruído.
      destaque: critica ? "ALTERACAO_CRITICA" : "",
      ...(entrada.extra || {}),
    },
    entrada.escopoTipo === "COMUNIDADE" ? entrada.escopoId : null,
  );

  return { id: gravada.id, versao, critica };
}

async function gravarFlag(
  db: ReturnType<typeof getD1>,
  access: Access,
  entrada: {
    flagKey: string;
    scopeType: string;
    scopeId: number;
    enabled: boolean;
    iniciaEm: string | null;
    terminaEm: string | null;
    config: Record<string, unknown>;
    motivo: string;
    evento: string;
  },
) {
  const atual = await db
    .prepare(
      `SELECT id, enabled, config_json FROM feature_flags
       WHERE flag_key = ? AND scope_type = ? AND scope_id = ? LIMIT 1`,
    )
    .bind(entrada.flagKey, entrada.scopeType, entrada.scopeId)
    .first<{ id: number; enabled: number; config_json: string }>();

  const configNova = JSON.stringify(entrada.config);
  await db
    .prepare(
      `INSERT INTO feature_flags
         (flag_key, scope_type, scope_id, enabled, inicia_em, termina_em,
          config_json, alterado_por, alterado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(flag_key, scope_type, scope_id) DO UPDATE SET
         enabled = excluded.enabled,
         inicia_em = excluded.inicia_em,
         termina_em = excluded.termina_em,
         config_json = excluded.config_json,
         alterado_por = excluded.alterado_por,
         alterado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      entrada.flagKey,
      entrada.scopeType,
      entrada.scopeId,
      entrada.enabled ? 1 : 0,
      entrada.iniciaEm,
      entrada.terminaEm,
      configNova,
      access.user.id,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO feature_flags_historico
         (flag_key, escopo_tipo, escopo_id, habilitado_anterior, habilitado_novo,
          config_anterior, config_nova, motivo, alterado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entrada.flagKey,
      entrada.scopeType,
      entrada.scopeId,
      atual?.enabled ? 1 : 0,
      entrada.enabled ? 1 : 0,
      atual?.config_json ?? "{}",
      configNova,
      entrada.motivo,
      access.user.id,
    )
    .run();

  const critica = Boolean(
    FLAGS_CONHECIDAS.find((item) => item.chave === entrada.flagKey)?.critica,
  );
  await audit(
    db,
    access.user.id,
    entrada.evento,
    {
      flagKey: entrada.flagKey,
      escopoTipo: entrada.scopeType,
      escopoId: entrada.scopeId,
      habilitadoAnterior: Boolean(atual?.enabled),
      habilitadoNovo: entrada.enabled,
      percentual: entrada.config.percentual ?? null,
      comunidades: entrada.config.comunidades ?? [],
      iniciaEm: entrada.iniciaEm,
      terminaEm: entrada.terminaEm,
      motivo: entrada.motivo,
      critica,
      destaque: critica ? "ALTERACAO_CRITICA" : "",
    },
    entrada.scopeType === "COMMUNITY" ? entrada.scopeId : null,
  );
}

async function comunidadeExiste(db: ReturnType<typeof getD1>, comunidadeId: number) {
  return Boolean(
    await db
      .prepare("SELECT id FROM comunidades WHERE id = ? LIMIT 1")
      .bind(comunidadeId)
      .first<{ id: number }>(),
  );
}

const ACOES = ["CONFIG_SET", "CONFIG_ROLLBACK", "FLAG_SET", "FLAG_ROLLBACK"] as const;

async function aplicar(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Conteúdo inválido.");
  }
  const action = (clean(body.action, 30) || "CONFIG_SET").toUpperCase();
  if (!(ACOES as readonly string[]).includes(action))
    return badRequest("Ação não reconhecida.");

  const db = getD1();
  const motivo = clean(body.motivo, 300);

  if (action === "CONFIG_SET") {
    const chave = clean(body.chave, 60);
    const catalogo = configuracaoPorChave(chave);
    if (!catalogo) return badRequest("Configuração não reconhecida.");
    const escopoTipo = clean(body.escopoTipo, 20).toUpperCase() || "GLOBAL";
    if (!escopoPermitido(chave, escopoTipo))
      return badRequest("Esta configuração não aceita o escopo escolhido.");
    let escopoId = 0;
    if (escopoTipo === "COMUNIDADE") {
      escopoId = id(body.escopoId);
      if (!escopoId) return badRequest("Selecione a comunidade.");
      if (!(await comunidadeExiste(db, escopoId)))
        return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    } else if (escopoTipo === "MODULO") {
      escopoId = id(body.escopoId);
      if (!MODULOS_PLATAFORMA.some((modulo) => modulo.id === escopoId))
        return badRequest("Selecione o módulo.");
    }
    const validacao = validarValorConfiguracao(chave, body.valor);
    if (!validacao.valido) return badRequest(validacao.erro);
    if (ehAlteracaoCritica(chave) && motivo.length < 5)
      return badRequest(
        "Esta é uma alteração crítica: descreva o motivo em pelo menos 5 caracteres.",
      );

    const resultado = await gravarConfiguracao(db, access, {
      chave,
      escopoTipo,
      escopoId,
      valor: validacao.valor,
      motivo,
      evento: "CONFIGURACAO_GLOBAL_ALTERADA",
    });
    return Response.json({ ok: true, ...resultado });
  }

  if (action === "CONFIG_ROLLBACK") {
    const historicoId = id(body.historicoId);
    if (!historicoId) return badRequest("Selecione a versão a reaplicar.");
    const registro = await db
      .prepare(
        `SELECT id, configuracao_id, chave, escopo_tipo, escopo_id, valor_novo, versao
         FROM configuracoes_globais_historico WHERE id = ? LIMIT 1`,
      )
      .bind(historicoId)
      .first<{
        id: number;
        configuracao_id: number;
        chave: string;
        escopo_tipo: string;
        escopo_id: number;
        valor_novo: string;
        versao: number;
      }>();
    if (!registro)
      return Response.json({ error: "Versão não encontrada." }, { status: 404 });
    const validacao = validarValorConfiguracao(
      registro.chave,
      parseJson(registro.valor_novo, null),
    );
    if (!validacao.valido)
      return badRequest(
        "A versão guardada não passa mais na validação atual e não pode ser reaplicada.",
      );
    if (ehAlteracaoCritica(registro.chave) && motivo.length < 5)
      return badRequest(
        "Reverter uma configuração crítica exige o motivo da reversão.",
      );

    // Reverter é uma alteração nova: gera versão e histórico próprios. O
    // registro antigo continua intacto.
    const resultado = await gravarConfiguracao(db, access, {
      chave: registro.chave,
      escopoTipo: registro.escopo_tipo,
      escopoId: registro.escopo_id,
      valor: validacao.valor,
      motivo: motivo || `Reversão para a versão ${registro.versao}.`,
      evento: "CONFIGURACAO_GLOBAL_REVERTIDA",
      extra: { revertidoDeHistoricoId: registro.id, versaoOrigem: registro.versao },
    });
    return Response.json({ ok: true, ...resultado });
  }

  if (action === "FLAG_SET") {
    const flagKey = clean(body.flagKey, 60).toLowerCase();
    if (!/^[a-z0-9_]{3,60}$/.test(flagKey))
      return badRequest(
        "Use um identificador de recurso com letras minúsculas, números e _.",
      );
    const escopoTipo = clean(body.escopoTipo, 20).toUpperCase() || "GLOBAL";
    const scopeType = ESCOPO_PARA_FLAG[escopoTipo];
    if (!scopeType)
      return badRequest("A liberação aceita o escopo global ou por comunidade.");
    let scopeId = 0;
    if (scopeType === "COMMUNITY") {
      scopeId = id(body.escopoId);
      if (!scopeId) return badRequest("Selecione a comunidade.");
      if (!(await comunidadeExiste(db, scopeId)))
        return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    }

    const inicia = parseData(body.iniciaEm);
    if (!inicia.ok) return badRequest("Data inicial inválida.");
    const termina = parseData(body.terminaEm);
    if (!termina.ok) return badRequest("Data final inválida.");
    if (
      inicia.valor &&
      termina.valor &&
      Date.parse(termina.valor) <= Date.parse(inicia.valor)
    )
      return badRequest("O término precisa ser posterior ao início.");

    let percentual: number | null = null;
    if (
      body.percentual !== undefined &&
      body.percentual !== null &&
      clean(body.percentual, 10) !== ""
    ) {
      const numero = Number(body.percentual);
      if (!Number.isFinite(numero) || numero < 0 || numero > 100)
        return badRequest("O percentual de liberação vai de 0 a 100.");
      percentual = Math.round(numero);
    }

    const comunidadesBrutas = Array.isArray(body.comunidades) ? body.comunidades : [];
    const comunidades: number[] = [];
    for (const item of comunidadesBrutas) {
      const comunidadeId = id(item);
      if (!comunidadeId) return badRequest("Comunidade inválida na lista de teste.");
      if (!comunidades.includes(comunidadeId)) comunidades.push(comunidadeId);
      if (comunidades.length > 200)
        return badRequest("A lista aceita no máximo 200 comunidades.");
    }
    if (comunidades.length) {
      const existentes = await db
        .prepare(
          `SELECT COUNT(*) AS total FROM comunidades WHERE id IN (${comunidades
            .map(() => "?")
            .join(",")})`,
        )
        .bind(...comunidades)
        .first<{ total: number }>();
      if (Number(existentes?.total) !== comunidades.length)
        return badRequest("Alguma comunidade da lista não existe mais.");
    }

    const critica = Boolean(
      FLAGS_CONHECIDAS.find((item) => item.chave === flagKey)?.critica,
    );
    if (critica && motivo.length < 5)
      return badRequest(
        "Este recurso é crítico: descreva o motivo da alteração em pelo menos 5 caracteres.",
      );

    const atual = await db
      .prepare(
        `SELECT config_json FROM feature_flags
         WHERE flag_key = ? AND scope_type = ? AND scope_id = ? LIMIT 1`,
      )
      .bind(flagKey, scopeType, scopeId)
      .first<{ config_json: string }>();
    const configAnterior = parseJson(atual?.config_json || "{}", {}) as Record<
      string,
      unknown
    >;
    // Mantém o que outras telas gravaram no mesmo config_json (o controle de
    // redes, por exemplo) e só troca o que esta tela governa.
    const config: Record<string, unknown> = {
      ...configAnterior,
      percentual,
      comunidades,
      semente: flagKey,
      gerido_por: "controles_globais",
      motivo,
    };

    await gravarFlag(db, access, {
      flagKey,
      scopeType,
      scopeId,
      enabled: body.habilitado === true || body.enabled === true,
      iniciaEm: inicia.valor,
      terminaEm: termina.valor,
      config,
      motivo,
      evento: "FEATURE_FLAG_ALTERADA",
    });
    return Response.json({ ok: true });
  }

  // FLAG_ROLLBACK
  const historicoId = id(body.historicoId);
  if (!historicoId) return badRequest("Selecione o estado a reaplicar.");
  const registro = await db
    .prepare(
      `SELECT id, flag_key, escopo_tipo, escopo_id, habilitado_novo, config_nova
       FROM feature_flags_historico WHERE id = ? LIMIT 1`,
    )
    .bind(historicoId)
    .first<{
      id: number;
      flag_key: string;
      escopo_tipo: string;
      escopo_id: number;
      habilitado_novo: number;
      config_nova: string;
    }>();
  if (!registro)
    return Response.json({ error: "Estado não encontrado." }, { status: 404 });
  const critica = Boolean(
    FLAGS_CONHECIDAS.find((item) => item.chave === registro.flag_key)?.critica,
  );
  if (critica && motivo.length < 5)
    return badRequest("Reverter um recurso crítico exige o motivo da reversão.");
  const config = parseJson(registro.config_nova, {}) as Record<string, unknown>;
  const janelaInicio = typeof config.inicia_em === "string" ? config.inicia_em : null;
  const janelaFim = typeof config.termina_em === "string" ? config.termina_em : null;

  await gravarFlag(db, access, {
    flagKey: registro.flag_key,
    scopeType: registro.escopo_tipo,
    scopeId: registro.escopo_id,
    enabled: Boolean(registro.habilitado_novo),
    iniciaEm: janelaInicio,
    terminaEm: janelaFim,
    config,
    motivo: motivo || "Reversão para um estado anterior.",
    evento: "FEATURE_FLAG_REVERTIDA",
  });
  return Response.json({ ok: true, revertidoDeHistoricoId: registro.id });
}

export async function PUT(request: Request) {
  return aplicar(request);
}

export async function PATCH(request: Request) {
  return aplicar(request);
}
