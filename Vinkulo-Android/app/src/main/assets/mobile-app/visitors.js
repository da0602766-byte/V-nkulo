(() => {
  const bridge=window.VinkuloVisitors, el=id=>document.getElementById('visitor-'+id);
  let requestId=0,busy=false,prepared=false,editing='',expiry,lastAction='',rowsSignature='';
  const fields=['name','phone','email','date'];
  let baseline='',saving='';
  let saveToQueue=false,preparationDone=null,responseTimer;
  const fingerprint=()=>JSON.stringify(fields.map(k=>el(k).value));
  const dirty=()=>prepared&&fingerprint()!==baseline;
  const dirtyNotice=()=>{el('dirty').hidden=!dirty();};
  const clean=()=>{baseline=fingerprint();dirtyNotice();};
  const allow=()=>!window.VinkuloNavigation||window.VinkuloNavigation.allow('visitor-section');
  const labels={DRAFT:'Rascunho: ainda não enviado',PENDING:'Na fila de envio',SENDING:'Enviando: aguardando confirmação',RETRY:'Aguardando nova tentativa',CONFIRMED:'Confirmado',CONFLICT:'Revisão necessária: possível duplicidade',REJECTED:'Recusado: revise o cadastro'};
  function reset(){editing='';fields.forEach(k=>el(k).value='');el('date').value=new Date().toLocaleDateString('sv-SE');clean();}
  function clear(){saveToQueue=false;el('locked').hidden=false;el('settings').open=true;prepared=false;rowsSignature='';window.clearTimeout(expiry);el('workspace').hidden=true;el('rows').textContent='';el('community').textContent='';reset();}
  function send(action,extra={}) {
    if(!bridge||(busy&&action!=='lock'))return;busy=true;lastAction=action;el('save').disabled=true;el('save-send').disabled=true;el('prepare').disabled=true;
    window.clearTimeout(responseTimer);
    responseTimer=window.setTimeout(()=>{
      busy=false;saveToQueue=false;requestId++;el('prepare').disabled=false;el('save').disabled=!prepared;el('save-send').disabled=!prepared;
      const error='Sem confirmação do aparelho. Confira os registros salvos antes de repetir o envio; você pode tentar ativar novamente.';
      el('status').textContent=error;
      if(preparationDone){const done=preparationDone;preparationDone=null;done({error});}
    },25000);
    if(action==='prepare')el('status').textContent='Ativando com sua conta conectada… Aguarde a liberação do formulário.';
    bridge.postMessage(JSON.stringify({action,requestId:++requestId,...extra}));
  }
  function text(parent,tag,value){const node=document.createElement(tag);node.textContent=value;parent.appendChild(node);return node;}
  function setText(node,value){const next=String(value??'');if(node.textContent!==next)node.textContent=next;}
  function button(parent,label,fn,context){const node=text(parent,'button',label);node.type='button';node.className='secondary';if(context)node.setAttribute('aria-label',label+': '+context);node.addEventListener('click',()=>{if(!busy)fn();});}
  function replaceList(container,build){const fragment=document.createDocumentFragment();container.setAttribute('aria-busy','true');build(fragment);container.textContent='';container.appendChild(fragment);container.setAttribute('aria-busy','false');}
  function render(state) {
    window.clearTimeout(responseTimer);
    busy=false;el('save').disabled=false;el('save-send').disabled=false;el('prepare').disabled=!bridge;
    if(state.error){saveToQueue=false;if(state.prepared!==true)clear();setText(el('status'),state.error);return;}
    window.clearTimeout(expiry);
    if(!state.prepared){clear();setText(el('status'),'Cadastros bloqueados. Prepare com internet e a mesma conta/comunidade para recuperar o trabalho salvo.');return;}
    if(!prepared)el('settings').open=false;
    prepared=true;el('locked').hidden=true;el('workspace').hidden=false;el('community').textContent=state.communityName;
    if(state.savedId){editing=state.savedId;baseline=saving;dirtyNotice();setText(el('status'),'Rascunho salvo no aparelho. Ainda não enviado.');}
    else if(lastAction!=='status'&&lastAction!=='prepare')setText(el('status'),'Confira abaixo se o cadastro aguarda envio ou já foi confirmado.');
    else setText(el('status'),'Você pode preencher e salvar sem internet.');
    expiry=window.setTimeout(()=>{clear();el('status').textContent='Autorização vencida. Trabalho salvo preservado; prepare novamente.';send('status');},Math.max(0,Number(state.validForMs)||0));
    let enqueueId='';
    if(state.savedId&&saveToQueue){saveToQueue=false;if(fingerprint()===saving){enqueueId=state.savedId;reset();}else setText(el('status'),'Rascunho salvo. Há novas alterações no formulário: salve novamente antes de enviar.');}
    const signature=JSON.stringify(state.rows||[]);if(signature===rowsSignature){if(enqueueId)send('enqueue',{id:enqueueId});return;}rowsSignature=signature;
    const container=el('rows');replaceList(container,fragment=>(state.rows||[]).forEach((row,index)=>{
      const title=row.visitor.nomeCompleto||'Rascunho sem nome';const article=document.createElement('article');article.className='entry';article.setAttribute('role','listitem');
      const heading=text(article,'h3',title);heading.id='visitor-row-'+index;article.setAttribute('aria-labelledby',heading.id);
      text(article,'p',labels[row.state]||'Estado desconhecido');
      if(row.message)text(article,'p',row.message);if(row.visitorId)text(article,'p','Cadastro nº '+row.visitorId);
      if(row.state==='DRAFT'){
        button(article,'Editar rascunho',()=>{if(!allow())return;editing=row.id;el('name').value=row.visitor.nomeCompleto;el('phone').value=row.visitor.telefone;el('email').value=row.visitor.email;el('date').value=row.visitor.dataEntrada;clean();el('name').focus();},title);
        button(article,'Colocar na fila de envio',()=>{if(editing===row.id&&!allow())return;if(window.confirm('Enviar os dados SALVOS deste cadastro quando houver conexão? Após entrar na fila, ele não poderá ser editado.')){if(editing===row.id)reset();send('enqueue',{id:row.id});}},title);
      }
      if(['DRAFT','CONFIRMED','CONFLICT','REJECTED'].includes(row.state))button(article,'Remover este registro do aparelho',()=>{
        if(editing===row.id&&!allow())return;if(window.confirm('Remover esta cópia local? Isso não apaga um cadastro já confirmado no servidor.')){if(editing===row.id)reset();send('discard',{id:row.id});}
      },title);
      fragment.appendChild(article);
    }));
    if(enqueueId)send('enqueue',{id:enqueueId});
  }
  if(bridge)bridge.onmessage=event=>{if(document.hidden)return;try{const state=JSON.parse(event.data);if(state.requestId===requestId){render(state);if(preparationDone){const done=preparationDone;preparationDone=null;done(state);}}}catch{busy=false;clear();el('status').textContent='Não foi possível ler o estado local.';if(preparationDone){const done=preparationDone;preparationDone=null;done({error:'Resposta indisponível.'});}}};
  else{el('prepare').disabled=true;el('status').textContent='Atualize o Android System WebView para usar os rascunhos protegidos.';}
  el('prepare').addEventListener('click',()=>{if(allow()&&window.confirm('Salvar cadastros protegidos neste aparelho e permitir envio das operações que você colocar na fila?'))send('prepare');});
  function save(queue){if(!prepared||busy)return;if(queue&&!window.confirm('Salvar este cadastro e enviar quando houver internet? Depois de enviado para processamento, ele não poderá ser editado.'))return;saveToQueue=queue;saving=fingerprint();send('save',{id:editing,visitor:{nomeCompleto:el('name').value,telefone:el('phone').value,email:el('email').value,dataEntrada:el('date').value}});}
  el('save').addEventListener('click',()=>save(false));el('save-send').addEventListener('click',()=>save(true));
  window.VinkuloVisitorScreen={prepareOffline(done){if(!bridge||(busy&&lastAction!=='status'))return false;busy=false;preparationDone=done;send('prepare');return true;}};
  el('new').addEventListener('click',()=>{if(!busy&&window.confirm('Limpar os campos não salvos? Rascunhos já salvos permanecem na lista.'))reset();});
  el('sync').addEventListener('click',()=>send('sync'));
  el('lock').addEventListener('click',()=>{if(allow()){clear();send('lock');}});
  fields.forEach(k=>{el(k).addEventListener('input',dirtyNotice);el(k).addEventListener('change',dirtyNotice);});
  if(window.VinkuloNavigation)window.VinkuloNavigation.register('visitor-section',{dirty,discard:reset,busy:()=>busy&&lastAction!=='status'});
  document.addEventListener('visibilitychange',()=>{window.clearTimeout(responseTimer);preparationDone=null;clear();busy=false;requestId++;if(!document.hidden)send('status');});
  window.setInterval(()=>{if(!document.hidden&&!busy)send('status');},15000);
  reset();send('status');
})();
