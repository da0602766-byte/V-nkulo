import { getD1 } from '../../db';
import type { ModuleAccess } from './mobile-modules';
import type { MobileModule } from './mobile-module-contract';

// Same predicate for both reads and conditional writes; no manager override.
export const OWN_CHECKLIST = `SELECT ci.id FROM ministerio_checklist_itens ci
 JOIN escala_designacoes d ON d.id=ci.designacao_id AND d.comunidade_id=ci.comunidade_id AND d.escala_id=ci.escala_id
 JOIN escalas_ministerio e ON e.id=ci.escala_id AND e.comunidade_id=ci.comunidade_id
 JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=e.comunidade_id
 JOIN ministerio_voluntarios v ON v.id=d.voluntario_id AND v.comunidade_id=d.comunidade_id AND v.usuario_id=d.usuario_id AND v.ministerio_id=e.ministerio_id
 WHERE ci.comunidade_id=? AND d.usuario_id=? AND d.ativo=1 AND v.ativo=1 AND m.status='ATIVO' AND e.status='PUBLICADA'`;

export async function moduleSnapshot(module: MobileModule, access: ModuleAccess) {
  const db = getD1(), c = access.context.comunidadeId, u = access.user.id;
  const rows = async (sql: string, ...params: (string|number)[]) => (await db.prepare(sql).bind(...params).all()).results;
  if (module === 'requests') return {items:await rows(`SELECT id,titulo AS label,substr(descricao,1,2000) AS text,status,criado_em AS date FROM solicitacoes_comunidade WHERE comunidade_id=? AND solicitante_id=? ORDER BY id DESC LIMIT 50`,c,u),options:[]};
  if (module === 'notes') {
    const row = await db.prepare('SELECT configuracao FROM layouts_interface WHERE comunidade_id=? AND escopo=? AND usuario_id=?').bind(c,`care-notes:user:${u}`,u).first<{configuracao:string}>();
    let notes: Record<string,unknown>[] = [];
    try { const data=JSON.parse(row?.configuracao || '{}'); if(Array.isArray(data.notes))notes=data.notes.filter((n:unknown)=>n && typeof n==='object' && !Array.isArray(n)).sort((a:Record<string,unknown>,b:Record<string,unknown>)=>String(b.atualizadoEm||'').localeCompare(String(a.atualizadoEm||''))).slice(0,50); } catch { /* corrupted data is never exported */ }
    return {items:notes.map(n=>({id:String(n.id).slice(0,80),label:String(n.titulo||'Anotação').slice(0,100),text:String(n.texto||'').slice(0,1200),date:String(n.atualizadoEm||'').slice(0,30)})),options:[]};
  }
  if (module === 'followups') {
    // Only people already accompanied by this account, not a bulk directory.
    const options=await rows(`SELECT DISTINCT v.id,substr(v.nome_completo,1,120) AS label FROM visitantes v JOIN acompanhamentos a ON a.visitante_id=v.id AND a.comunidade_id=v.comunidade_id
      WHERE v.comunidade_id=? AND v.ativo=1 AND v.escopo_confirmado=1 AND a.escopo_confirmado=1 AND a.responsavel_email=? ORDER BY v.id DESC LIMIT 50`,c,access.user.email);
    return {items:await rows(`SELECT a.id,substr(v.nome_completo,1,120) AS label,substr(a.resultado||' — '||COALESCE(a.descricao,''),1,1663) AS text,a.criado_em AS date
      FROM acompanhamentos a JOIN visitantes v ON v.id=a.visitante_id AND v.comunidade_id=a.comunidade_id WHERE a.comunidade_id=? AND a.responsavel_email=? AND a.escopo_confirmado=1 AND v.ativo=1 AND v.escopo_confirmado=1 ORDER BY a.id DESC LIMIT 40`,c,access.user.email),options};
  }
  if (module === 'checklists') {
    const items=await rows(`SELECT ci.id,substr(ci.tarefa,1,300) AS label,substr(ci.observacao,1,600) AS text,ci.status,COALESCE(v.version,0) AS version
      FROM ministerio_checklist_itens ci LEFT JOIN mobile_checklist_versions v ON v.item_id=ci.id WHERE ci.id IN (${OWN_CHECKLIST}) ORDER BY ci.id DESC LIMIT 50`,c,u);
    const memberships=await rows(`SELECT m.id,substr(m.nome,1,120) AS label,COALESCE(group_concat(DISTINCT e.nome),'') AS text FROM ministerios_comunidade m
      JOIN ministerio_voluntarios v ON v.ministerio_id=m.id AND v.comunidade_id=m.comunidade_id
      LEFT JOIN ministerio_equipe_membros em ON em.voluntario_id=v.id AND em.comunidade_id=v.comunidade_id
      LEFT JOIN ministerio_equipes e ON e.id=em.equipe_id AND e.comunidade_id=m.comunidade_id AND e.ativa=1
      WHERE m.comunidade_id=? AND v.usuario_id=? AND v.ativo=1 AND m.status='ATIVO' GROUP BY m.id ORDER BY m.id LIMIT 30`,c,u);
    return {items,options:items,memberships};
  }
  if (module === 'cells') {
    const items=await rows(`SELECT id,substr(nome,1,120) AS label,substr(descricao_publica||' — '||endereco_publico||' — '||horario_texto,1,1500) AS text
      FROM celulas WHERE comunidade_id=? AND ativo=1 AND escopo_confirmado=1 AND datetime(COALESCE(ultimo_relatorio_em,criado_em))>datetime('now','-60 days') AND
      (lider_usuario_id=? OR vice_lider_usuario_id=? OR criado_por=? OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(membros) THEN membros ELSE '[]' END) WHERE json_extract(CASE WHEN type='object' THEN value ELSE '{}' END,'$.kind')='COMMUNITY' AND json_extract(CASE WHEN type='object' THEN value ELSE '{}' END,'$.userId')=?)) ORDER BY id DESC LIMIT 50`,c,u,u,access.user.email,u);
    return {items,options:items};
  }
  return {items:await rows(`SELECT r.id,substr(r.evento_titulo||' — '||v.codigo,1,200) AS label,substr(r.codigo||' — '||r.inicio_em||' / '||r.fim_em,1,300) AS text,r.status,r.atualizado_em AS date
    FROM estacionamento_reservas r JOIN estacionamento_vagas v ON v.id=r.vaga_id AND v.comunidade_id=r.comunidade_id WHERE r.comunidade_id=? AND r.usuario_id=? ORDER BY r.id DESC LIMIT 50`,c,u),options:[]};
}
