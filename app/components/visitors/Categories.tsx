"use client";
import {useState} from 'react';
import {Dialog} from './Dialog';
import {Field} from './PersonForms';
import {Header,btnPri,btnSec,Confirm} from './Views';
import {api,type Categoria,type Named,type Pessoa} from './data';

export default function Categories({categories,people,responsibles,ministries,canManage,onChanged}:{categories:Categoria[];people:Pessoa[];responsibles:Named[];ministries:Named[];canManage:boolean;onChanged:()=>Promise<void>}) {
  const [editing,setEditing]=useState<Categoria|'new'|null>(null),[deleting,setDeleting]=useState<Categoria|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const c=editing&&editing!=='new'?editing:null;
  return <><Header title="Categorias" sub="Classificação, responsáveis e regras de integração">{canManage&&<button className={btnPri} onClick={()=>{setError('');setEditing('new');}}>＋ Nova categoria</button>}</Header><div className="vp-scroll">
    <div className="vp-category-grid">{categories.map(c=><article key={c.id} className="vp-category"><header><h2>{c.nome}</h2><span>{people.filter(p=>!p.arquivado&&p.categoria===c.nome).length} pessoas</span></header><p>{c.descricao||'Sem descrição'}</p><dl><div><dt>Responsável</dt><dd>{c.responsavel||'Não definido'}</dd></div><div><dt>Ministério</dt><dd>{c.ministerio||'Não associado'}</dd></div><div><dt>Classificação</dt><dd>{c.raw.migracao_automatica?`${c.idadeMin??0} a ${c.idadeMax??130} anos`:'Manual'}</dd></div></dl>{canManage&&<footer><button onClick={()=>{setError('');setEditing(c);}}>Editar categoria</button><button onClick={()=>{setError('');setDeleting(c);}}>Excluir</button></footer>}</article>)}</div>
    {!categories.length&&<p className="vp-empty">Nenhuma categoria criada nesta comunidade.</p>}{error&&!editing&&<p role="alert" className="vp-error">{error}</p>}
  </div>
  {editing&&<Dialog title={c?'Editar categoria':'Nova categoria'} onClose={()=>{if(!busy)setEditing(null);}}><form className="vp-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');const fd=new FormData(e.currentTarget);try{await api(`/api/pilot/visitante-categorias${c?`/${c.id}`:''}`,c?'PATCH':'POST',{...Object.fromEntries(fd),icone:c?.raw.icone||'◎',cor:c?.raw.cor||'#4f46e5',ordem:c?.raw.ordem,migracaoAutomatica:fd.has('migracaoAutomatica'),exibirDashboard:fd.has('exibirDashboard')});setEditing(null);await onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <Field label="Nome *"><input name="nome" required maxLength={80} defaultValue={c?.nome}/></Field><Field label="Descrição"><textarea name="descricao" maxLength={240} rows={2} defaultValue={c?.descricao}/></Field>
    <Field label="Responsável padrão"><select name="responsavelUsuarioId" defaultValue={String(c?.raw.responsavel_usuario_id||'')}><option value="">Não definido</option>{responsibles.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></Field>
    <Field label="Ministério associado"><select name="ministerioId" defaultValue={String(c?.raw.ministerio_id||'')}><option value="">Não associado</option>{ministries.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></Field>
    <label className="vp-check"><input type="checkbox" name="migracaoAutomatica" defaultChecked={!!c?.raw.migracao_automatica}/>Classificar automaticamente pela idade</label>
    <div className="vp-form-grid"><Field label="Idade mínima"><input name="idadeMinima" type="number" min={0} max={130} defaultValue={c?.idadeMin}/></Field><Field label="Idade máxima"><input name="idadeMaxima" type="number" min={0} max={130} defaultValue={c?.idadeMax}/></Field></div>
    <label className="vp-check"><input type="checkbox" name="exibirDashboard" defaultChecked={c?.indicadores??true}/>Exibir nos indicadores por categoria</label>
    {error&&<p role="alert" className="vp-error">{error}</p>}<footer className="vp-actions"><button type="button" className={btnSec} disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button><button className={btnPri} disabled={busy}>{busy?'Salvando…':'Salvar categoria'}</button></footer>
  </form></Dialog>}
  {deleting&&<Confirm title={`Excluir ${deleting.nome}?`} body="As pessoas continuam cadastradas e ficam sem esta categoria. A regra automática desta categoria também será removida." danger action={busy?'Excluindo…':'Excluir categoria'} onCancel={()=>{if(!busy)setDeleting(null);}} onConfirm={async()=>{if(busy)return;setBusy(true);try{await api(`/api/pilot/visitante-categorias/${deleting.id}`,'DELETE');setDeleting(null);await onChanged();}catch(e){setError((e as Error).message);setDeleting(null);}finally{setBusy(false);}}}/>}
  </>;
}
