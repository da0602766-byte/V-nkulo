"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {mergeDriveNoticeMemory,parseDriveNoticeMemory,type DriveNoticeCheck} from '../lib/feed-drive-notice';
import {useBrowserStorage} from './useBrowserStorage';
import FeedIcon from './feed/FeedIcon';
import './feed-drive-storage-notice.css';

function FullCloud() {
  return <div className="fd-cloud-art" aria-hidden="true"><div className="fd-cloud-floor"/><div className="fd-cloud-float">
    <span className="fd-cloud-file fd-file-one"/><span className="fd-cloud-file fd-file-two"/><span className="fd-cloud-file fd-file-three"/>
    <span className="fd-cloud-body"><FeedIcon name="cloud"/></span><span className="fd-cloud-eye fd-eye-left"/><span className="fd-cloud-eye fd-eye-right"/>
    <span className="fd-cloud-cheek fd-cheek-left"/><span className="fd-cloud-cheek fd-cheek-right"/><span className="fd-cloud-mouth"/><span className="fd-cloud-alert">!</span>
    </div><span className="fd-cloud-tag">SEM ESPAÇO</span></div>;
}

export default function FeedDriveStorageNotice({currentUserId,communityId}:{currentUserId:number;communityId:number}) {
  const [memory,setMemory]=useBrowserStorage(`vinkulo:drive-notice:v1:${currentUserId}:${communityId}`,parseDriveNoticeMemory);
  const [checks,setChecks]=useState<DriveNoticeCheck[]>([]),[checking,setChecking]=useState(false),[failed,setFailed]=useState(false),[feedback,setFeedback]=useState(''),[helpOpen,setHelpOpen]=useState(false);
  const active=useRef(false),request=useRef<AbortController|null>(null),lastCheck=useRef(0),group=useRef<HTMLDivElement>(null);
  const refresh=useCallback(async(manual=false)=>{
    if(!active.current||request.current||(!manual&&Date.now()-lastCheck.current<30000))return;
    const controller=new AbortController();request.current=controller;lastCheck.current=Date.now();
    const timeout=window.setTimeout(()=>controller.abort(),35000);
    if(manual)setChecking(true);
    try {
      const response=await fetch(`/api/storage/drive-status?communityId=${communityId}`,{cache:'no-store',signal:controller.signal});
      if(!active.current||request.current!==controller)return;
      if([401,403,409].includes(response.status)){setChecks([]);setMemory({});setFeedback('');return;}
      if(!response.ok)throw Error('unavailable');
      const body=await response.json() as {userId:number;communityId:number;checks:DriveNoticeCheck[]};
      if(!active.current||request.current!==controller)return;
      if(body.userId!==currentUserId||body.communityId!==communityId){setChecks([]);setFeedback('');return;}
      if(!Array.isArray(body.checks)||body.checks.length>2||!body.checks.every(c=>c&&['own','shared-visitors'].includes(c.id)&&c.own===(c.id==='own')&&['FULL','AVAILABLE','UNKNOWN'].includes(c.status)))throw Error('invalid');
      setChecks(body.checks);setMemory(previous=>mergeDriveNoticeMemory(previous,body.checks));setFailed(false);
      setFeedback(manual&&body.checks.length>0&&body.checks.every(c=>c.status==='AVAILABLE')?'Espaço disponível confirmado. O aviso foi removido.':'');
    } catch {
      if(active.current&&request.current===controller)setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if(request.current===controller){request.current=null;if(active.current)setChecking(false);}
    }
  },[communityId,currentUserId,setMemory]);
  useEffect(()=>{
    active.current=true;const initial=window.setTimeout(()=>void refresh(),0);
    const onFocus=()=>{if(document.visibilityState!=='hidden')void refresh();};
    const interval=window.setInterval(onFocus,120000);
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{active.current=false;request.current?.abort();request.current=null;lastCheck.current=0;window.clearTimeout(initial);window.clearInterval(interval);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[refresh]);
  useEffect(()=>{if(!feedback)return;const timer=window.setTimeout(()=>setFeedback(''),8000);return()=>window.clearTimeout(timer);},[feedback]);
  const visible=checks.filter(c=>memory[c.id]?.full);
  function collapse(id:string,collapsed:boolean) {
    setMemory(previous=>({...previous,[id]:{full:true,collapsed}}));
    requestAnimationFrame(()=>{group.current?.querySelector<HTMLButtonElement>(`[data-drive-notice="${id}"] [data-focus="${collapsed?'reopen':'close'}"]`)?.focus();});
  }
  if(!visible.length&&!feedback)return null;
  return <div className="feed-drive-notices" ref={group} aria-live="polite">
    {feedback&&<p className="fd-verified" role="status">{feedback}</p>}
    {visible.map(check=>{
      const collapsed=memory[check.id]?.collapsed,heading=`fd-heading-${communityId}-${check.id}`,content=`fd-content-${communityId}-${check.id}`;
      return <section className="feed-drive-notice" key={check.id} data-drive-notice={check.id} data-collapsed={collapsed} aria-labelledby={heading}>
        <div className="fd-compact" hidden={!collapsed}><FeedIcon name="cloud"/><p>{check.own?'Seu Drive continua cheio. Novos registros podem falhar.':'Drive compartilhado ainda cheio. Avise o responsável.'}</p><button type="button" className="fd-action fd-quiet" data-focus="reopen" aria-expanded="false" aria-controls={content} onClick={()=>collapse(check.id,false)}>Ver aviso</button></div>
          <div className="fd-expanded" id={content} hidden={collapsed}>
            <FullCloud/>
            <div className="fd-warning-head"><span className="fd-storage-label">UM CUIDADO COM SEUS DADOS</span><h2 id={heading}>{check.own?'Seu Google Drive está cheio':'O Drive compartilhado com você está cheio'}</h2><p className="fd-warning-copy">{check.own?'Novos cadastros e alterações podem não ser salvos. Libere espaço para continuar.':'Novos cadastros e alterações nessa lista podem não ser salvos. O responsável pelo Drive precisa liberar espaço.'}</p><p className="fd-note"><FeedIcon name="shield"/>Seus dados já salvos continuam preservados.</p></div>
            <button type="button" className="fd-close" data-focus="close" onClick={()=>collapse(check.id,true)} aria-label="Fechar detalhes do aviso de armazenamento"><FeedIcon name="close"/></button>
            <div className="fd-actions">{check.own?<a className="fd-action fd-primary" href="https://one.google.com/storage" target="_blank" rel="noopener noreferrer">Como liberar espaço</a>:<button type="button" className="fd-action fd-primary" aria-expanded={helpOpen} aria-controls={`${content}-help`} onClick={()=>setHelpOpen(value=>!value)}>O que posso fazer?</button>}<button type="button" className="fd-action fd-quiet" disabled={checking} onClick={()=>void refresh(true)}>{checking?'Verificando…':'Verificar novamente'}</button></div>
            {!check.own&&<p className="fd-shared-guide" id={`${content}-help`} hidden={!helpOpen}>Avise a pessoa que compartilhou a lista para liberar espaço na conta Google.</p>}
            {(failed||check.status==='UNKNOWN')&&<p className="fd-check-status" role="status">Não foi possível verificar agora. O último aviso permanece até a confirmação de espaço disponível.</p>}
          </div>
      </section>;
    })}
  </div>;
}
