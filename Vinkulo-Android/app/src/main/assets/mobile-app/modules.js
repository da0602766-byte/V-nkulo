(() => {
  const bridge=window.VinkuloModules,el=id=>document.getElementById('module-'+id);
  const definitions={
    requests:[['tipo','Tipo',['ORACAO','VISITA','ACONSELHAMENTO','APOIO','MINISTERIO','OUTRO','INFORMACAO']],['titulo','Título',120],['descricao','Descrição',2000],['visibilidade','Destinatários',['PASTORAL','GESTORES','PRIVADA']]],
    notes:[['titulo','Título',100],['texto','Anotação',1200],['cor','Cor',['amarelo','rosa','azul','verde']]],
    followups:[['visitanteId','Pessoa já acompanhada','options'],['tipo','Contato',['WHATSAPP','TELEFONE','PRESENCIAL','EMAIL','OUTRO']],['resultado','Resultado',160],['descricao','Descrição',1500],['proximoContato','Próximo contato (opcional)','date']],
    checklists:[['itemId','Minha tarefa','options'],['status','Situação',['PENDENTE','FEITO','NAO_FEITO']],['observacao','Observação',600]],
    cells:[['celulaId','Minha célula','options'],['data','Data da reunião','date'],['observacoes','Rascunho de relatório',1000]],
    parking:[['tipo','Tipo',['SEGURANCA','DANO','BLOQUEIO','ORIENTACAO','OUTRO']],['gravidade','Gravidade',['BAIXA','MEDIA','ALTA']],['descricao','Ocorrência',1200]],
  };
  const help={
    requests:'Pedidos próprios e novos pedidos. Pastoral: pastores e administradores; gestores: inclui líderes; privada: você. Orações e visitas também seguem à equipe de atendimento autorizada, inclusive quando privadas. Destinatários são conferidos no envio. Sem autorização de contato externo; opções avançadas ficam online.',
    notes:'Somente suas anotações pessoais. A fila cria novas anotações; editar e excluir no servidor continua online. Limite de 80 anotações: nenhuma é apagada para abrir espaço.',
    followups:'Histórico próprio e pessoas que você já acompanhou. Para o primeiro acompanhamento de uma pessoa, use o sistema online. Novos registros exigem permissão atual no envio.',
    checklists:'Seus ministérios, equipes e tarefas de escalas publicadas. Só tarefas atribuídas a você. Mudança online desde a preparação gera conflito; atualizar a consulta não muda a versão de um rascunho já salvo.',
    cells:'Células em que você participa ou atua como responsável. Relatórios são rascunhos locais: publicar, aprovar e gerenciar integrantes exige o sistema online.',
    parking:'Comprovantes das suas reservas na última consulta, sem garantia de vaga atual. Ocorrências podem entrar na fila com permissão. Reserva, entrada e saída definitivas permanecem online. A fila não garante aviso imediato: em uma urgência, contate a equipe diretamente.',
  };
  const states={DRAFT:'Rascunho — não enviado',PENDING:'Na fila',SENDING:'Aguardando confirmação',RETRY:'Aguardando nova tentativa',CONFIRMED:'Confirmado no servidor',CONFLICT:'Revisão necessária',REJECTED:'Recusado'};
  let module=el('kind').value,requestId=0,busy=false,prepared=false,editing='',version=0,snapshot={},canWrite=false,expiry,signature='',lastAction='';
  let baseline='',saving='';
  let saveToQueue=false,preparationDone=null,responseTimer;
  const formTitles={requests:'Novo pedido',notes:'Nova anotação',followups:'Novo acompanhamento',checklists:'Atualizar tarefa',cells:'Rascunho de relatório',parking:'Nova ocorrência'};
  const fingerprint=()=>JSON.stringify(definitions[module].map(([key])=>document.getElementById('module-input-'+key)?.value??''));
  const dirty=()=>prepared&&fingerprint()!==baseline;
  const dirtyNotice=()=>{el('dirty').hidden=!dirty();};
  const clean=()=>{baseline=fingerprint();dirtyNotice();};
  const allow=()=>!window.VinkuloNavigation||window.VinkuloNavigation.allow('module-section');
  function text(parent,tag,value){const node=document.createElement(tag);node.textContent=String(value??'');parent.appendChild(node);return node;}
  function setText(node,value){const next=String(value??'');if(node.textContent!==next)node.textContent=next;}
  function replaceList(container,build){const fragment=document.createDocumentFragment();container.setAttribute('aria-busy','true');build(fragment);container.textContent='';container.appendChild(fragment);container.setAttribute('aria-busy','false');}
  function button(parent,label,fn,context){const b=text(parent,'button',label);b.type='button';b.className='secondary';if(context)b.setAttribute('aria-label',label+': '+context);b.addEventListener('click',()=>{if(!busy)fn();});}
  function form(payload){
    el('title').textContent=formTitles[module];el('form-title').textContent=module==='cells'?'Registre como foi a reunião':'Preencha os dados';
    el('save').textContent=module==='cells'?'Salvar relatório neste aparelho':'Guardar para terminar depois';
    el('save').className=module==='cells'?'primary':'secondary';
    el('save-help').textContent=module==='cells'?'Este relatório fica salvo neste aparelho. O envio de relatórios offline ainda não está disponível: conclua no sistema online quando houver conexão.':'O envio será tentado com internet. Aguarde a confirmação; guardar para depois não envia.';
    el('fields').textContent='';version=payload?.version??0;
    for(const [key,label,kind] of definitions[module]){
      const l=text(el('fields'),'label',label);l.htmlFor='module-input-'+key;
      const field=document.createElement(Array.isArray(kind)||kind==='options'?'select':typeof kind==='number'&&kind>200?'textarea':'input');field.id=l.htmlFor;field.autocomplete='off';field.setAttribute('aria-describedby','module-help');
      if(Array.isArray(kind)||kind==='options'){
        const options=kind==='options'?[{id:0,label:'Selecione'},...(snapshot.options||[])]:kind.map(id=>({id,label:id.replace(/_/g,' ')}));
        for(const option of options){const o=text(field,'option',option.label);o.value=String(option.id);}
        if(kind==='options'&&payload&&!options.some(o=>String(o.id)===String(payload[key]))){const o=text(field,'option','Registro salvo — confira autorização online');o.value=String(payload[key]);}
      }else if(kind==='date')field.type='date';else field.maxLength=kind;
      field.enterKeyHint=field.tagName==='TEXTAREA'?'done':'next';
      if(payload)field.value=String(payload[key]??'');else if(kind==='date'&&key==='data')field.value=new Date().toLocaleDateString('sv-SE');
      el('fields').appendChild(field);
      field.addEventListener('input',dirtyNotice);field.addEventListener('change',dirtyNotice);
      if(key==='itemId')field.addEventListener('change',()=>{version=(snapshot.options||[]).find(o=>String(o.id)===field.value)?.version??0;});
    }
    clean();
  }
  function clear(){saveToQueue=false;el('locked').hidden=false;el('settings').open=true;prepared=false;snapshot={};signature='';editing='';window.clearTimeout(expiry);el('workspace').hidden=true;el('rows').textContent='';el('items').textContent='';el('fields').textContent='';el('community').textContent='';el('updated').textContent='';el('status').textContent='';clean();}
  function send(action,extra={}){
    if(!bridge||(busy&&action!=='lock'))return;busy=true;lastAction=action;el('save').disabled=true;el('save-send').disabled=true;el('prepare').disabled=true;el('kind').disabled=true;
    window.clearTimeout(responseTimer);
    responseTimer=window.setTimeout(()=>{
      busy=false;saveToQueue=false;requestId++;el('prepare').disabled=false;el('save').disabled=!prepared;el('save-send').disabled=!prepared;el('kind').disabled=false;
      const error='Sem confirmação do aparelho. Confira os registros salvos antes de repetir o envio; você pode tentar ativar novamente.';
      el('status').textContent=error;
      if(preparationDone){const done=preparationDone;preparationDone=null;done({error});}
    },25000);
    if(action==='prepare')el('status').textContent='Ativando com sua conta conectada… Aguarde a liberação do formulário.';
    bridge.postMessage(JSON.stringify({action,module,requestId:++requestId,...extra}));
  }
  function render(s){
    window.clearTimeout(responseTimer);
    busy=false;el('save').disabled=false;el('save-send').disabled=false;el('prepare').disabled=!bridge;el('kind').disabled=false;
    if(s.error){saveToQueue=false;if(s.prepared!==true)clear();setText(el('status'),s.error);return;}
    if(!s.prepared){clear();setText(el('status'),'Prepare este módulo com internet e a mesma conta/comunidade para acessar o trabalho salvo.');return;}
    const first=!prepared;prepared=true;canWrite=s.canWrite;snapshot=s.snapshot||{};el('locked').hidden=true;el('workspace').hidden=false;el('community').textContent=s.communityName;
    el('updated').textContent='Última consulta: '+new Date(s.issuedAt).toLocaleString('pt-BR')+'. Não representa mudanças posteriores.';
    if(first){form();el('settings').open=false;setText(el('status'),'Função pronta. Preencha abaixo; você pode guardar sem internet.');}
    if(s.savedId){editing=s.savedId;baseline=saving;dirtyNotice();setText(el('status'),'Rascunho salvo no aparelho. Ainda não enviado.');}else if(lastAction!=='status')setText(el('status'),'Estado atualizado. Confira cada registro abaixo.');
    el('sync').hidden=!canWrite||module==='cells';
    el('save-send').hidden=!canWrite||module==='cells';
    window.clearTimeout(expiry);expiry=window.setTimeout(()=>{clear();el('status').textContent='Autorização vencida; trabalho salvo preservado. Prepare novamente.';send('status');},Math.max(0,Number(s.validForMs)||0));
    let enqueueId='';
    if(s.savedId&&saveToQueue){saveToQueue=false;if(fingerprint()===saving){enqueueId=s.savedId;editing='';form();}else setText(el('status'),'Rascunho salvo. Há novas alterações: salve novamente antes de enviar.');}
    const next=JSON.stringify([s.rows,snapshot]);if(next===signature){if(enqueueId)send('enqueue',{id:enqueueId});return;}signature=next;
    const savedItems=[...(snapshot.memberships||[]),...(snapshot.items||[])];
    replaceList(el('items'),fragment=>{for(const [index,item] of savedItems.entries()){const a=text(fragment,'article','');a.className='entry';a.setAttribute('role','listitem');const h=text(a,'h3',item.label);h.id='module-saved-'+index;a.setAttribute('aria-labelledby',h.id);text(a,'p',item.text);if(item.status)text(a,'p',item.status);if(item.date)text(a,'p',item.date);}if(!savedItems.length)text(fragment,'p','Nenhum registro nesta cópia limitada. Consulte o sistema online para outros registros.');});
    replaceList(el('rows'),fragment=>{for(const [index,row] of (s.rows||[]).entries()){const title=row.payload.titulo||row.payload.resultado||row.payload.tipo||'Rascunho salvo';const a=text(fragment,'article','');a.className='entry';a.setAttribute('role','listitem');const h=text(a,'h3',title);h.id='module-row-'+index;a.setAttribute('aria-labelledby',h.id);text(a,'p',states[row.state]||'Estado desconhecido');if(row.message)text(a,'p',row.message);if(row.resultId)text(a,'p','Recibo: '+row.resultId);
      const detail=text(a,'details','');const summary=text(detail,'summary','Conferir os dados salvos');summary.setAttribute('aria-label','Conferir os dados salvos: '+title);for(const [key,label] of definitions[module])text(detail,'p',label+': '+String(row.payload[key]??''));
      if(['CONFLICT','REJECTED'].includes(row.state))button(a,'Revisar em um novo rascunho',()=>{if(allow()&&window.confirm('Confira o resultado online antes de repetir. Esta ação copia os dados para um novo rascunho, sem enviar.')){editing='';form(row.payload);baseline='';dirtyNotice();setText(el('status'),'Dados copiados para revisão. Salve para criar um novo rascunho; nada foi enviado.');}},title);
      if(row.state==='DRAFT'){
        button(a,'Abrir rascunho',()=>{if(!allow())return;editing=row.id;form(row.payload);el('fields').firstElementChild?.nextElementSibling?.focus();},title);
        if(canWrite&&module!=='cells')button(a,'Colocar na fila de envio',()=>{if(editing===row.id&&!allow())return;if(window.confirm('Enviar os dados SALVOS deste registro quando houver conexão? '+(module==='requests'?help.requests:'Depois de enfileirado, não poderá ser editado.'))){if(editing===row.id){editing='';form();}send('enqueue',{id:row.id});}},title);
      }
      if(['DRAFT','CONFIRMED','CONFLICT','REJECTED'].includes(row.state))button(a,'Remover cópia do aparelho',()=>{if(editing===row.id&&!allow())return;if(window.confirm('Apagar somente esta cópia local?')){if(editing===row.id){editing='';form();}send('discard',{id:row.id});}},title);
    }});
    if(enqueueId)send('enqueue',{id:enqueueId});
  }
  if(bridge)bridge.onmessage=e=>{if(document.hidden)return;try{const s=JSON.parse(e.data);if(s.requestId===requestId&&(!s.module||s.module===module)){render(s);if(preparationDone){const done=preparationDone;preparationDone=null;done(s);}}}catch{busy=false;clear();el('status').textContent='Resposta local indisponível.';if(preparationDone){const done=preparationDone;preparationDone=null;done({error:'Resposta indisponível.'});}}};
  else{el('prepare').disabled=true;el('status').textContent='Atualize o Android System WebView para usar os módulos protegidos.';}
  function openModule(next){if(!definitions[next]||next===module)return;clear();busy=false;module=next;el('kind').value=next;requestId++;el('help').textContent=help[module];send('status');}
  window.VinkuloModuleScreen={open:openModule,prepareOffline(next,done){if(!bridge||!definitions[next]||(busy&&lastAction!=='status'))return false;clear();busy=false;module=next;el('kind').value=next;el('help').textContent=help[module];preparationDone=done;send('prepare');return true;}};
  el('kind').addEventListener('change',()=>{const next=el('kind').value;el('kind').value=module;if(window.VinkuloNavigation)window.VinkuloNavigation.go('#module-'+next);else if(allow())openModule(next);});
  el('prepare').addEventListener('click',()=>{if(allow()&&window.confirm('Salvar a consulta autorizada e permitir rascunhos protegidos somente deste módulo por até 8 horas?')){clear();send('prepare');}});
  function save(queue){if(!prepared||busy||(queue&&(!canWrite||module==='cells')))return;if(queue&&!window.confirm('Salvar este registro e enviar quando houver internet? '+(module==='requests'?help.requests:'Depois de enviado para processamento, ele não poderá ser editado.')))return;const payload={};for(const [key,,kind] of definitions[module]){const v=document.getElementById('module-input-'+key).value;payload[key]=kind==='options'?Number(v):v;}if(module==='checklists')payload.version=version;saveToQueue=queue;saving=fingerprint();send('save',{id:editing,payload});}
  el('save').addEventListener('click',()=>save(false));el('save-send').addEventListener('click',()=>save(true));
  el('new').addEventListener('click',()=>{if(!busy&&window.confirm('Limpar campos não salvos? Rascunhos salvos permanecem.')){editing='';form();}});
  el('sync').addEventListener('click',()=>send('sync'));el('lock').addEventListener('click',()=>{if(allow()){clear();send('lock');}});
  if(window.VinkuloNavigation)window.VinkuloNavigation.register('module-section',{dirty,discard:()=>{editing='';form();},busy:()=>busy&&lastAction!=='status'});
  document.addEventListener('visibilitychange',()=>{window.clearTimeout(responseTimer);preparationDone=null;clear();busy=false;requestId++;if(!document.hidden)send('status');});
  window.setInterval(()=>{if(!document.hidden&&!busy)send('status');},15000);
  el('help').textContent=help[module];send('status');
})();
