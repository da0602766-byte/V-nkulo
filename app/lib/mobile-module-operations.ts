import { getD1 } from '../../db';
import { privateHash } from './access-security';
import { mobileReply } from './mobile-write';
import { scheduleWebPushDelivery } from './push-delivery-queue';
import type { ModuleAccess } from './mobile-modules';
import type { MobileModule, ModulePayload } from './mobile-module-contract';
import { OWN_CHECKLIST } from './mobile-module-snapshot';

export async function commitModuleOperation(module: MobileModule, access: ModuleAccess, operation: string, p: ModulePayload) {
  const db=getD1(), c=access.context.comunidadeId, u=access.user.id, hash=await privateHash('mobile-module-payload',JSON.stringify({module,p}));
  const key=[u,c,operation,hash];
  const where=`usuario_id=? AND comunidade_id=? AND operation_id=? AND payload_hash=?`;
  const pending=`EXISTS(SELECT 1 FROM mobile_module_receipts WHERE ${where} AND result='PENDING')`;
  const confirmed=`SELECT result_id FROM mobile_module_receipts WHERE ${where} AND result='CONFIRMED' AND processed=0`;
  const sql=(s:string,...args:(string|number|null)[])=>db.prepare(s).bind(...args);
  const statements=[sql(`INSERT OR IGNORE INTO mobile_module_receipts(usuario_id,comunidade_id,operation_id,payload_hash,module,result) VALUES(?,?,?,?,?,'PENDING')`,...key,module)];
  let resultExpression='CAST(last_insert_rowid() AS TEXT)', resultArgs:(string|number)[]=[];
  if(module==='requests') {
    statements.push(sql(`INSERT INTO solicitacoes_comunidade(comunidade_id,solicitante_id,tipo,titulo,descricao,visibilidade,contato_autorizado)
      SELECT ?,?,?,?,?,?,0 WHERE ${pending}`,c,u,p.tipo,p.titulo,p.descricao,p.visibilidade,...key));
  } else if(module==='notes') {
    const now=new Date().toISOString(), note={id:operation,titulo:p.titulo||'Anotação de cuidado',texto:p.texto,cor:p.cor,visitanteId:null,visitanteNome:'',eventoId:null,eventoTitulo:'',checklist:[],criadoEm:now,atualizadoEm:now};
    // Atomic append; never truncates someone else's notes to make room.
    statements.push(sql(`INSERT INTO layouts_interface(comunidade_id,usuario_id,escopo,tipo,nome,configuracao,atualizado_por)
      SELECT ?,?,?,'PESSOAL','Post-its de cuidado',?,? WHERE ${pending}
      ON CONFLICT(comunidade_id,escopo) DO UPDATE SET
      configuracao=json_insert(layouts_interface.configuracao,'$.notes[#]',json(?)),versao=layouts_interface.versao+1,atualizado_por=?,atualizado_em=CURRENT_TIMESTAMP
      WHERE layouts_interface.usuario_id=? AND json_valid(layouts_interface.configuracao)
      AND json_type(layouts_interface.configuracao,'$.notes')='array' AND json_array_length(layouts_interface.configuracao,'$.notes')<80`,
      c,u,`care-notes:user:${u}`,JSON.stringify({notes:[note]}),u,...key,JSON.stringify(note),u,u));
    resultExpression='?';resultArgs=[operation];
  } else if(module==='followups') {
    statements.push(sql(`INSERT INTO acompanhamentos(comunidade_id,visitante_id,responsavel_email,tipo,resultado,descricao,proximo_contato,escopo_confirmado)
      SELECT ?,?,?,?,?,?,?,1 WHERE ${pending} AND EXISTS(SELECT 1 FROM visitantes v WHERE v.id=? AND v.comunidade_id=? AND v.ativo=1 AND v.escopo_confirmado=1)`,
      c,p.visitanteId,access.user.email,p.tipo,p.resultado,p.descricao,p.proximoContato||null,...key,p.visitanteId,c));
  } else if(module==='checklists') {
    statements.push(sql(`UPDATE ministerio_checklist_itens SET status=?,observacao=?,atualizado_por=?,atualizado_em=CURRENT_TIMESTAMP
      WHERE id=? AND id IN (${OWN_CHECKLIST}) AND COALESCE((SELECT version FROM mobile_checklist_versions WHERE item_id=ministerio_checklist_itens.id),0)=? AND ${pending}`,
      p.status,p.observacao,u,p.itemId,c,u,p.version,...key));
    resultExpression='CAST(? AS TEXT)';resultArgs=[p.itemId];
  } else if(module==='parking') {
    statements.push(sql(`INSERT INTO estacionamento_ocorrencias(comunidade_id,tipo,descricao,gravidade,criado_por)
      SELECT ?,?,?,?,? WHERE ${pending}`,c,p.tipo,p.descricao,p.gravidade,u,...key));
  } else return mobileReply({error:'Operação somente local.'},422);
  statements.push(sql(`UPDATE mobile_module_receipts SET result_id=CASE WHEN changes()=1 THEN ${resultExpression} ELSE NULL END,
    result=CASE WHEN changes()=1 THEN 'CONFIRMED' ELSE 'CONFLICT' END WHERE ${where} AND result='PENDING'`,...resultArgs,...key));
  if(module==='followups') statements.push(sql(`UPDATE visitantes SET status='EM_ACOMPANHAMENTO',atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND comunidade_id=? AND EXISTS(${confirmed})`,p.visitanteId,c,...key));
  if(module==='requests') {
    if(p.tipo==='ORACAO'||p.tipo==='VISITA') {
      statements.push(sql(`INSERT INTO solicitacao_repositorios(comunidade_id,tipo,nome,status,confirmado_por,confirmado_em)
        SELECT ?,?,?,'ATIVO',?,CURRENT_TIMESTAMP WHERE EXISTS(${confirmed}) ON CONFLICT(comunidade_id,tipo) DO UPDATE SET
        status='ATIVO',confirmado_por=COALESCE(confirmado_por,excluded.confirmado_por),confirmado_em=COALESCE(confirmado_em,CURRENT_TIMESTAMP),atualizado_em=CURRENT_TIMESTAMP`,
        c,p.tipo,p.tipo==='ORACAO'?'Repositório de orações':'Repositório de visitas',u,...key));
      statements.push(sql(`INSERT INTO solicitacao_repositorio_itens(repositorio_id,comunidade_id,solicitacao_id,encaminhado_por)
        SELECT r.id,?,receipt.result_id,? FROM solicitacao_repositorios r JOIN (${confirmed}) receipt
        WHERE r.comunidade_id=? AND r.tipo=?`,c,u,...key,c,p.tipo));
      statements.push(sql(`INSERT INTO solicitacao_eventos(comunidade_id,item_id,solicitacao_id,tipo,mensagem,visivel_membro,criado_por)
        SELECT ?,ri.id,ri.solicitacao_id,'PEDIDO_RECEBIDO','Pedido recebido pela comunidade.',1,? FROM solicitacao_repositorio_itens ri
        WHERE ri.comunidade_id=? AND ri.solicitacao_id IN (${confirmed})`,c,u,c,...key));
    }
    // Membership/audience is resolved inside the same transaction, not from a
    // device snapshot. Care routing keeps the existing prayer/visit semantics.
    statements.push(sql(`INSERT OR IGNORE INTO solicitacao_destinatarios(solicitacao_id,comunidade_id,usuario_id)
      SELECT receipt.result_id,?,users.id FROM (${confirmed}) receipt JOIN usuarios users
      JOIN usuario_comunidades uc ON uc.usuario_id=users.id AND uc.comunidade_id=? AND uc.status='ATIVO'
      WHERE users.ativo=1 AND (users.id=? OR (?='PASTORAL' AND uc.papel IN ('PASTOR','ADMIN_COMUNIDADE'))
      OR (?='GESTORES' AND uc.papel IN ('LIDER','PASTOR','ADMIN_COMUNIDADE'))
      OR (? IN ('ORACAO','VISITA') AND (uc.papel IN ('PASTOR','ADMIN_COMUNIDADE') OR EXISTS(
        SELECT 1 FROM solicitacao_repositorios r JOIN ministerios_comunidade m ON m.id=r.ministerio_id AND m.comunidade_id=r.comunidade_id
        WHERE r.comunidade_id=? AND r.tipo=? AND m.responsavel_usuario_id=users.id) OR EXISTS(
        SELECT 1 FROM oficiais_comunidade oc WHERE oc.usuario_comunidade_id=uc.id AND instr(','||COALESCE(oc.permissoes,'')||',',',requests.manage,')>0))))`,
      c,...key,c,u,p.visibilidade,p.visibilidade,p.tipo,c,p.tipo));
    statements.push(sql(`INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,entidade_id,usuario_id,comunidade_id,remetente_usuario_id,destino_rota,criado_por)
      SELECT 'INFO','Nova solicitação','Há um novo pedido para atendimento.','SOLICITACOES',d.solicitacao_id,d.usuario_id,?,?, '/painel?view=solicitacoes',?
      FROM solicitacao_destinatarios d WHERE d.comunidade_id=? AND d.usuario_id!=? AND d.solicitacao_id IN (${confirmed})`,c,u,access.user.email,c,u,...key));
    statements.push(sql(`UPDATE solicitacao_destinatarios SET notificado_em=CURRENT_TIMESTAMP WHERE comunidade_id=? AND usuario_id!=? AND solicitacao_id IN (${confirmed})`,c,u,...key));
  }
  if(module==='parking') statements.push(sql(`INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,entidade_id,usuario_id,comunidade_id,remetente_usuario_id,destino_rota,criado_por)
    SELECT 'INFO','Nova ocorrência no estacionamento','Uma ocorrência aguarda avaliação.','DIACONIA',r.result_id,uc.usuario_id,?,?, '/painel?view=estacionamento',?
    FROM (${confirmed}) r JOIN estacionamento_configuracoes cfg ON cfg.comunidade_id=?
    JOIN usuario_comunidades uc ON uc.comunidade_id=cfg.comunidade_id AND uc.usuario_id=json_extract(CASE WHEN json_valid(cfg.regras) THEN cfg.regras ELSE '{}' END,'$.responsavelUsuarioId')
    JOIN usuarios users ON users.id=uc.usuario_id WHERE uc.status='ATIVO' AND users.ativo=1 AND uc.usuario_id!=?`,c,u,access.user.email,...key,c,u));
  statements.push(sql(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados)
    SELECT comunidade_id,usuario_id,'MODULO_MOBILE_CONFIRMADO','SUCESSO',json_object('module',module,'operationId',operation_id,'resultId',result_id)
    FROM mobile_module_receipts WHERE ${where} AND result='CONFIRMED' AND processed=0`,...key));
  statements.push(sql(`UPDATE mobile_module_receipts SET processed=1 WHERE ${where}`, ...key));
  statements.push(sql('SELECT payload_hash,module,result,result_id FROM mobile_module_receipts WHERE usuario_id=? AND comunidade_id=? AND operation_id=?',u,c,operation));
  const results=await db.batch(statements), receipt=results.at(-1)?.results?.[0] as {payload_hash:string;module:string;result:string;result_id:string}|undefined;
  if(!receipt)throw new Error('Missing module receipt');
  if(receipt.payload_hash!==hash||receipt.module!==module)return mobileReply({error:'Identificador já usado com outros dados.',code:'OPERATION_MISMATCH'},409);
  if(receipt.result!=='CONFIRMED')return mobileReply({operationId:operation,result:'CONFLICT',error:'Registro alterado, removido, indisponível ou limite atingido. Confira online antes de criar outro envio.'},409);
  // Queue rows were inserted by the notification trigger in the transaction.
  if(module==='requests'||module==='parking')scheduleWebPushDelivery(db);
  return mobileReply({operationId:operation,result:'CONFIRMED',resultId:receipt.result_id});
}
