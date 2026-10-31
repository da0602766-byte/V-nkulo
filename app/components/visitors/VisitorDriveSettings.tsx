"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {authorizeGoogle} from '../../lib/google-authorization-client';
import {MAX_VISITOR_ARCHIVE_BYTES,validateVisitorArchive,type VisitorArchive} from '../../lib/visitor-drive-format';
import {btnPri,btnSec} from './Views';

type Settings={state:'LEGACY'|'LOCKED'|'REVIEW'|'ACTIVE';revision:number;canManage:boolean;role:'READ'|'EDIT'|null;googleAvailable:boolean;googleConnected:boolean;googleEmail?:string;verifiedAt?:string;folderUrl?:string;grants:{usuario_id:number;nome:string;papel:'READ'|'EDIT'}[];members:{id:number;nome:string}[]};
const endpoint='/api/pilot/visitantes/armazenamento';
export default function VisitorDriveSettings({onChanged}:{onChanged:(state:string)=>void}) {
  const [data,setData]=useState<Settings|null>(null),[busy,setBusy]=useState('Carregando configuração…'),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [counts,setCounts]=useState<Record<string,number>|null>(null),[verified,setVerified]=useState<number|null>(null),[confirmation,setConfirmation]=useState('');
  const [backup,setBackup]=useState<VisitorArchive|null>(null),[restore,setRestore]=useState('');
  const [newFolder,setNewFolder]=useState(false);
  const working=useRef(false);
  const refresh=useCallback(async()=>{const r=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw new Error(body.error||'Não foi possível consultar a configuração.');setData(body);return body as Settings;},[]);
  useEffect(()=>{const controller=new AbortController();fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Não foi possível consultar a configuração.');return body;}).then(body=>{if(controller.signal.aborted)return;setData(body);const url=new URL(location.href);if(url.searchParams.has('googleErro'))setError(url.searchParams.get('googleErro')||'A autorização não foi concluída.');else if(url.searchParams.get('google')==='connected')setMessage('Conta autorizada. Você já pode continuar a preparação.');url.searchParams.delete('google');url.searchParams.delete('googleErro');history.replaceState(history.state,'',url);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy('');});return()=>controller.abort();},[]);
  async function act(action:string,label:string,extra:Record<string,unknown>={}) {
    if(working.current)return;working.current=true;setBusy(label);setError('');setMessage('');
    try {
      if(action==='authorize'){await authorizeGoogle(endpoint,{action});return;}
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});const body=await r.json();
      if(!r.ok)throw new Error(body.error||'Não foi possível concluir. Confira o estado antes de tentar novamente.');
      if(body.url){window.location.assign(body.url);return;}
      const updated=await refresh();
      onChanged(updated.state);
      if(body.counts)setCounts(body.counts);
      setVerified(action==='verify'?body.revision:null);
      setMessage(body.message||({grant:'Acesso concedido. A pessoa também precisa da permissão da aba.',revoke:'Acesso revogado. Cópias já baixadas não podem ser recolhidas.',verify:updated.state==='ACTIVE'?'Arquivo atual relido e validado no Google Drive.': 'Arquivo relido e validado. Confira as quantidades antes de confirmar.'} as Record<string,string>)[action]||'Concluído.');
      if(action==='activate'||action==='restore'||action==='cancel'){setConfirmation('');setRestore('');setBackup(null);}
      if(updated.state==='LEGACY')setCounts(null);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');await refresh().catch(()=>undefined);}finally{working.current=false;setBusy('');}
  }
  async function download() {
    if(working.current)return;working.current=true;setBusy('Lendo e verificando backup no Drive…');setError('');setMessage('');
    try{const r=await fetch('/api/pilot/visitantes/backup',{cache:'no-store'});if(!r.ok)throw new Error((await r.json()).error||'Falha ao baixar.');const blob=await r.blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'vinkulo-visitantes.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Download iniciado. Confira o arquivo na pasta de downloads; o navegador não confirma a gravação no dispositivo.');}
    catch(e){setError((e as Error).message);}finally{working.current=false;setBusy('');}
  }
  async function chooseFile(file?:File) {
    setBackup(null);setRestore('');setError('');if(!file)return;
    if(file.size>MAX_VISITOR_ARCHIVE_BYTES){setError('O backup deve ter até 4 MB.');return;}
    setBusy('Conferindo o arquivo no dispositivo…');
    try{const value=JSON.parse(await file.text());validateVisitorArchive(value,value.communityId);setBackup(value);}catch{setError('Arquivo inválido. Escolha um backup JSON completo do Vínkulo. Excel e CSV são importados em Importar / Exportar.');}finally{setBusy('');}
  }
  return <div className="vp-scroll vp-drive" aria-busy={!!busy}>
    {busy&&<p className="vp-drive-progress" role="status"><span className="vp-spinner" aria-hidden="true"/>{busy}</p>}
    {error&&<p className="vp-error" role="alert">{error}</p>}{message&&<p className="vp-drive-message" role="status">{message}</p>}
    {!data&&!busy&&<button className={btnSec} onClick={()=>{setBusy('Carregando configuração…');void refresh().catch(e=>setError(e.message)).finally(()=>setBusy(''));}}>Tentar novamente</button>}
    {data&&<>
      <section><h2>{data.state==='ACTIVE'?'Cadastros no Google Drive':data.state==='REVIEW'?'Cópia verificada; falta confirmar':data.state==='LOCKED'?'Preparação em andamento':'Mover os cadastros para o Google Drive'}</h2>
        <p>{data.state==='ACTIVE'?'Fichas, categorias e históricos são lidos do Drive. A plataforma guarda a referência ao arquivo e as permissões de acesso.':'Os dados existentes ainda estão no banco da plataforma. A preparação congela as alterações e verifica uma cópia completa no Drive antes de permitir a remoção da origem.'}</p>
        {!data.canManage&&<p>O gestor responsável pela conexão configura o Drive e concede acesso. Seu acesso: {data.role==='EDIT'?'edição, respeitando as permissões da aba':data.role==='READ'?'consulta':'não concedido'}.</p>}
        {data.googleEmail&&<p>Conta responsável: <strong>{data.googleEmail}</strong></p>}
        {data.canManage&&!data.googleAvailable&&<p role="alert">A integração Google precisa ser configurada pelo administrador antes da migração.</p>}
        {data.canManage&&<div className="vp-actions"><button className={btnSec} disabled={!!busy||!data.googleAvailable} onClick={()=>void act('authorize','Abrindo autorização do Google…')}>{data.googleConnected?'Reconectar conta Google':'Conectar conta Google'}</button>{data.folderUrl&&<a href={data.folderUrl} target="_blank" rel="noreferrer">Abrir pasta privada no Drive ↗</a>}</div>}
      </section>
      {data.canManage&&data.state!=='ACTIVE'&&<section><h2>Migração com conferência</h2><ol><li>Preparar e verificar a cópia completa no Drive.</li><li>Conferir quantidades e baixar um backup no dispositivo.</li><li>Confirmar a remoção da origem e ativar o Drive.</li></ol>
        <p>Inclui fichas ativas e arquivadas, categorias, campos adicionais, acompanhamentos, contatos, visitas e anotações privadas. Excel e CSV continuam disponíveis como planilhas, mas não substituem o backup completo.</p>
        {['LEGACY','LOCKED'].includes(data.state)&&<button className={btnPri} disabled={!!busy||!data.googleConnected} onClick={()=>void act('prepare','Preparando, enviando e relendo o arquivo no Drive…')}>{data.state==='LOCKED'?'Retomar preparação':'Preparar migração'}</button>}
        {data.state==='REVIEW'&&<><div className="vp-actions"><button className={btnPri} disabled={!!busy} onClick={()=>void act('verify','Comparando o arquivo do Drive com a origem…')}>Verificar antes de migrar</button><button className={btnSec} disabled={!!busy} onClick={()=>void download()}>Baixar backup completo</button></div>
          {counts&&<dl className="vp-drive-counts">{Object.entries(counts).map(([key,value])=><div key={key}><dt>{({visitantes:'Fichas',acompanhamentos:'Acompanhamentos',visitor_contacts:'Contatos',visitor_visits:'Visitas',visitante_categorias:'Categorias',visitante_campos:'Campos adicionais'} as Record<string,string>)[key]||key}</dt><dd>{value}</dd></div>)}</dl>}
          <p>Ao confirmar, os registros sairão das tabelas operacionais da plataforma. Backups técnicos antigos do provedor seguem seu prazo de retenção. A cópia antiga do Google Sheets, se houver, continua no seu Google.</p>
          <label htmlFor="vp-drive-confirm">Digite MIGRAR VISITANTES<input id="vp-drive-confirm" autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={!!busy}/></label>
          <button className={btnPri} disabled={!!busy||verified!==data.revision||confirmation!=='MIGRAR VISITANTES'} onClick={()=>void act('activate','Verificando novamente e ativando o Drive…',{revision:verified,confirmation})}>Confirmar migração e remover origem</button></>}
        {data.state!=='LEGACY'&&<button className={btnSec} disabled={!!busy} onClick={()=>void act('cancel','Cancelando preparação e preservando a origem…')}>Cancelar preparação</button>}
      </section>}
      {data.canManage&&data.state==='ACTIVE'&&<>
        <section><h2>Acessos aos cadastros</h2><p>Escolha os membros e as permissões em Compartilhar lista. Mantenha a pasta técnica privada no Google Drive.</p><a href="/painel/visitantes?section=compartilhar" className={btnSec}>Compartilhar lista</a></section>
        <section><h2>Backup e recuperação</h2><div className="vp-actions"><button className={btnPri} disabled={!!busy} onClick={()=>void download()}>Baixar backup completo</button><button className={btnSec} disabled={!!busy} onClick={()=>void act('verify','Verificando a integridade no Drive…')}>Verificar arquivo atual</button></div>
          <p>O JSON preserva o histórico e os campos originais. Contém dados pessoais: guarde em local protegido. As anotações privadas são criptografadas e precisam da chave desta instalação para recuperação.</p>
          <details><summary>Restaurar um backup</summary><p>A restauração substitui os cadastros atuais. A versão anterior permanece na pasta do Drive. Arquivos de outra comunidade e estruturas incompatíveis serão recusados.</p><label htmlFor="vp-drive-backup">Arquivo JSON<input id="vp-drive-backup" type="file" accept=".json,application/json" disabled={!!busy} onChange={e=>void chooseFile(e.target.files?.[0])}/></label>{backup&&<><p>Arquivo selecionado: {backup.tables.visitantes.length} fichas. A comunidade e a integridade serão verificadas antes da gravação.</p><label className="vp-drive-check"><input type="checkbox" checked={newFolder} onChange={e=>setNewFolder(e.target.checked)} disabled={!!busy}/>Criar uma nova pasta privada no Drive para a recuperação</label><label>Digite RESTAURAR BACKUP<input value={restore} onChange={e=>setRestore(e.target.value)} disabled={!!busy} autoComplete="off"/></label><button className={btnPri} disabled={!!busy||restore!=='RESTAURAR BACKUP'} onClick={()=>void act('restore','Validando e restaurando o backup no Drive…',{archive:backup,revision:data.revision,confirmation:restore,newFolder})}>Restaurar backup</button></>}</details>
        </section>
      </>}
      <section><h2>Disponibilidade e privacidade</h2><p>A consulta exige internet e autorização válida da conta Google responsável. Não há uma cópia de emergência das fichas no banco do Vínkulo.</p><p>Envios offline antigos do aplicativo precisam ser concluídos online. As anotações continuam privadas na interface; avisos automáticos de post-its em segundo plano ficam suspensos após a migração. As datas dos lembretes permanecem nas anotações.</p><p>O arquivo técnico suporta até 4 MB. Se esse limite for atingido, o sistema recusa a alteração e preserva a versão anterior. Versões anteriores ficam no seu Drive para recuperação.</p></section>
    </>}
  </div>;
}
