import { getD1 } from '../../db';
import { secureToken } from './access-security';
import { validatePlan } from './commerce-types';

export async function activateCommunity(id:number, ownerId:number, fundamento:string, referencia:string) {
  const db=getD1();
  const row=await db.prepare(`SELECT * FROM solicitacoes_log1 WHERE id=? AND status='CONTRATADA'`).bind(id).first<Record<string,unknown>>();
  if(!row) throw new Error('A solicitação precisa ter uma contratação confirmada.');
  const plan=validatePlan(JSON.parse(String(row.contrato)));
  if(!['GRATUITO','CONFIRMACAO_EXTERNA','ISENCAO'].includes(fundamento) || (fundamento==='GRATUITO' && plan.valor_centavos!==0)
    || (fundamento!=='GRATUITO' && referencia.trim().length<8)) throw new Error('Informe o fundamento legítimo da ativação e sua referência ou justificativa.');
  const nonce=secureToken(); const slug=`${String(row.comunidade_nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'comunidade'}-${nonce.slice(0,8)}`;
  const ends=plan.duracao_dias ? new Date(Date.now()+plan.duracao_dias*86400000).toISOString() : null;
  const result=await db.batch([
    db.prepare(`UPDATE solicitacoes_log1 SET ativacao_chave=? WHERE id=? AND status='CONTRATADA' AND datetime(retencao_ate)>CURRENT_TIMESTAMP
      AND EXISTS(SELECT 1 FROM planos_plataforma WHERE id=plano_id AND ativo=1)
      AND ((usuario_id IS NULL AND NOT EXISTS(SELECT 1 FROM usuarios WHERE lower(email)=solicitacoes_log1.email))
        OR EXISTS(SELECT 1 FROM usuarios WHERE id=usuario_id AND ativo=1))
      AND NOT EXISTS(SELECT 1 FROM identidades_cpf i WHERE i.usuario_id=solicitacoes_log1.usuario_id AND i.cpf_hash!=solicitacoes_log1.cpf_hash)`).bind(nonce,id),
    db.prepare(`INSERT INTO usuarios(nome,email,telefone,data_nascimento,perfil,permissoes,senha_hash,senha_salt,ativo)
      SELECT nome,email,telefone,nascimento,'ACOMPANHANTE','',senha_hash,senha_salt,1 FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=? AND usuario_id IS NULL`).bind(id,nonce),
    db.prepare(`UPDATE solicitacoes_log1 SET usuario_id=(SELECT id FROM usuarios WHERE lower(email)=solicitacoes_log1.email)
      WHERE id=? AND ativacao_chave=? AND usuario_id IS NULL`).bind(id,nonce),
    db.prepare(`INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) SELECT usuario_id,cpf_hash,cpf_finais FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?
      AND NOT EXISTS(SELECT 1 FROM identidades_cpf WHERE usuario_id=solicitacoes_log1.usuario_id)`).bind(id,nonce),
    db.prepare(`INSERT INTO comunidades(nome,slug,cidade_publica,proprietario_usuario_id,status,ambiente_demo,feed_publico_habilitado)
      SELECT comunidade_nome,?,comunidade_cidade,usuario_id,'ATIVA',0,0 FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(slug,id,nonce),
    db.prepare(`UPDATE solicitacoes_log1 SET comunidade_id=(SELECT id FROM comunidades WHERE slug=?) WHERE id=? AND ativacao_chave=?`).bind(slug,id,nonce),
    db.prepare(`INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,solicitacao_id,status,contrato,fundamento,referencia,aprovado_por,termina_em)
      SELECT comunidade_id,plano_id,id,'ATIVA',contrato,?,?,?,? FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(fundamento,referencia.slice(0,500),ownerId,ends,id,nonce),
    db.prepare(`INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) SELECT usuario_id,comunidade_id,'ADMIN_COMUNIDADE','ATIVO' FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(id,nonce),
    db.prepare(`INSERT INTO configuracoes(chave,valor,atualizado_por) SELECT 'community_modules:'||comunidade_id,?,? FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(JSON.stringify(plan.modulos),String(ownerId),id,nonce),
    db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT comunidade_id,?,'LOG1_ATIVADA','SUCESSO',? FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(ownerId,JSON.stringify({solicitacaoId:id,planoId:plan.id,fundamento}),id,nonce),
    db.prepare(`UPDATE solicitacoes_log1 SET status='ATIVADA',responsavel_id=?,senha_hash=NULL,senha_salt=NULL,atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND ativacao_chave=?`).bind(ownerId,id,nonce),
  ]);
  if(!result[0].meta.changes) throw new Error('A solicitação ou o responsável mudou. Revise antes de ativar.');
  return {ok:true};
}
