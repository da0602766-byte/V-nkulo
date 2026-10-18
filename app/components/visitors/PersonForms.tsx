"use client";
import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Dialog} from './Dialog';
import {Badge,btnPri,btnSec,fmt} from './Views';
import {api,answer,today,age,statuses,whatsapp,type Pessoa,type Categoria,type Named,type PerfilConfig,type Raw} from './data';
import {VisitorCustomFields,customValuesFromForm} from '../VisitorCustomFields';
import {type VisitorCustomField} from '../../lib/visitor-spreadsheet';
import {visitorIntegrationGaps} from '../../lib/visitor-care';

type Save = (body:Record<string,unknown>)=>Promise<boolean>;
export function Field({label,children}:{label:string;children:ReactNode}) {return <label className="vp-field"><span>{label}</span>{children}</label>;}
export function PersonForm({person,categories,cells,fields,onClose,onSave}:{person?:Pessoa;categories:Categoria[];cells:Named[];fields:VisitorCustomField[];onClose:()=>void;onSave:Save}) {
  const v=person?.raw||{};
  const [discipulado,setDiscipulado]=useState(String(v.discipulado||'NAO_INFORMADO'));
  const [oficial,setOficial]=useState(String(v.oficial||'NAO_INFORMADO'));
  const [duplicates,setDuplicates]=useState<Raw[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const text=(name:string,column:string,label:string,max=120,type='text',required=false)=><Field label={label}><input name={name} defaultValue={String(v[column]||'')} maxLength={max} type={type} required={required} max={type==='date'?today():undefined}/></Field>;
  const tri=(name:string,column:string,label:string,onChange?:(s:string)=>void)=><Field label={label}><select name={name} defaultValue={String(v[column]||'NAO_INFORMADO')} onChange={e=>onChange?.(e.target.value)}><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></Field>;
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    const fd=new FormData(event.currentTarget), body:Record<string,unknown>=Object.fromEntries(fd.entries());
    body.camposPersonalizados=customValuesFromForm(fd); body.encontroComDeus=fd.has('encontroComDeus');body.cursoMembros=fd.has('cursoMembros');body.confirmarDuplicidade=fd.has('confirmarDuplicidade');
    try {await onSave(body);} catch(caught) {const e=caught as Error&{duplicates?:Raw[]};setError(e.message);setDuplicates(e.duplicates||[]);} finally {setBusy(false);}
  }
  return <Dialog wide title={person?'Editar cadastro':'Novo cadastro'} onClose={()=>{if(!busy)onClose();}}><form className="vp-form" onSubmit={submit}>
    <p className="vp-muted">Uma ficha por pessoa. Os campos com * são obrigatórios.</p>
    <fieldset disabled={busy}><legend>Identificação e contato</legend><div className="vp-form-grid">
      {text('nomeCompleto','nome_completo','Nome completo *',120,'text',true)}
      {text('dataNascimento','data_nascimento','Nascimento',10,'date')}
      {text('telefone','telefone','Telefone / WhatsApp',30,'tel')}{text('email','email','E-mail',180,'email')}
      <Field label="Chegada à igreja *"><input type="date" name="dataEntrada" required max={today()} defaultValue={String(v.data_entrada||today())}/></Field>
      <Field label="Vínculo"><select name="tipoPessoa" defaultValue={String(v.tipo_pessoa||'VISITANTE')}><option value="VISITANTE">Visitante</option><option value="MEMBRO">Membro</option></select></Field>
      {text('endereco','endereco','Endereço',250)}{text('acompanhante','acompanhante','Quem recebeu')}{text('parente','parente','Parente / contato de referência')}
    </div></fieldset>
    <fieldset disabled={busy}><legend>Integração e acompanhamento</legend><div className="vp-form-grid">
      <Field label="Status"><select name="status" defaultValue={String(v.status||'NOVO')}>{Object.entries(statuses).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></Field>
      <Field label="Categoria"><select name="categoriaId" defaultValue={String(v.categoria_id||'')}><option value="">Automática pela idade / sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <Field label="Célula"><select name="celulaId" defaultValue={String(v.celula_id||'')}><option value="">Ainda sem célula</option>{cells.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      {text('ministerio','ministerio','Ministério')}{tri('batizado','batizado','Já se batizou?')}{tri('certificadoBatismo','certificado_batismo','Recebeu o certificado de batismo?')}
      {tri('discipulado','discipulado','Participa de discipulado?',setDiscipulado)}
      <Field label={`Discipulador ou discipuladora${discipulado==='SIM'?' *':''}`}><input name="discipulador" defaultValue={String(v.discipulador||'')} maxLength={120} required={discipulado==='SIM'} disabled={discipulado==='NAO'}/></Field>
      {tri('oficial','oficial','É oficial da igreja?',setOficial)}
      <Field label={`Função do oficial${oficial==='SIM'?' *':''}`}><input name="funcaoOficial" defaultValue={String(v.funcao_oficial||'')} maxLength={120} required={oficial==='SIM'} disabled={oficial==='NAO'}/></Field>
      <label className="vp-check"><input type="checkbox" name="encontroComDeus" defaultChecked={!!v.encontro_com_deus}/>Participou do Encontro com Deus</label>
      <label className="vp-check"><input type="checkbox" name="cursoMembros" defaultChecked={!!v.curso_membros}/>Participou do curso de membros</label>
    </div></fieldset>
    <fieldset disabled={busy}><legend>Doa a Doa</legend><div className="vp-form-grid">{tri('doaADoa','doa_a_doa','Participa do Doa a Doa?')}{tri('doaReceber','doa_receber','Deve receber apoio?')}</div>
      <Field label="Doações realizadas"><textarea name="doacoesRealizadas" rows={3} maxLength={1500} defaultValue={String(v.doacoes_realizadas||'')} placeholder="Data, itens ou valor e destino de cada doação"/></Field>
    </fieldset>
    <fieldset disabled={busy}><legend>Próximos passos</legend><div className="vp-form-grid">{text('responsavelAcompanhamento','responsavel_acompanhamento','Responsável pelo cuidado')}
      <Field label="Prazo da próxima ação"><input type="date" name="dataProximaAcao" defaultValue={String(v.data_proxima_acao||'')}/></Field></div>
      <Field label="Próxima ação"><textarea name="proximaAcao" rows={2} maxLength={300} defaultValue={String(v.proxima_acao||'')}/></Field>
      <Field label="Observações"><textarea name="observacoes" rows={3} maxLength={1000} defaultValue={String(v.observacoes||'')}/></Field>
      <VisitorCustomFields fields={fields} values={String(v.campos_personalizados||'{}')}/>
    </fieldset>
    {duplicates.length>0&&<div className="vp-warning"><strong>Confira as fichas semelhantes:</strong><ul>{duplicates.map(d=><li key={String(d.id)}>{String(d.nome_completo||d.nome)} · {String(d.telefone||d.email||'Sem contato')}</li>)}</ul><label className="vp-check"><input type="checkbox" name="confirmarDuplicidade"/>Conferi e esta é outra pessoa. Criar uma nova ficha.</label></div>}
    {error&&<p role="alert" className="vp-error">{error}</p>}
    <footer className="vp-actions"><button type="button" className={btnSec} disabled={busy} onClick={onClose}>Cancelar</button><button className={btnPri} disabled={busy}>{busy?'Salvando…':'Salvar cadastro'}</button></footer>
  </form></Dialog>;
}

type History = {id:number;tipo:string;resultado:string;descricao:string;proximo_contato:string;criado_em:string;responsavel_email:string};
export function PersonDetails({person:p,fields,profile,canViewHistory,onClose,onEdit,onAction,onContact}:{person:Pessoa;fields:VisitorCustomField[];profile:PerfilConfig;canViewHistory:boolean;onClose:()=>void;onEdit:()=>void;onAction:(action:'arquivar'|'excluir'|'reativar'|'concluir')=>void;onContact:()=>void}) {
  const [history,setHistory]=useState<History[]>([]),[cursor,setCursor]=useState<number|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function load(cursor?:number) {setLoading(true);setError('');try{const r=await api<{acompanhamentos:History[];nextCursor:number|null}>(`/api/pilot/acompanhamentos?visitanteId=${p.id}&limite=50${cursor?`&cursor=${cursor}`:''}`);setHistory(old=>cursor?[...old,...r.acompanhamentos]:r.acompanhamentos);setCursor(r.nextCursor);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{if(canViewHistory)void load();},[p.id,canViewHistory,p.ultimo]);
  const v=p.raw, gaps=visitorIntegrationGaps(v), details:[string,string][]=[['Nascimento',p.nascimento?`${fmt(p.nascimento)} · ${age(p.nascimento)} anos`:'Não informado'],['Chegada',fmt(p.entrada)],['Categoria',p.categoria||'Sem categoria'],['Célula',p.celula||'Não vinculada'],['Ministério',p.ministerio||'Não informado'],['Responsável',p.responsavel||String(v.responsavel_categoria||'Não definido')],['Quem recebeu',p.recebeu||'Não informado'],['Batismo',p.batizado],['Certificado',p.certificado],['Discipulado',`${p.discipulado}${v.discipulador?` · ${v.discipulador}`:''}`],['Encontro com Deus',v.encontro_com_deus?'Sim':'Não registrado'],['Curso de membros',v.curso_membros?'Sim':'Não registrado'],['Doa a Doa',answer(v.doa_a_doa)],['Receber apoio',p.apoio],['Oficial',`${answer(v.oficial)}${v.funcao_oficial?` · ${v.funcao_oficial}`:''}`],['Endereço',String(v.endereco||'Não informado')],['Parente',String(v.parente||'Não informado')]];
  return <Dialog wide title={p.nome} onClose={onClose}><div className="vp-details"><div className="vp-person-heading"><span>{p.tipo}</span><Badge s={p.status}/>{p.arquivado&&<strong>Arquivado</strong>}</div>
    <div className="vp-actions">{p.telefone&&<><a className={btnSec} href={`https://wa.me/${whatsapp(p.telefone)}`} target="_blank" rel="noreferrer">WhatsApp ↗</a><a className={btnSec} href={`tel:${p.telefone.replace(/[^+\d]/g,'')}`}>{p.telefone}</a></>}{p.email&&<a href={`mailto:${p.email}`}>{p.email}</a>}
      {!p.arquivado&&profile.podeEditarPessoa&&<button className={btnSec} onClick={onEdit}>Editar cadastro</button>}
      {!p.arquivado&&profile.podeRegistrarContato&&<button className={btnPri} onClick={onContact}>Registrar contato</button>}
    </div>
    {p.proximaAcao&&<section className="vp-next"><small>PRÓXIMA AÇÃO</small><h3>{p.proximaAcao}</h3><p>{p.prazo?`Prazo: ${fmt(p.prazo)}`:'Sem prazo definido'}</p>{!p.arquivado&&profile.podeEditarPessoa&&<button className={btnSec} onClick={()=>onAction('concluir')}>Concluir ação</button>}</section>}
    {p.retorno&&<p>Próximo contato: <strong>{fmt(p.retorno)}</strong></p>}
    {!!gaps.length&&<div className="vp-gaps">{gaps.map(g=><span key={g}>{g}</span>)}</div>}
    <dl className="vp-data-grid">{details.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {v.doacoes_realizadas&&<section><h3>Doações realizadas</h3><p className="vp-pre">{v.doacoes_realizadas}</p></section>}
    {p.observacoes&&<section><h3>Observações</h3><p className="vp-pre">{p.observacoes}</p></section>}
    <VisitorCustomFields fields={fields} values={String(v.campos_personalizados||'{}')} readOnly/>
    <section><h3>Histórico de contatos</h3>{!canViewHistory?<p className="vp-muted">Seu acesso não permite consultar o histórico.</p>:<><ol className="vp-history">{history.map(h=><li key={h.id}><small>{new Date(h.criado_em.replace(' ','T')+'Z').toLocaleString('pt-BR')} · {h.tipo} · {h.responsavel_email}</small><strong>{h.resultado}</strong>{h.descricao&&<p className="vp-pre">{h.descricao}</p>}{h.proximo_contato&&<small>Retorno: {fmt(h.proximo_contato)}</small>}</li>)}</ol>{!history.length&&!loading&&!error&&<p className="vp-muted">Nenhum contato registrado.</p>}{loading&&<p role="status">Carregando histórico…</p>}{error&&<p role="alert" className="vp-error">{error} <button onClick={()=>void load()}>Tentar novamente</button></p>}{cursor&&<button className={btnSec} disabled={loading} onClick={()=>void load(cursor)}>Carregar contatos anteriores</button>}</>}</section>
    <footer className="vp-actions vp-danger-actions">{profile.podeArquivar&&<button className={btnSec} disabled={p.arquivado&&!profile.podeEditarPessoa} onClick={()=>onAction(p.arquivado?'reativar':'arquivar')}>{p.arquivado?'Reativar ficha':'Arquivar ficha'}</button>}{profile.podeExcluir&&<button className={btnSec} onClick={()=>onAction('excluir')}>Excluir definitivamente</button>}</footer>
  </div></Dialog>;
}

export function ContactForm({person,onClose,onSave}:{person:Pessoa;onClose:()=>void;onSave:Save}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Dialog title={`Registrar contato · ${person.nome}`} onClose={()=>{if(!busy)onClose();}}><form className="vp-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');const data=Object.fromEntries(new FormData(e.currentTarget));try{await onSave({...data,visitanteId:Number(person.id)});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <Field label="Canal"><select name="tipo">{[['WHATSAPP','WhatsApp'],['TELEFONE','Telefone'],['PRESENCIAL','Presencial'],['VISITA','Visita'],['EMAIL','E-mail'],['OUTRO','Outro']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="Resultado *"><input name="resultado" required maxLength={160} placeholder="Ex.: conversamos e combinamos uma visita"/></Field>
    <Field label="Anotações do contato"><textarea name="descricao" rows={4} maxLength={1500}/></Field>
    <Field label="Próximo contato (opcional)"><input type="date" name="proximoContato"/></Field><p className="vp-muted">Este contato ficará no histórico. O retorno substitui o agendamento do contato anterior.</p>
    {error&&<p role="alert" className="vp-error">{error}</p>}<footer className="vp-actions"><button className={btnSec} type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className={btnPri} disabled={busy}>{busy?'Salvando…':'Salvar contato'}</button></footer>
  </form></Dialog>;
}
