(() => {
  const el=id=>document.getElementById(id);
  const modules=['visitors','cells','requests','notes','followups','checklists','parking'];
  const choices=()=>Array.from(el('work-choices').querySelectorAll('input[type="checkbox"]'));
  let busy=false,generation=0,timer,online=navigator.onLine;
  function update(){el('work-activate').disabled=busy||!online||!choices().some(input=>input.checked);choices().forEach(input=>input.disabled=busy);}
  function availability(sections){
    modules.forEach(module=>{
      const ready=sections.some(section=>section.module===module&&section.ready);
      el('work-'+module).setAttribute('data-ready',String(ready));
      el('work-'+module+'-status').textContent=ready?(module==='cells'?'Salvar relatório no aparelho':'Disponível sem internet'):'Precisa ativar com internet';
    });
  }
  window.VinkuloWorkStatus=availability;
  if(!window.VinkuloPending)availability([]);
  el('work-choices').addEventListener('change',update);
  el('work-activate').addEventListener('click',()=>{
    if(busy||!online)return;
    const selected=choices().filter(input=>input.checked).map(input=>input.value).filter(value=>modules.includes(value));
    if(!selected.length)return;
    busy=true;const run=++generation;let index=0,success=0;update();
    modules.forEach(module=>el('setup-'+module).textContent='');
    const finish=message=>{busy=false;window.clearTimeout(timer);el('work-setup-status').textContent=message;update();if(window.VinkuloPendingScreen)window.VinkuloPendingScreen.refresh();};
    function next(){
      if(run!==generation||document.hidden)return;
      if(index===selected.length){finish(success+' de '+selected.length+' funções ativadas. '+(success===selected.length?'Volte ao início e escolha o que deseja fazer.':'Confira os itens que não foram ativados. As outras funções continuam disponíveis.'));return;}
      const module=selected[index++];el('setup-'+module).textContent='Ativando…';el('work-setup-status').textContent='Ativando função '+index+' de '+selected.length+'…';
      // Timeout does not claim failure of native persistence or resend a command.
      timer=window.setTimeout(()=>{if(run!==generation)return;generation++;el('setup-'+module).textContent='Sem confirmação. Confira o acesso antes de tentar novamente.';finish('A ativação não respondeu a tempo. A operação pode terminar no aparelho; confira o acesso no início.');},20000);
      const done=state=>{if(run!==generation||document.hidden)return;window.clearTimeout(timer);if(state.prepared&&!state.error){success++;el('setup-'+module).textContent='Ativada';}else el('setup-'+module).textContent=state.error||'Não ativada. Confira sua conta, conexão e permissão.';next();};
      try{
        const accepted=module==='visitors'?window.VinkuloVisitorScreen?.prepareOffline(done):window.VinkuloModuleScreen?.prepareOffline(module,done);
        if(!accepted)done({error:'Aguarde a operação atual ou atualize o WebView.'});
      }catch{done({error:'Não foi possível iniciar. Tente novamente com internet.'});}
    }
    next();
  });
  function connection(value){online=value;update();if(!online&&!busy)el('work-setup-status').textContent='Para ativar uma função nova, conecte-se à internet. As funções já ativadas continuam acessíveis no início.';}
  window.addEventListener('online',()=>connection(true));window.addEventListener('offline',()=>connection(false));
  window.addEventListener('vinkulo:native-network',event=>{if(['online','offline'].includes(event.detail))connection(event.detail==='online');});
  document.addEventListener('visibilitychange',()=>{generation++;busy=false;window.clearTimeout(timer);modules.forEach(module=>el('setup-'+module).textContent='');availability([]);el('work-setup-status').textContent='Confira quais funções estão ativadas antes de continuar.';update();});
  window.VinkuloNavigation?.register('work-setup',{dirty:()=>false,discard:()=>{},busy:()=>busy});
  connection(online);
})();
