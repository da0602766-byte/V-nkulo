(() => {
  const el = id => document.getElementById(id);
  const moduleNames = {requests:'Fazer um pedido',notes:'Criar anotação',followups:'Registrar acompanhamento',checklists:'Atualizar minha tarefa',cells:'Relatório de célula',parking:'Registrar ocorrência'};
  const readerNames = {mural:'Mural',agenda:'Agenda',escalas:'Minhas escalas',pedidos:'Meus pedidos'};
  const screens = ['home-screen','offline-settings','reader','visitor-section','module-menu','module-section','pending-section','work-setup'];
  const guards = {};
  let current = '#top', stack = [];
  function route(hash) {
    if (hash === '#pending-section') return {id:'pending-section',title:'Central de pendências'};
    if (hash === '#work-setup') return {id:'work-setup',title:'Ativar modo offline'};
    if (hash === '#offline-settings') return {id:'offline-settings',title:'Gerenciar offline'};
    if (hash === '#visitor-section') return {id:'visitor-section',title:'Cadastrar visitante'};
    if (hash === '#module-section') return {id:'module-menu',title:'Mais funções'};
    if (hash.startsWith('#module-') && moduleNames[hash.slice(8)]) return {id:'module-section',title:moduleNames[hash.slice(8)],module:hash.slice(8)};
    if (hash.startsWith('#read-') && readerNames[hash.slice(6)]) return {id:'reader',title:readerNames[hash.slice(6)],reader:hash.slice(6)};
    if (hash === '#reader') return {id:'reader',title:'Consultas no aparelho'};
    return {id:'home-screen',title:'Início'};
  }
  function allow(id = route(current).id) {
    const guard = guards[id];
    if (!guard) return true;
    if (guard.busy()) { window.alert('Aguarde a confirmação da operação antes de sair.'); return false; }
    if (!guard.dirty()) return true;
    if (!window.confirm('Há alterações não salvas. Sair e descartar essas alterações? Toque em Cancelar para continuar editando e salvar. Rascunhos já salvos permanecem.')) return false;
    guard.discard(); return true;
  }
  function show(focus = true) {
    const next = route(current);
    screens.forEach(id => { el(id).hidden = id !== next.id; });
    el('screen-nav').hidden = next.id === 'home-screen';
    el('screen-title').textContent = next.title;
    if (next.id === 'offline-settings') el(next.id).open = true;
    if (next.module && window.VinkuloModuleScreen) window.VinkuloModuleScreen.open(next.module);
    if (next.reader && window.VinkuloReaderSelect) window.VinkuloReaderSelect(next.reader);
    if (window.VinkuloPendingScreen && ['pending-section','home-screen'].includes(next.id)) window.VinkuloPendingScreen.refresh();
    document.title = next.title + ' · Vínkulo offline';
    if (focus) {
      const target = next.id === 'home-screen' ? el('home-title') : el('screen-title');
      target.focus({preventScroll:true}); window.scrollTo(0,0);
    }
  }
  function go(hash, back = false) {
    if (hash === '#main-content') { el('main-content').focus(); return true; }
    if (hash === current) return true;
    if (!allow()) return false;
    if (!back) stack.push(current);
    current = hash;
    // Local history belongs to this document, including after restored links.
    window.history.replaceState(null,'',current);
    show(); return true;
  }
  function back() {
    if (current === '#top') return !allow();
    const previous = stack.length ? stack[stack.length - 1] : '#top';
    if (go(previous,true)) stack.pop();
    return true;
  }
  window.VinkuloNavigation = {go,back,allow,register:(id,guard)=>{guards[id]=guard;},current:()=>current};
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault(); event.stopImmediatePropagation(); go(link.getAttribute('href'));
  },true);
  window.addEventListener('hashchange', () => {
    const requested = window.location.hash || '#top';
    if (!go(requested)) window.history.replaceState(null,'',current);
  });
  el('screen-back').addEventListener('click', back);
  // Wait for bridge checks instead of restoring a potentially stale form.
  window.history.replaceState(null,'','#top'); show(false);
})();
