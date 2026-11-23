import { COMMUNITY_MODULES, normalizeCommunityModules } from "./community-modules";
import { readManagementReports } from "./management-report-data";
import { reportFilters, rollingReportPeriod } from "./management-reports";
import { permissionsForTenantRole } from "./tenant-policy.mjs";
import type { TenantContext } from "./tenant";

export type ReportFrequency = "SEMANAL" | "MENSAL";
export function nextReportRun(frequency: ReportFrequency, now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(12,0,0,0);
  if (frequency === "SEMANAL") {
    next.setUTCDate(next.getUTCDate() + (8 - next.getUTCDay()) % 7);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(1);
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.toISOString();
}

type Due = { comunidade_id: number; usuario_id: number; frequencia: ReportFrequency; dias: number; area: string; grupo: string; situacao: string;
  proxima_execucao: string; versao: number; papel: TenantContext["papel"]; modules: string | null; plan: string | null };

export async function deliverScheduledReports(db: D1Database, now = new Date()) {
  const due = await db.prepare(`SELECT r.*,uc.papel,cm.valor AS modules,s.contrato AS plan
    FROM relatorios_agendamentos r
    JOIN comunidades c ON c.id=r.comunidade_id AND c.status='ATIVA' AND c.proprietario_usuario_id=r.usuario_id
    JOIN usuarios u ON u.id=r.usuario_id AND u.ativo=1
    JOIN usuario_comunidades uc ON uc.comunidade_id=r.comunidade_id AND uc.usuario_id=r.usuario_id AND uc.status='ATIVO'
    LEFT JOIN assinaturas_comunidade s ON s.comunidade_id=r.comunidade_id
    LEFT JOIN configuracoes cm ON cm.chave='community_modules:'||r.comunidade_id
    WHERE r.proxima_execucao<=? AND (s.comunidade_id IS NULL OR (s.status='ATIVA' AND (s.termina_em IS NULL OR datetime(s.termina_em)>datetime(?))
      AND EXISTS(SELECT 1 FROM json_each(s.contrato,'$.recursos') WHERE value='reports')))
    ORDER BY r.proxima_execucao,r.comunidade_id LIMIT 30`).bind(now.toISOString(),now.toISOString()).all<Due>();
  for (const entry of due.results) {
    const defaults = COMMUNITY_MODULES.map(module => module.key);
    let modules = defaults;
    if (entry.modules) {
      try { modules = normalizeCommunityModules(JSON.parse(entry.modules),defaults); } catch { /* invalid legacy preference */ }
    }
    if (entry.plan) {
      const plan = JSON.parse(entry.plan) as { modulos?: string[] };
      modules = modules.filter(module => plan.modulos?.includes(module));
    }
    const period = rollingReportPeriod(entry.dias,new Date(entry.proxima_execucao));
    const query = new URLSearchParams({ ...period, area: entry.area, group: entry.grupo, status: entry.situacao });
    const filters = reportFilters(query);
    if (!filters) continue;
    const report = await readManagementReports(db,{
      comunidadeId: entry.comunidade_id,userId: entry.usuario_id,papel: entry.papel,
      permissions: permissionsForTenantRole(entry.papel).filter((permission: string) => permission !== "cells.view" || modules.includes("cells")),
      modules,isCommunityOwner: true,
    },filters,0);
    const { expected,received,overdue,reviewing } = report.metrics;
    const destination = `/painel?view=relatorios&${query.toString()}#historico-relatorios`;
    await db.batch([
      db.prepare(`UPDATE relatorios_agendamentos SET proxima_execucao=?,versao=versao+1
        WHERE comunidade_id=? AND usuario_id=? AND proxima_execucao=? AND versao=?
        AND EXISTS (SELECT 1 FROM comunidades c JOIN usuarios u ON u.id=c.proprietario_usuario_id AND u.ativo=1
          JOIN usuario_comunidades uc ON uc.usuario_id=u.id AND uc.comunidade_id=c.id AND uc.status='ATIVO'
          LEFT JOIN assinaturas_comunidade s ON s.comunidade_id=c.id
          WHERE c.id=relatorios_agendamentos.comunidade_id AND c.proprietario_usuario_id=relatorios_agendamentos.usuario_id AND c.status='ATIVA'
            AND (s.comunidade_id IS NULL OR (s.status='ATIVA' AND (s.termina_em IS NULL OR datetime(s.termina_em)>datetime(?))
              AND EXISTS(SELECT 1 FROM json_each(s.contrato,'$.recursos') WHERE value='reports'))))`)
        .bind(nextReportRun(entry.frequencia,now),entry.comunidade_id,entry.usuario_id,entry.proxima_execucao,entry.versao,now.toISOString()),
      db.prepare(`INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,comunidade_id,destino_rota,criado_por)
        SELECT 'INFO','Resumo de gestão disponível',?,'ESCALAS',?,?,?,'SISTEMA' WHERE changes()=1`)
        .bind(`${received} de ${expected} relatórios esperados recebidos, ${overdue} em atraso e ${reviewing} em revisão.`,entry.usuario_id,entry.comunidade_id,destination),
    ]);
  }
}
