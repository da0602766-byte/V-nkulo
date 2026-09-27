(() => {
  const byId = id => document.getElementById(id);
  const bridge = window.VinkuloOffline;
  let waiting = false;
  const send = action => { if (bridge) bridge.postMessage(JSON.stringify({ action })); };
  function render(state) {
    waiting = !!state.refreshing;
    byId('prepare').disabled = waiting;
    byId('context-title').textContent = state.prepared ? 'Aparelho preparado' : 'Preparação necessária';
    const message = state.prepared
      ? 'A identificação desta comunidade está protegida neste aparelho. Os módulos ainda precisam de conexão.'
      : state.result === 'storage-error'
        ? 'Não foi possível abrir o armazenamento protegido. Entre no sistema online; seus dados não foram apagados.'
        : state.result === 'unavailable'
          ? 'Não foi possível preparar agora. Confira a conexão e tente novamente.'
          : 'Entre na sua conta com internet para preparar a identificação local. Após reiniciar o celular ou expirar o acesso, será preciso reconectar.';
    byId('context-detail').textContent = waiting ? 'Conferindo seu acesso com segurança…' : message;
    byId('community').hidden = !state.prepared;
    byId('prepared-at').hidden = !state.prepared;
    byId('community').textContent = state.prepared ? state.communityName : '';
    byId('prepared-at').textContent = state.prepared ? `Preparado em ${new Date(state.preparedAt).toLocaleString('pt-BR')}` : '';
    byId('lock').hidden = !state.prepared;
  }
  function connection() {
    byId('connection').textContent = navigator.onLine ? 'Os recursos online dependem de conexão com o servidor.' : 'Sem conexão. Esta tela continua disponível.';
  }
  if (bridge) bridge.onmessage = event => { try { render(JSON.parse(event.data)); } catch { render({result:'storage-error'}); } };
  else {
    byId('context-title').textContent = 'Atualize o Android System WebView';
    byId('context-detail').textContent = 'A preparação protegida precisa de uma versão compatível do WebView. Você pode continuar no sistema online.';
    byId('prepare').disabled = true; byId('lock').hidden = true;
  }
  byId('open').addEventListener('click', () => { window.location.assign('/painel'); });
  byId('prepare').addEventListener('click', () => { if (waiting) return; waiting = true; byId('prepare').disabled = true; send('refresh'); });
  byId('lock').addEventListener('click', () => { render({result:'locked'}); send('lock'); });
  window.addEventListener('vinkulo:offline-status', () => send('status'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) send('status'); });
  window.addEventListener('online', connection); window.addEventListener('offline', connection);
  // Periodic expiry check is foreground-only; no operational sync in this stage.
  window.setInterval(() => { if (!document.hidden) send('status'); }, 30_000);
  connection(); send('status');
})();
