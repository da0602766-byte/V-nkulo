(() => {
  const byId = id => document.getElementById(id);
  const bridge = window.VinkuloOffline;
  let waiting = false;
  let expiryTimer;
  let requestId = 0;
  let snapshot = null;
  let snapshotTime = 0;
  let selected = 'mural';
  let renderFrame = 0;
  const frame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
  const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
  const send = action => { if (bridge) bridge.postMessage(JSON.stringify({ action, requestId: ++requestId })); };
  const date = value => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR');
  };
  function text(parent, tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value; if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }
  function setText(element, value) {
    const next = String(value || '');
    if (element.textContent !== next) element.textContent = next;
  }
  function replaceList(container, build) {
    const fragment = document.createDocumentFragment();
    container.setAttribute('aria-busy', 'true');
    build(fragment);
    container.textContent = '';
    container.appendChild(fragment);
    container.setAttribute('aria-busy', 'false');
  }
  function renderItems() {
    const container = byId('items');
    byId('requests-notice').hidden = !snapshot || selected !== 'pedidos';
    if (!snapshot) { container.textContent = ''; return; }
    const names = selected === 'agenda' ? ['eventos', 'compromissos'] : [selected];
    let rows = [], more = false, denied = false;
    names.forEach(name => {
      const section = snapshot[name];
      denied = denied || !section.allowed; more = more || section.hasMore;
      if (section.allowed) rows = rows.concat(section.items.map(item => ({item, name})));
    });
    if (selected === 'agenda') rows.sort((a, b) => new Date(a.item.data) - new Date(b.item.data));
    const query = byId('search').value.trim().toLocaleLowerCase('pt-BR');
    rows = rows.filter(row => [row.item.titulo, row.item.texto, row.item.local, row.item.ministerio, row.item.autor, row.item.tipo, row.item.status]
      .join(' ').toLocaleLowerCase('pt-BR').indexOf(query) !== -1);
    setText(byId('list-status'), rows.length + ' item(ns) salvo(s)' + (query ? ' nesta busca.' : '.')
      + (more ? ' Há mais itens disponíveis online.' : '') + (denied ? ' Parte desta consulta não foi autorizada.' : ''));
    replaceList(container, fragment => {
      if (!rows.length) text(fragment, 'p', query ? 'Nenhum texto salvo corresponde à busca.' : 'Nenhum item salvo nesta consulta. Confira o período e atualize com internet.', 'muted');
      rows.forEach((row, index) => {
      const item = row.item, article = document.createElement('article'); article.className = 'entry'; article.setAttribute('role', 'listitem');
      const heading = text(article, 'h3', item.titulo || 'Sem título'); heading.id = 'reader-item-' + selected + '-' + index; article.setAttribute('aria-labelledby', heading.id);
      const label = row.name === 'pedidos' ? 'Meu pedido' : row.name === 'compromissos' ? 'Meu compromisso' : row.name === 'eventos' ? 'Evento' : row.name === 'escalas' ? 'Minha escala' : 'Publicação';
      text(article, 'p', label + ' · ' + date(item.data) + (item.fim ? ' até ' + date(item.fim) : ''), 'muted');
      if (item.autor) text(article, 'p', item.autor, 'muted');
      if (item.ministerio) text(article, 'p', item.ministerio, 'muted');
      if (item.local) text(article, 'p', 'Local: ' + item.local, 'muted');
      if (item.diaInteiro) text(article, 'p', 'Dia inteiro', 'muted');
      if (item.concluido) text(article, 'p', 'Concluído na última atualização', 'muted');
      if (item.resposta) text(article, 'p', 'Sua resposta na última atualização: ' + item.resposta, 'muted');
      if (row.name === 'pedidos') {
        const types = {ORACAO:'Oração',VISITA:'Visita',ACONSELHAMENTO:'Aconselhamento',APOIO:'Apoio',MINISTERIO:'Ministério',OUTRO:'Outro',INFORMACAO:'Informação'};
        const statuses = {ABERTA:'Aberto',EM_ANALISE:'Em análise',CONCLUIDA:'Concluído'};
        text(article, 'p', (types[item.tipo] || item.tipo) + ' · ' + (statuses[item.status] || item.status), 'muted');
        text(article, 'p', 'Atualização do pedido: ' + date(item.atualizado), 'muted');
      }
      if (item.texto) text(article, 'p', item.texto, 'body');
      fragment.appendChild(article);
      });
    });
  }
  function scheduleRenderItems() {
    if (renderFrame) cancelFrame(renderFrame);
    renderFrame = frame(() => { renderFrame = 0; renderItems(); });
  }
  function clearSnapshot() {
    if (renderFrame) { cancelFrame(renderFrame); renderFrame = 0; }
    snapshot = null; snapshotTime = 0; byId('reader').hidden = true;
    byId('quick-reader').hidden = true;
    byId('items').textContent = ''; byId('search').value = ''; byId('window').textContent = '';
    byId('list-status').textContent = '';
    byId('tab-pedidos').hidden = true; byId('requests-notice').hidden = true;
    selected = 'mural';
    ['mural','agenda','escalas','pedidos'].forEach(tab => byId('tab-' + tab).setAttribute('aria-pressed', String(tab === selected)));
  }
  function available(name) {
    if (!snapshot) return false;
    const names = name === 'agenda' ? ['eventos', 'compromissos'] : [name];
    return names.some(key => snapshot[key] && snapshot[key].allowed);
  }
  function home(state) {
    const ready = !!(state.prepared && state.snapshot);
    byId('context-dot').setAttribute('data-ready', String(ready));
    // validForMs is remaining lifetime, not duration since preparedAt.
    const validUntil = ready ? new Date(Date.now() + Math.max(0, Number(state.validForMs) || 0)) : null;
    setText(byId('home-notice'), waiting ? 'Conferindo seu acesso…' : ready
      ? 'Cópia salva · acesso até ' + validUntil.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) + '.'
      : state.result === 'storage-error' ? 'Não foi possível ler as consultas. Seus dados não foram apagados.'
      : 'Prepare com internet para consultar depois.');
    if (ready && state.result === 'unavailable') setText(byId('home-notice'), 'Atualização indisponível. A cópia anterior continua com prazo limitado.');
    ['mural','agenda','escalas','pedidos'].forEach(name => {
      const allowed = available(name), link = byId('shortcut-' + name);
      link.setAttribute('href', allowed ? '#reader' : '#offline-settings');
      link.setAttribute('data-ready', String(allowed));
      setText(byId('shortcut-' + name + '-status'), allowed ? 'Consulta salva' : !bridge ? 'Requer WebView atualizado' : !ready ? 'Preparar com internet' : name === 'pedidos' ? 'Verificar acesso / ativar' : 'Não autorizado nesta cópia');
    });
  }
  function render(state) {
    window.clearTimeout(expiryTimer);
    waiting = !!state.refreshing;
    byId('prepare').disabled = waiting;
    byId('prepare-requests').disabled = waiting;
    setText(byId('context-title'), state.prepared ? 'Aparelho preparado' : 'Preparação necessária');
    const message = state.prepared
      ? state.snapshot ? 'Consultas protegidas disponíveis por tempo limitado. Esta é uma cópia da última atualização, não uma confirmação em tempo real.' : 'Identificação preparada na versão anterior. Ative as consultas offline para salvar conteúdo autorizado.'
      : state.result === 'storage-error'
        ? 'Não foi possível abrir o armazenamento protegido. Entre no sistema online; seus dados não foram apagados.'
        : state.result === 'unavailable'
          ? 'Não foi possível preparar agora. Confira a conexão e tente novamente.'
          : 'Entre na sua conta com internet para preparar a identificação local. Após reiniciar o celular ou expirar o acesso, será preciso reconectar.';
    setText(byId('context-detail'), waiting ? 'Conferindo seu acesso com segurança…' : message);
    byId('community').hidden = !state.prepared;
    byId('prepared-at').hidden = !state.prepared;
    byId('community').textContent = state.prepared ? state.communityName : '';
    byId('prepared-at').textContent = state.prepared ? `Atualizado em ${new Date(state.preparedAt).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : '';
    // An expired copy must remain removable without requiring a new login.
    byId('lock').hidden = !bridge;
    byId('prepare').textContent = state.prepared && state.snapshot ? 'Atualizar consultas offline' : 'Ativar consultas offline';
    const requestsAllowed = !!(state.prepared && state.snapshot && state.snapshot.pedidos && state.snapshot.pedidos.allowed);
    byId('prepare-requests').textContent = requestsAllowed ? 'Atualizar meus pedidos offline' : 'Incluir meus pedidos nas consultas offline';
    byId('tab-pedidos').hidden = !requestsAllowed;
    if (selected === 'pedidos' && !requestsAllowed) {
      selected = 'mural';
      ['mural','agenda','escalas','pedidos'].forEach(tab => byId('tab-' + tab).setAttribute('aria-pressed', String(tab === selected)));
    }
    if (state.prepared && state.snapshot) {
      byId('reader').hidden = false;
      byId('quick-reader').hidden = false;
      if (!snapshot || snapshotTime !== state.preparedAt || !!(snapshot.pedidos && snapshot.pedidos.allowed) !== requestsAllowed) {
        snapshot = state.snapshot; snapshotTime = state.preparedAt;
        byId('window').textContent = 'Agenda e escalas: ' + date(snapshot.from) + ' a ' + date(snapshot.until) + '.';
        renderItems();
      }
    } else clearSnapshot();
    if (state.prepared && state.result === 'unavailable') setText(byId('context-detail'), 'Não foi possível atualizar. A cópia anterior permanece disponível apenas até o vencimento.');
    if (state.prepared && state.result === 'requests-denied') setText(byId('context-detail'), 'Meus pedidos não estão disponíveis para este acesso ou plano. As demais consultas autorizadas foram atualizadas.');
    home(state);
    if (state.prepared) expiryTimer = window.setTimeout(() => { render({result:'locked'}); send('status'); }, Math.max(0, Number(state.validForMs) || 0));
  }
  function connection() {
    byId('network-badge').textContent = navigator.onLine ? 'No aparelho' : 'Sem conexão';
    byId('connection').textContent = navigator.onLine ? 'Os recursos online dependem de conexão com o servidor.' : 'Sem conexão. Esta tela continua disponível.';
  }
  if (bridge) bridge.onmessage = event => { if (document.hidden) return; try {
    const state = JSON.parse(event.data); if (state.requestId !== requestId) return; render(state);
  } catch (error) { render({result:'storage-error'}); } };
  else {
    byId('context-title').textContent = 'Atualize o Android System WebView';
    byId('context-detail').textContent = 'A preparação protegida precisa de uma versão compatível do WebView. Você pode continuar no sistema online.';
    byId('prepare').disabled = true; byId('prepare-requests').disabled = true; byId('lock').hidden = true;
    home({});
    setText(byId('home-notice'), 'Atualize o WebView para preparar consultas. O sistema online continua acessível.');
  }
  byId('open').addEventListener('click', () => { window.location.assign('/painel'); });
  byId('prepare').addEventListener('click', () => { if (waiting) return; waiting = true; byId('prepare').disabled = true; send('refresh'); });
  byId('prepare-requests').addEventListener('click', () => { if (waiting) return; waiting = true; byId('prepare-requests').disabled = true; send('refresh-requests'); });
  byId('lock').addEventListener('click', () => { render({result:'locked'}); send('lock'); });
  ['mural', 'agenda', 'escalas', 'pedidos'].forEach(name => byId('tab-' + name).addEventListener('click', () => {
    if (name === 'pedidos' && (!snapshot || !snapshot.pedidos || !snapshot.pedidos.allowed)) return;
    selected = name;
    ['mural', 'agenda', 'escalas', 'pedidos'].forEach(tab => byId('tab-' + tab).setAttribute('aria-pressed', String(tab === selected)));
    renderItems();
  }));
  ['mural', 'agenda', 'escalas', 'pedidos'].forEach(name => byId('shortcut-' + name).addEventListener('click', () => {
    // Recheck at click time: expiration or revocation can change a shortcut.
    if (!available(name)) { byId('offline-settings').open = true; return; }
    selected = name; byId('search').value = '';
    ['mural','agenda','escalas','pedidos'].forEach(tab => byId('tab-' + tab).setAttribute('aria-pressed', String(tab === selected)));
    renderItems();
  }));
  byId('manage-offline').addEventListener('click', () => { byId('offline-settings').open = true; });
  byId('search').addEventListener('input', scheduleRenderItems);
  window.addEventListener('vinkulo:offline-status', () => send('status'));
  document.addEventListener('visibilitychange', () => { if (!bridge) return; render({result:'locked'}); if (!document.hidden) send('status'); });
  window.addEventListener('online', connection); window.addEventListener('offline', connection);
  // Foreground expiry checks are local; never poll the server or write remotely.
  window.setInterval(() => { if (!document.hidden) send('status'); }, 30000);
  function focusHashTarget() {
    const id = String(window.location.hash || '').slice(1);
    if (!['top','main-content','reader','visitor-section','module-section','offline-settings'].includes(id)) return;
    const target = byId(id); if (!target || target.hidden) return;
    if (id === 'offline-settings') target.open = true;
    frame(() => { target.focus({preventScroll:true}); target.scrollIntoView({block:'start'}); });
  }
  if (document.querySelectorAll) Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), link => link.addEventListener('click', () => frame(focusHashTarget)));
  window.addEventListener('hashchange', focusHashTarget);
  window.addEventListener('popstate', focusHashTarget);
  function keepFocusedControlVisible() {
    const active = document.activeElement;
    if (!active || !/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName || '')) return;
    frame(() => active.scrollIntoView({block:'center',inline:'nearest'}));
  }
  document.addEventListener('focusin', keepFocusedControlVisible);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', keepFocusedControlVisible);
  window.VinkuloLocalBack = () => {
    const active = document.activeElement;
    if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName || '')) { active.blur(); return true; }
    if (window.location.hash) { window.history.back(); return true; }
    return false;
  };
  connection(); send('status');
})();
