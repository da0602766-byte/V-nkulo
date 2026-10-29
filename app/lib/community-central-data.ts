import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";
import { notificationVisibilitySql } from "./owner-notifications";
import { hasGlobalMinistryManagement } from "./ministry-access";
import { safeCentralDestination, type CentralData, type CentralMinistry, type CentralSchedule } from "./community-central";

export async function loadCommunityCentral(db: ReturnType<typeof getD1>, context: TenantContext, options: { days: number; personal: boolean }, now = new Date()): Promise<CentralData> {
  const { comunidadeId: cid, userId: uid, permissions, modules } = context;
  const can = (permission: string, module?: string) => permissions.includes(permission) && (!module || (modules as string[]).includes(module));
  const leadership = !options.personal && can("leadership.panel.view") && ["PASTOR", "ADMIN_COMUNIDADE", "SUPERADMIN", "LIDER"].includes(context.papel);
  const global = leadership && hasGlobalMinistryManagement(context);
  const to = new Date(now); to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - options.days + 1); from.setUTCHours(0, 0, 0, 0);
  const fromText = from.toISOString(), toText = to.toISOString();
  const data: CentralData = {
    community: { id: cid, name: context.comunidadeNome }, generatedAt: now.toISOString(),
    period: { days: options.days, from: fromText, to: toText },
    scope: global ? "community" : leadership ? "leadership" : "personal",
    scopeLabel: global ? "Comunidade" : leadership ? "Ministérios que você lidera" : "Sua participação",
    pastoralLocked: false, metrics: [], ministries: [], schedules: [], notices: [], unread: null, cellReports: [],
    capabilities: { ministries: can("ministries.view", "ministries"), schedules: can("schedules.view", "ministries"), events: can("events.view", "events"), cellReports: false }, events: [],
    areas: [
      ["people.view", "people", "Pessoas e vínculos", "Diretório, funções e fichas individuais.", "pessoas"],
      ["visitors.view", "visitors", "Visitantes e acompanhamento", "Consulta de visitantes e evolução do cuidado.", "visitantes"],
      ["cells.view", "cells", "Células e encontros", "Participação, agenda e registros disponíveis.", "celulas"],
      ["events.view", "events", "Agenda e confirmações", "Eventos publicados e respostas de participação.", "eventos"],
      ["parking.view", "parking", "Estacionamento", "Operação e relatórios disponíveis nesta área.", "estacionamento"],
    ].filter(([permission, module]) => can(permission,module)).map(([, , label, description, view]) => ({ label, description, href: `/painel?view=${view}` })),
    limits: { ministries: false, schedules: false, notices: false, cellReports: false }, errors: [],
  };
  if (context.communityAccess === "FEED_ONLY") return data;
  const attempt = async (section: string, message: string, work: () => Promise<void>) => { try { await work(); } catch { data.errors.push({ section, message }); } };
  // A personal query can only narrow access. Role, modules and ministry ownership
  // come from the authenticated tenant context, never request parameters.
  const ministryScope = global ? "1 = 1" : leadership
    ? `(m.responsavel_usuario_id = ? OR EXISTS (SELECT 1 FROM ministerio_voluntarios own WHERE own.ministerio_id=m.id AND own.comunidade_id=m.comunidade_id AND own.usuario_id=? AND own.ativo=1 AND own.papel='LIDER'))`
    : `(m.responsavel_usuario_id = ? OR EXISTS (SELECT 1 FROM ministerio_voluntarios own WHERE own.ministerio_id=m.id AND own.comunidade_id=m.comunidade_id AND own.usuario_id=? AND own.ativo=1) OR EXISTS (SELECT 1 FROM escala_designacoes own JOIN escalas_ministerio s ON s.id=own.escala_id AND s.comunidade_id=own.comunidade_id WHERE s.ministerio_id=m.id AND s.comunidade_id=m.comunidade_id AND s.status='PUBLICADA' AND own.usuario_id=? AND own.ativo=1))`;
  const ministryBinds = global ? [] : leadership ? [uid, uid] : [uid, uid, uid];
  const assignmentScope = leadership ? "" : " AND d.usuario_id = ?";
  const assignmentBinds = leadership ? [] : [uid];
  const tasks: Promise<void>[] = [];

  if (can("ministries.view", "ministries")) tasks.push(attempt("ministries", "Não foi possível consultar os ministérios e suas escalas.", async () => {
    const canSchedules = can("schedules.view", "ministries");
    const reportSql = canSchedules ? `
      (SELECT COUNT(*) FROM escalas_ministerio s WHERE s.ministerio_id=m.id AND s.comunidade_id=m.comunidade_id AND s.status NOT IN ('CANCELADA','ARQUIVADA','RASCUNHO') AND datetime(s.inicia_em) BETWEEN datetime(?) AND datetime(?) ${!leadership ? "AND s.status='PUBLICADA' AND EXISTS (SELECT 1 FROM escala_designacoes d WHERE d.escala_id=s.id AND d.comunidade_id=s.comunidade_id AND d.usuario_id=? AND d.ativo=1)" : ""}) AS schedules,
      ${["CONFIRMADA", "AUSENTE"].map(status => `(SELECT COUNT(*) FROM escala_designacoes d JOIN escalas_ministerio s ON s.id=d.escala_id AND s.comunidade_id=d.comunidade_id WHERE s.ministerio_id=m.id AND s.comunidade_id=m.comunidade_id AND s.status NOT IN ('CANCELADA','ARQUIVADA','RASCUNHO') ${!leadership ? "AND s.status='PUBLICADA'" : ""} AND d.ativo=1 AND d.status='${status}' AND datetime(s.inicia_em) BETWEEN datetime(?) AND datetime(?) ${assignmentScope}) AS ${status === "CONFIRMADA" ? "confirmed" : "absent"}`).join(",")},
      ${["PENDENTE", "SUBSTITUICAO_SOLICITADA"].map(status => `(SELECT COUNT(*) FROM escala_designacoes d JOIN escalas_ministerio s ON s.id=d.escala_id AND s.comunidade_id=d.comunidade_id WHERE s.ministerio_id=m.id AND s.comunidade_id=m.comunidade_id AND s.status ${leadership ? "IN ('PUBLICADA','AGUARDANDO_CHECKLIST')" : "= 'PUBLICADA'"} AND d.ativo=1 AND d.status='${status}' AND datetime(s.termina_em)>=datetime(?) ${assignmentScope}) AS ${status === "PENDENTE" ? "pending" : "replacements"}`).join(",")}` : "0 AS schedules, 0 AS confirmed, 0 AS absent, 0 AS pending, 0 AS replacements";
    const reportBinds = canSchedules ? [fromText, toText, ...assignmentBinds, fromText, toText, ...assignmentBinds, fromText, toText, ...assignmentBinds, now.toISOString(), ...assignmentBinds, now.toISOString(), ...assignmentBinds] : [];
    const rows = await db.prepare(`SELECT m.id, m.nome AS name, COALESCE(u.nome,'Responsável não informado') AS leader,
      ${leadership ? "(SELECT COUNT(*) FROM ministerio_voluntarios v JOIN usuario_comunidades uc ON uc.usuario_id=v.usuario_id AND uc.comunidade_id=v.comunidade_id AND uc.status='ATIVO' WHERE v.ministerio_id=m.id AND v.comunidade_id=m.comunidade_id AND v.ativo=1)" : "NULL"} AS volunteers, ${reportSql}
      FROM ministerios_comunidade m LEFT JOIN usuarios u ON u.id=m.responsavel_usuario_id
      WHERE m.comunidade_id=? AND m.status='ATIVO' AND ${ministryScope} ORDER BY m.nome,m.id LIMIT 201`).bind(...reportBinds, cid, ...ministryBinds).all<CentralMinistry>();
    data.limits.ministries = rows.results.length > 200; data.ministries = rows.results.slice(0, 200);
  }));

  if (can("schedules.view", "ministries") && can("ministries.view", "ministries")) tasks.push(attempt("schedules", "Não foi possível consultar as próximas escalas.", async () => {
    const visibility = leadership ? ministryScope : `s.status='PUBLICADA' AND EXISTS (SELECT 1 FROM escala_designacoes own WHERE own.escala_id=s.id AND own.comunidade_id=s.comunidade_id AND own.usuario_id=? AND own.ativo=1)`;
    const rows = await db.prepare(`SELECT s.id,s.titulo AS title,m.nome AS ministry,s.inicia_em AS startsAt,s.status,
      (SELECT COUNT(*) FROM escala_designacoes d WHERE d.escala_id=s.id AND d.comunidade_id=s.comunidade_id AND d.ativo=1 AND d.status='PENDENTE' ${assignmentScope}) AS pending,
      (SELECT COUNT(*) FROM escala_designacoes d WHERE d.escala_id=s.id AND d.comunidade_id=s.comunidade_id AND d.ativo=1 AND d.status='SUBSTITUICAO_SOLICITADA' ${assignmentScope}) AS replacements
      FROM escalas_ministerio s JOIN ministerios_comunidade m ON m.id=s.ministerio_id AND m.comunidade_id=s.comunidade_id
      WHERE s.comunidade_id=? AND m.status='ATIVO' AND s.status IN ('PUBLICADA','AGUARDANDO_CHECKLIST') AND datetime(s.termina_em)>=datetime(?) AND ${visibility}
      ORDER BY datetime(s.inicia_em),s.id LIMIT 13`).bind(...assignmentBinds, ...assignmentBinds, cid, now.toISOString(), ...(leadership ? ministryBinds : [uid])).all<CentralSchedule>();
    data.limits.schedules = rows.results.length > 12; data.schedules = rows.results.slice(0, 12);
  }));

  tasks.push(attempt("notices", "Não foi possível consultar seus avisos.", async () => {
    const [rows, count] = await Promise.all([
      db.prepare(`SELECT n.id,n.titulo AS title,n.mensagem AS message,n.area,n.ministerio AS ministry,n.criado_em AS createdAt,n.destino_rota AS destination,CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS is_read
        FROM notificacoes_sistema n LEFT JOIN notificacoes_lidas l ON l.notificacao_id=n.id AND l.usuario_id=?
        WHERE n.usuario_id=? AND n.comunidade_id=? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(context.isOwner)} ORDER BY n.criado_em DESC,n.id DESC LIMIT 31`).bind(uid, uid, cid).all<Record<string, unknown>>(),
      db.prepare(`SELECT COUNT(*) AS total FROM notificacoes_sistema n WHERE n.usuario_id=? AND n.comunidade_id=? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(context.isOwner)} AND NOT EXISTS (SELECT 1 FROM notificacoes_lidas l WHERE l.notificacao_id=n.id AND l.usuario_id=?)`).bind(uid, cid, uid).first<{ total: number }>(),
    ]);
    data.unread = Number(count?.total || 0); data.limits.notices = rows.results.length > 30;
    data.notices = rows.results.slice(0, 30).map(r => ({ id: Number(r.id), title: String(r.title), message: String(r.message), area: String(r.area), ministry: String(r.ministry || ""), createdAt: String(r.createdAt), read: Boolean(r.is_read), destination: safeCentralDestination(r.destination) }));
  }));

  if (can("events.view", "events")) tasks.push(attempt("events", "Não foi possível consultar a agenda da comunidade.", async () => {
    const rows = await db.prepare(`SELECT e.id,e.titulo AS title,e.inicia_em AS startsAt,e.local AS location,
      (SELECT ce.status FROM confirmacoes_evento ce WHERE ce.evento_id=e.id AND ce.comunidade_id=e.comunidade_id AND ce.usuario_id=? LIMIT 1) AS response
      FROM eventos_comunidade e WHERE e.comunidade_id=? AND e.status='PUBLICADO' AND datetime(COALESCE(e.termina_em,e.inicia_em))>=datetime(?) ORDER BY datetime(e.inicia_em),e.id LIMIT 5`).bind(uid,cid,now.toISOString()).all<CentralData["events"][number]>();
    data.events = rows.results;
  }));

  if (global && can("people.view", "people")) tasks.push(attempt("people", "Não foi possível consultar o total de pessoas.", async () => {
    const row = await db.prepare("SELECT COUNT(*) AS total FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id AND u.ativo=1 WHERE uc.comunidade_id=? AND uc.status='ATIVO'").bind(cid).first<{ total: number }>();
    data.metrics.push({ label: "Pessoas vinculadas", value: Number(row?.total || 0), detail: "Vínculos ativos hoje", href: "/painel?view=pessoas" });
  }));

  if (!options.personal && can("pastoral.panel.view")) tasks.push(attempt("pastoral", "Não foi possível consultar os relatórios pastorais.", async () => {
    const grant = await db.prepare(`SELECT c.id FROM comunidades c WHERE c.id=? AND c.status='ATIVA' AND (c.proprietario_usuario_id=? OR EXISTS (SELECT 1 FROM acessos_painel_pastoral a WHERE a.comunidade_id=c.id AND a.usuario_id=? AND a.ativo=1))`).bind(cid, uid, uid).first();
    if (!grant) { data.pastoralLocked = true; return; }
    if (can("cells.view", "cells")) {
      data.capabilities.cellReports = true;
      const rows = await db.prepare(`SELECT r.id,c.nome AS name,r.data_reuniao AS date,r.aconteceu AS happened,r.presentes AS attendees,r.visitantes AS visitors,r.observacoes AS notes
        FROM celula_relatorios r JOIN celulas c ON c.id=r.celula_id AND c.comunidade_id=r.comunidade_id
        WHERE r.comunidade_id=? AND c.ativo=1 AND c.escopo_confirmado=1 AND date(r.data_reuniao) BETWEEN date(?) AND date(?) ORDER BY r.data_reuniao DESC,r.id DESC LIMIT 51`).bind(cid, fromText, toText).all<Record<string, unknown>>();
      data.limits.cellReports = rows.results.length > 50;
      data.cellReports = rows.results.slice(0, 50).map(r => ({ id: Number(r.id), name: String(r.name), date: String(r.date), happened: Boolean(r.happened), attendees: Number(r.attendees), visitors: Number(r.visitors), notes: String(r.notes || "") }));
    }
  }));
  await Promise.all(tasks);
  if (can("ministries.view", "ministries") && !data.errors.some(e => e.section === "ministries")) {
    data.metrics.push({ label: leadership ? "Ministérios acompanhados" : "Meus ministérios", value: data.ministries.length, detail: data.limits.ministries ? "Primeiros 200 carregados" : "Vínculos ativos hoje", href: "/painel?view=ministerios" });
    if (can("schedules.view", "ministries")) {
      data.metrics.push({ label: "Confirmações pendentes", value: data.ministries.reduce((s, m) => s + m.pending, 0), detail: "Nas escalas futuras dos ministérios acima", href: "/painel?view=ministerios&tab=escalas" });
      data.metrics.push({ label: "Substituições solicitadas", value: data.ministries.reduce((s, m) => s + m.replacements, 0), detail: "Nas escalas futuras dos ministérios acima", href: "/painel?view=ministerios&tab=escalas" });
    }
  }
  if (data.unread !== null) data.metrics.push({ label: "Avisos não lidos", value: data.unread, detail: "Seus avisos nesta comunidade", href: "/painel?view=avisos" });
  return data;
}
