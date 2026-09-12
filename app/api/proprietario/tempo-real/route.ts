// Atividade próxima de tempo real do Proprietário.
//
// TODAS as métricas devolvidas aqui são derivadas de dados reais das tabelas
// `sessoes`, `usuarios`, `comunidades` e `usuario_comunidades`. Nenhum número
// é simulado.
//
// O que NÃO é derivável hoje (a plataforma não tem telemetria de navegação e
// não registra o fim real de uma sessão):
//   - `modules` (módulos mais utilizados): exigiria eventos de navegação por
//     rota/módulo, que não são gravados em lugar nenhum. Devolvido como null.
//   - `devices` (dispositivo/navegador): não guardamos user-agent em `sessoes`.
//     Devolvido como null.
//   - A duração média de sessão é uma APROXIMAÇÃO: como não existe registro de
//     logout, usamos a janela contratada da sessão (criado_em → expira_em)
//     limitada pelo instante atual. Vem marcada com `aproximado: true`.
//   - O pico simultâneo é o pico OBSERVÁVEL na janela: para cada hora das
//     últimas 24h contamos quantas sessões estavam vivas naquela hora
//     (criado_em <= hora < expira_em). É exato para as sessões ainda no banco,
//     mas sessões já apagadas (expiradas e limpas) não entram na conta.
//
// A UI deve exibir "sem telemetria para este indicador ainda" para todo campo
// que chegar como null.

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

type CommunityRow = {
  comunidade_id: number | null;
  comunidade: string | null;
  pessoas_online: number;
  sessoes_ativas: number;
};
type BucketRow = { bucket: string; usuarios: number; sessoes: number };

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();

  const online = await db
    .prepare(
      `SELECT COUNT(DISTINCT s.usuario_id) AS pessoas, COUNT(*) AS sessoes
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE datetime(s.expira_em) > CURRENT_TIMESTAMP AND u.ativo = 1`,
    )
    .first<{ pessoas: number; sessoes: number }>();

  // Duração aproximada: min(agora, expira_em) - criado_em, em minutos.
  const duration = await db
    .prepare(
      `SELECT AVG(
          (julianday(MIN(datetime(s.expira_em), datetime('now'))) - julianday(datetime(s.criado_em))) * 1440
        ) AS media,
        COUNT(*) AS amostra
       FROM sessoes s
       WHERE datetime(s.criado_em) > datetime('now', '-14 days')`,
    )
    .first<{ media: number | null; amostra: number }>();

  const communities = await db
    .prepare(
      `SELECT c.id AS comunidade_id, c.nome AS comunidade,
              COUNT(DISTINCT s.usuario_id) AS pessoas_online,
              COUNT(s.id) AS sessoes_ativas
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id AND u.ativo = 1
       LEFT JOIN usuario_comunidades uc
         ON uc.usuario_id = s.usuario_id AND uc.status = 'ATIVO'
       LEFT JOIN comunidades c ON c.id = uc.comunidade_id
       WHERE datetime(s.expira_em) > CURRENT_TIMESTAMP
       GROUP BY c.id, c.nome
       ORDER BY pessoas_online DESC, sessoes_ativas DESC
       LIMIT 50`,
    )
    .all<CommunityRow>();

  const hourly = await db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00', datetime(s.criado_em)) AS bucket,
              COUNT(DISTINCT s.usuario_id) AS usuarios,
              COUNT(*) AS sessoes
       FROM sessoes s
       WHERE datetime(s.criado_em) > datetime('now', '-24 hours')
       GROUP BY bucket
       ORDER BY bucket`,
    )
    .all<BucketRow>();

  const daily = await db
    .prepare(
      `SELECT date(datetime(s.criado_em)) AS bucket,
              COUNT(DISTINCT s.usuario_id) AS usuarios,
              COUNT(*) AS sessoes
       FROM sessoes s
       WHERE datetime(s.criado_em) > datetime('now', '-14 days')
       GROUP BY bucket
       ORDER BY bucket`,
    )
    .all<BucketRow>();

  // Pico simultâneo observável: sessões vivas em cada hora das últimas 24h.
  const concurrent = await db
    .prepare(
      `WITH RECURSIVE horas(h) AS (
          SELECT datetime('now', '-23 hours', 'start of hour')
          UNION ALL
          SELECT datetime(h, '+1 hour') FROM horas WHERE h < datetime('now', 'start of hour')
        )
        SELECT strftime('%Y-%m-%dT%H:00', h) AS bucket,
               (SELECT COUNT(DISTINCT s.usuario_id) FROM sessoes s
                 WHERE datetime(s.criado_em) <= h AND datetime(s.expira_em) > h) AS usuarios,
               (SELECT COUNT(*) FROM sessoes s
                 WHERE datetime(s.criado_em) <= h AND datetime(s.expira_em) > h) AS sessoes
        FROM horas
        ORDER BY bucket`,
    )
    .all<BucketRow>();

  const concurrentRows = concurrent.results.map((row) => ({
    bucket: String(row.bucket),
    usuarios: Number(row.usuarios || 0),
    sessoes: Number(row.sessoes || 0),
  }));
  const peak = concurrentRows.reduce(
    (best, row) => (row.usuarios > best.usuarios ? row : best),
    { bucket: "", usuarios: 0, sessoes: 0 },
  );
  const hourlyRows = hourly.results.map((row) => ({
    bucket: String(row.bucket),
    usuarios: Number(row.usuarios || 0),
    sessoes: Number(row.sessoes || 0),
  }));
  const busiest = [...hourlyRows]
    .sort((left, right) => right.usuarios - left.usuarios)
    .slice(0, 3)
    .filter((row) => row.usuarios > 0);

  return Response.json(
    {
      agora: {
        pessoasOnline: Number(online?.pessoas || 0),
        sessoesAtivas: Number(online?.sessoes || 0),
        duracaoMediaMinutos: duration?.media == null ? null : Math.round(Number(duration.media)),
        duracaoAproximada: true,
        amostraDuracao: Number(duration?.amostra || 0),
        picoSimultaneo: peak.usuarios,
        picoEm: peak.bucket || null,
      },
      comunidades: communities.results.map((row) => ({
        // Apenas contagens agregadas e o nome da comunidade. Nenhum conteúdo
        // privado das comunidades trafega por este endpoint.
        comunidadeId: row.comunidade_id == null ? null : Number(row.comunidade_id),
        comunidade: row.comunidade || "Sem comunidade vinculada",
        pessoasOnline: Number(row.pessoas_online || 0),
        sessoesAtivas: Number(row.sessoes_ativas || 0),
      })),
      porHora: hourlyRows,
      porDia: daily.results.map((row) => ({
        bucket: String(row.bucket),
        usuarios: Number(row.usuarios || 0),
        sessoes: Number(row.sessoes || 0),
      })),
      simultaneosPorHora: concurrentRows,
      horariosDePico: busiest,
      // Sem telemetria: ver comentário no topo do arquivo.
      modulos: null,
      dispositivos: null,
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
