(() => {
  const el=id=>document.getElementById('pending-'+id),bridge=window.VinkuloPending;
  const names={visitors:'Visitantes',requests:'Pedidos',notes:'Minhas anotações',followups:'Meus acompanhamentos',checklists:'Ministérios e checklists',cells:'Minhas células',parking:'Estacionamento'};
  const labels={DRAFT:'Rascunho — não enviado',PENDING:'Na fila · aguardando conexão',SENDING:'Aguardando confirmação',RETRY:'Aguardando conexão para nova tentativa',CONFIRMED:'Confirmado no servidor',CONFLICT:'Precisa de revisão',REJECTED:'Recusado — confira o motivo'};
  const filters={all:'Tudo',review:'Revisão',queued:'Na fila',drafts:'Rascunhos',confirmed:'Confirmados'};
  const group=state=>state==='DRAFT'?'drafts':state==='CONFIRMED'?'confirmed':['PENDING','SENDING','RETRY'].includes(state)?'queued':'review';
  const href=module=>module==='visitors'?'#visitor-section':'#module-'+module;
  let requestId=0,busy=false,sections=[],filter='all',expiry,timeout,signature='',lastAction='status';
  const text=(parent,tag,value,className)=>{const n=document.createElement(tag);n.textContent=String(value||'');if(className)n.className=className;parent.appendChild(n);return n;};
  function clear(message){window.clearTimeout(expiry);sections=[];signature='';el('list').textContent='';el('access').textContent='';el('filters').textContent='';el('result').textContent='';el('checked').textContent='';el('sync').disabled=true;el('status').textContent=message;el('home-status').textContent='Rascunhos, envios e confirmações';}
  function invalidate(message){window.clearTimeout(timeout);busy=false;requestId++;clear(message);el('refresh').disabled=!bridge;}
  function send(action){if(!bridge||busy||document.hidden)return;busy=true;lastAction=action;el('refresh').disabled=true;el('sync').disabled=true;timeout=window.setTimeout(()=>invalidate('Consulta interrompida. Atualize a lista; uma tentativa de envio pode continuar em segundo plano.'),12000);try{bridge.postMessage(JSON.stringify({action,requestId:++requestId}));}catch{invalidate('Consulta local indisponível. O trabalho salvo não foi apagado.');}}
  function renderList(){
    const all=[];let locked=0,eligible=false;const count={all:0,review:0,queued:0,drafts:0,confirmed:0};
    sections.forEach(section=>{if(!section.ready){locked++;return;}eligible=eligible||!!section.canSync;(section.rows||[]).forEach(row=>{all.push({...row,module:section.module});count.all++;count[group(row.state)]++;});});
    el('sync').disabled=busy||!eligible;
    el('home-status').textContent=count.review+' em revisão · '+count.queued+' na fila · '+count.drafts+' rascunho(s)'+(locked?' · acesso parcial':'');
    const next=JSON.stringify([sections,filter]);if(next===signature)return;signature=next;
    el('filters').textContent='';Object.entries(filters).forEach(([key,label])=>{const b=text(el('filters'),'button',label+' ('+count[key]+')');b.type='button';b.setAttribute('aria-pressed',String(key===filter));b.addEventListener('click',()=>{filter=key;renderList();el('filters').querySelector('[aria-pressed="true"]').focus();});});
    const rows=all.filter(row=>filter==='all'||group(row.state)===filter).sort((a,b)=>{
      const priority={review:0,queued:1,drafts:2,confirmed:3};return priority[group(a.state)]-priority[group(b.state)]||(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)||String(a.id).localeCompare(String(b.id));
    });
    el('result').textContent=rows.length+' registro(s) visível(is)'+(locked?' · '+locked+' módulo(s) sem consulta disponível.':'.');
    const fragment=document.createDocumentFragment();el('list').setAttribute('aria-busy','true');
    if(!rows.length)text(fragment,'p',locked?'Nenhum registro acessível neste filtro. Confira os módulos e o acesso abaixo.':'Nenhum registro neste filtro.','muted');
    rows.forEach((row,index)=>{const card=text(fragment,'article','','pending-card');card.setAttribute('role','listitem');const h=text(card,'h3',row.title||'Registro salvo');h.id='pending-row-'+index;card.setAttribute('aria-labelledby',h.id);
      text(card,'p',names[row.module],'muted');const status=text(card,'p',labels[row.state]||'Estado desconhecido — confira no módulo','pending-state');status.setAttribute('data-group',group(row.state));
      if(Number(row.updatedAt)>0)text(card,'p','Registro local: '+new Date(row.updatedAt).toLocaleString('pt-BR'),'muted');
      if(row.message)text(card,'p',row.message);if(row.receipt)text(card,'p','Recibo: '+row.receipt,'muted');
      if(row.state==='SENDING'||row.state==='RETRY')text(card,'p','Não recrie o envio enquanto o resultado for desconhecido.','footnote');
      const link=text(card,'a','Abrir módulo','back-top');link.href=href(row.module);link.setAttribute('aria-label','Abrir '+names[row.module]+': '+(row.title||'registro salvo'));
    });el('list').textContent='';el('list').appendChild(fragment);el('list').setAttribute('aria-busy','false');
    el('access').textContent='';sections.forEach(section=>{const a=text(el('access'),'a','','access-link');a.href=href(section.module);text(a,'strong',names[section.module]);text(a,'span',section.ready?'Preparado · '+section.communityName:section.error?'Consulta indisponível — dados não apagados':'Preparar / conferir acesso');});
  }
  function render(state){
    busy=false;window.clearTimeout(timeout);el('refresh').disabled=!bridge;window.clearTimeout(expiry);
    if(state.error||!Array.isArray(state.sections)){clear('Não foi possível consultar a central. O trabalho salvo não foi apagado.');return;}
    sections=state.sections.filter(s=>Object.prototype.hasOwnProperty.call(names,s.module));
    el('status').textContent=lastAction==='sync'?(state.scheduled>0?'Tentativa solicitada para '+state.scheduled+' fila(s). Isso não confirma o envio.':'Nenhuma fila autorizada disponível para tentar agora.'):'Somente registros dos módulos preparados para este acesso.';
    el('checked').textContent='Lista local conferida às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.';renderList();
    if(sections.some(s=>s.ready))expiry=window.setTimeout(()=>{clear('A consulta venceu. Atualize o acesso no módulo; rascunhos salvos permanecem.');busy=false;requestId++;send('status');},Math.max(0,Number(state.validForMs)||0));
  }
  if(bridge)bridge.onmessage=e=>{if(document.hidden)return;try{const state=JSON.parse(e.data);if(state.requestId===requestId)render(state);}catch{invalidate('Resposta local indisponível. O trabalho salvo não foi apagado.');}};
  else{clear('Atualize o Android System WebView para consultar a central protegida.');el('refresh').disabled=true;}
  el('refresh').addEventListener('click',()=>send('status'));
  el('sync').addEventListener('click',()=>{if(!busy&&window.confirm('Tentar sincronizar apenas as operações já enfileiradas dos módulos com acesso válido? Rascunhos, recusas e conflitos não serão enviados.'))send('sync');});
  window.VinkuloPendingScreen={refresh:()=>send('status'),invalidate:()=>invalidate('Acesso alterado. Consulte novamente os módulos preparados.')};
  document.addEventListener('visibilitychange',()=>{invalidate('Consulte novamente os módulos preparados.');if(!document.hidden)send('status');});
  window.setInterval(()=>{if(window.VinkuloNavigation&&window.VinkuloNavigation.current()==='#pending-section')send('status');},15000);
  send('status');
})();
