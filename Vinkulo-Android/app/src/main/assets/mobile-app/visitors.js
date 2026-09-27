(() => {
  const bridge=window.VinkuloVisitors, el=id=>document.getElementById('visitor-'+id);
  let requestId=0,busy=false,prepared=false,editing='',expiry,lastAction='';
  const fields=['name','phone','email','date'];
  const labels={DRAFT:'Rascunho: ainda não enviado',PENDING:'Na fila de envio',SENDING:'Enviando: aguardando confirmação',RETRY:'Aguardando nova tentativa',CONFIRMED:'Confirmado',CONFLICT:'Revisão necessária: possível duplicidade',REJECTED:'Recusado: revise o cadastro'};
  function reset(){editing='';fields.forEach(k=>el(k).value='');el('date').value=new Date().toLocaleDateString('sv-SE');}
  function clear(){prepared=false;window.clearTimeout(expiry);el('workspace').hidden=true;el('rows').textContent='';el('community').textContent='';reset();}
  function send(action,extra={}) {
    if(!bridge||busy)return;busy=true;lastAction=action;el('save').disabled=true;el('prepare').disabled=true;
    bridge.postMessage(JSON.stringify({action,requestId:++requestId,...extra}));
  }
  function text(parent,tag,value){const node=document.createElement(tag);node.textContent=value;parent.appendChild(node);return node;}
  function button(parent,label,fn){const node=text(parent,'button',label);node.type='button';node.className='secondary';node.addEventListener('click',()=>{if(!busy)fn();});}
  function render(state) {
    window.clearTimeout(expiry);busy=false;el('save').disabled=false;el('prepare').disabled=!bridge;
    if(state.error){el('status').textContent=state.error;return;}
    if(!state.prepared){clear();el('status').textContent='Cadastros bloqueados. Prepare com internet e a mesma conta/comunidade para recuperar o trabalho salvo.';return;}
    prepared=true;el('workspace').hidden=false;el('community').textContent=state.communityName;
    if(state.savedId){editing=state.savedId;el('status').textContent='Rascunho salvo no aparelho. Ainda não enviado.';}
    else if(lastAction!=='status')el('status').textContent='Estado local atualizado. Confira o resultado de cada cadastro abaixo.';
    const container=el('rows');container.textContent='';
    (state.rows||[]).forEach(row=>{
      const article=document.createElement('article');article.className='entry';
      text(article,'h3',row.visitor.nomeCompleto||'Rascunho sem nome');
      text(article,'p',labels[row.state]||'Estado desconhecido');
      if(row.message)text(article,'p',row.message);if(row.visitorId)text(article,'p','Cadastro nº '+row.visitorId);
      if(row.state==='DRAFT'){
        button(article,'Editar rascunho',()=>{editing=row.id;el('name').value=row.visitor.nomeCompleto;el('phone').value=row.visitor.telefone;el('email').value=row.visitor.email;el('date').value=row.visitor.dataEntrada;el('name').focus();});
        button(article,'Colocar na fila de envio',()=>{if(window.confirm('Enviar este cadastro quando houver conexão? Após entrar na fila, ele não poderá ser editado.')){if(editing===row.id)reset();send('enqueue',{id:row.id});}});
      }
      if(['DRAFT','CONFIRMED','CONFLICT','REJECTED'].includes(row.state))button(article,'Remover este registro do aparelho',()=>{
        if(window.confirm('Remover esta cópia local? Isso não apaga um cadastro já confirmado no servidor.')){if(editing===row.id)reset();send('discard',{id:row.id});}
      });
      container.appendChild(article);
    });
    expiry=window.setTimeout(()=>{clear();el('status').textContent='Autorização vencida. Trabalho salvo preservado; prepare novamente.';send('status');},Math.max(0,Number(state.validForMs)||0));
  }
  if(bridge)bridge.onmessage=event=>{if(document.hidden)return;try{const state=JSON.parse(event.data);if(state.requestId===requestId)render(state);}catch{busy=false;clear();el('status').textContent='Não foi possível ler o estado local.';}};
  else{el('prepare').disabled=true;el('status').textContent='Atualize o Android System WebView para usar os rascunhos protegidos.';}
  el('prepare').addEventListener('click',()=>{if(window.confirm('Salvar cadastros protegidos neste aparelho e permitir envio das operações que você colocar na fila?'))send('prepare');});
  el('save').addEventListener('click',()=>{if(prepared)send('save',{id:editing,visitor:{nomeCompleto:el('name').value,telefone:el('phone').value,email:el('email').value,dataEntrada:el('date').value}});});
  el('new').addEventListener('click',()=>{if(!busy&&window.confirm('Limpar os campos não salvos? Rascunhos já salvos permanecem na lista.'))reset();});
  el('sync').addEventListener('click',()=>send('sync'));
  el('lock').addEventListener('click',()=>{clear();send('lock');});
  document.addEventListener('visibilitychange',()=>{clear();busy=false;requestId++;if(!document.hidden)send('status');});
  window.setInterval(()=>{if(!document.hidden&&!busy)send('status');},5000);
  reset();send('status');
})();
