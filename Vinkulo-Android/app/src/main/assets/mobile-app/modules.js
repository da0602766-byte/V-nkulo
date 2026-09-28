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
  function text(parent,tag,value){const node=document.createElement(tag);node.textContent=String(value??'');parent.appendChild(node);return node;}
  function button(parent,label,fn){const b=text(parent,'button',label);b.type='button';b.className='secondary';b.addEventListener('click',()=>{if(!busy)fn();});}
  function form(payload){
    el('fields').textContent='';version=payload?.version??0;
    for(const [key,label,kind] of definitions[module]){
      const l=text(el('fields'),'label',label);l.htmlFor='module-input-'+key;
      const field=document.createElement(Array.isArray(kind)||kind==='options'?'select':typeof kind==='number'&&kind>200?'textarea':'input');field.id=l.htmlFor;field.autocomplete='off';
      if(Array.isArray(kind)||kind==='options'){
        const options=kind==='options'?[{id:0,label:'Selecione'},...(snapshot.options||[])]:kind.map(id=>({id,label:id.replace(/_/g,' ')}));
        for(const option of options){const o=text(field,'option',option.label);o.value=String(option.id);}
        if(kind==='options'&&payload&&!options.some(o=>String(o.id)===String(payload[key]))){const o=text(field,'option','Registro salvo — confira autorização online');o.value=String(payload[key]);}
      }else if(kind==='date')field.type='date';else field.maxLength=kind;
      if(payload)field.value=String(payload[key]??'');
      el('fields').appendChild(field);
      if(key==='itemId')field.addEventListener('change',()=>{version=(snapshot.options||[]).find(o=>String(o.id)===field.value)?.version??0;});
    }
  }
  function clear(){prepared=false;snapshot={};signature='';editing='';window.clearTimeout(expiry);el('workspace').hidden=true;el('rows').textContent='';el('items').textContent='';el('fields').textContent='';el('community').textContent='';el('updated').textContent='';}
  function send(action,extra={}){
    if(!bridge||(busy&&action!=='lock'))return;busy=true;lastAction=action;el('save').disabled=true;el('prepare').disabled=true;el('kind').disabled=true;
    bridge.postMessage(JSON.stringify({action,module,requestId:++requestId,...extra}));
  }
  function render(s){
    busy=false;el('save').disabled=false;el('prepare').disabled=!bridge;el('kind').disabled=false;
    if(s.error){if(s.prepared!==true)clear();el('status').textContent=s.error;return;}
    if(!s.prepared){clear();el('status').textContent='Prepare este módulo com internet e a mesma conta/comunidade para acessar o trabalho salvo.';return;}
    const first=!prepared;prepared=true;canWrite=s.canWrite;snapshot=s.snapshot||{};el('workspace').hidden=false;el('community').textContent=s.communityName;
    el('updated').textContent='Última consulta: '+new Date(s.issuedAt).toLocaleString('pt-BR')+'. Não representa mudanças posteriores.';
    if(first)form();
    if(s.savedId){editing=s.savedId;el('status').textContent='Rascunho salvo no aparelho. Ainda não enviado.';}else if(lastAction!=='status')el('status').textContent='Estado atualizado. Confira cada registro abaixo.';
    el('sync').hidden=!canWrite||module==='cells';
    window.clearTimeout(expiry);expiry=window.setTimeout(()=>{clear();el('status').textContent='Autorização vencida; trabalho salvo preservado. Prepare novamente.';send('status');},Math.max(0,Number(s.validForMs)||0));
    const next=JSON.stringify([s.rows,snapshot]);if(next===signature)return;signature=next;
    el('items').textContent='';for(const item of [...(snapshot.memberships||[]),...(snapshot.items||[])]){const a=text(el('items'),'article','');a.className='entry';text(a,'h3',item.label);text(a,'p',item.text);if(item.status)text(a,'p',item.status);if(item.date)text(a,'p',item.date);}
    if(!(snapshot.items||[]).length)text(el('items'),'p','Nenhum registro nesta cópia limitada. Consulte o sistema online para outros registros.');
    el('rows').textContent='';for(const row of s.rows||[]){const a=text(el('rows'),'article','');a.className='entry';text(a,'h3',row.payload.titulo||row.payload.resultado||row.payload.tipo||'Rascunho salvo');text(a,'p',states[row.state]||'Estado desconhecido');if(row.message)text(a,'p',row.message);if(row.resultId)text(a,'p','Recibo: '+row.resultId);
      const detail=text(a,'details','');text(detail,'summary','Conferir os dados salvos');for(const [key,label] of definitions[module])text(detail,'p',label+': '+String(row.payload[key]??''));
      if(['CONFLICT','REJECTED'].includes(row.state))button(a,'Revisar em um novo rascunho',()=>{if(window.confirm('Confira o resultado online antes de repetir. Esta ação copia os dados para um novo rascunho, sem enviar.')){editing='';form(row.payload);el('status').textContent='Dados copiados para revisão. Salve para criar um novo rascunho; nada foi enviado.';}});
      if(row.state==='DRAFT'){
        button(a,'Abrir rascunho',()=>{editing=row.id;form(row.payload);el('fields').firstElementChild?.nextElementSibling?.focus();});
        if(canWrite&&module!=='cells')button(a,'Colocar na fila de envio',()=>{if(window.confirm('Enviar este registro quando houver conexão? '+(module==='requests'?help.requests:'Depois de enfileirado, não poderá ser editado.'))){if(editing===row.id){editing='';form();}send('enqueue',{id:row.id});}});
      }
      if(['DRAFT','CONFIRMED','CONFLICT','REJECTED'].includes(row.state))button(a,'Remover cópia do aparelho',()=>{if(window.confirm('Apagar somente esta cópia local?')){if(editing===row.id){editing='';form();}send('discard',{id:row.id});}});
    }
  }
  if(bridge)bridge.onmessage=e=>{if(document.hidden)return;try{const s=JSON.parse(e.data);if(s.requestId===requestId&&(!s.module||s.module===module))render(s);}catch{busy=false;clear();el('status').textContent='Resposta local indisponível.';}};
  else{el('prepare').disabled=true;el('status').textContent='Atualize o Android System WebView para usar os módulos protegidos.';}
  el('kind').addEventListener('change',()=>{clear();module=el('kind').value;requestId++;el('help').textContent=help[module];send('status');});
  el('prepare').addEventListener('click',()=>{if(window.confirm('Salvar a consulta autorizada e permitir rascunhos protegidos somente deste módulo por até 8 horas?')){clear();send('prepare');}});
  el('save').addEventListener('click',()=>{if(!prepared)return;const payload={};for(const [key,,kind] of definitions[module]){const v=document.getElementById('module-input-'+key).value;payload[key]=kind==='options'?Number(v):v;}if(module==='checklists')payload.version=version;send('save',{id:editing,payload});});
  el('new').addEventListener('click',()=>{if(!busy&&window.confirm('Limpar campos não salvos? Rascunhos salvos permanecem.')){editing='';form();}});
  el('sync').addEventListener('click',()=>send('sync'));el('lock').addEventListener('click',()=>{clear();send('lock');});
  document.addEventListener('visibilitychange',()=>{clear();busy=false;requestId++;if(!document.hidden)send('status');});
  window.setInterval(()=>{if(!document.hidden&&!busy)send('status');},15000);
  el('help').textContent=help[module];send('status');
})();
