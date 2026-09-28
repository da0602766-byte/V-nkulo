const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/mobile-app/app.js'), 'utf8');

function shell(supported = true) {
  const elements = new Map(), events = {}, requests = [], timers = new Map();
  let nextTimer = 0;
  function element() {
    return {textContent:'', value:'', hidden:false, disabled:false, children:[], handlers:{}, attributes:{},
      addEventListener(name, fn) {this.handlers[name]=fn;}, setAttribute(name,value) {this.attributes[name]=value;},
      appendChild(child) {if(child.isFragment)this.children.push(...child.children);else this.children.push(child);},
    };
  }
  function fragment(){return {isFragment:true,children:[],appendChild(child){this.children.push(child);}};}
  const document = { hidden: false,
    createElement: element,
    createDocumentFragment: fragment,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }, addEventListener(name, fn) { events[name] = fn; },
  };
  const window = {location:{hash:'',assign(){}}, addEventListener(){}, setInterval(){},requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
  };
  if (supported) window.VinkuloOffline = {postMessage(raw) { requests.push(JSON.parse(raw)); }};
  vm.runInNewContext(source, {window, document, navigator:{onLine:false}});
  return {elements, events, requests, timers, document, window,
    send(state) { window.VinkuloOffline.onmessage({data:JSON.stringify({requestId:requests.at(-1).requestId,...state})}); },
  };
}

test('old WebView fallback remains explicit after background/resume', () => {
  // Numeric separators require newer engines than the Android 10 stock WebView.
  assert.doesNotMatch(source, /\b\d[\d]*_\d/);
  const app = shell(false);
  app.document.hidden = true; app.events.visibilitychange();
  app.document.hidden = false; app.events.visibilitychange();
  assert.equal(app.elements.get('context-title').textContent, 'Atualize o Android System WebView');
  assert.equal(app.elements.get('prepare').disabled, true);
});

test('prepared identity is removed on expiry and a fresh native status is requested', () => {
  const app = shell();
  app.send({prepared:true,communityName:'Comunidade de teste',preparedAt:1000,validForMs:1000});
  assert.equal(app.elements.get('community').textContent, 'Comunidade de teste');
  [...app.timers.values()][0]();
  assert.equal(app.elements.get('community').textContent, '');
  assert.equal(app.elements.get('community').hidden, true);
  assert.equal(app.requests.at(-1).action, 'status');
});

test('late native response cannot reveal identity while backgrounded', () => {
  const app = shell();
  app.send({prepared:true,communityName:'Comunidade de teste',preparedAt:1000,validForMs:1000});
  app.document.hidden = true; app.events.visibilitychange();
  app.send({prepared:true,communityName:'Resposta atrasada',preparedAt:1000,validForMs:1000});
  assert.equal(app.elements.get('community').textContent, '');
  app.document.hidden = false; app.events.visibilitychange();
  assert.equal(app.requests.at(-1).action, 'status');
});

function snapshot() {
  const section = items => ({allowed:true,hasMore:false,items});
  return {from:'2026-09-26',until:'2026-10-27',
    mural:section([{id:1,titulo:'<img src=x onerror=alert(1)>',texto:'Aviso da comunidade',data:'2026-09-27',autor:'Autor'}]),
    eventos:section([{id:2,titulo:'Encontro',texto:'Evento de teste',data:'2026-09-28'}]),
    compromissos:section([]),escalas:section([{id:3,titulo:'Minha escala',texto:'Recepção',data:'2026-09-29',resposta:'PENDENTE'}]),
  };
}
test('reader uses literal text, filters local data and clears operational content on lock', () => {
  const app=shell();
  app.send({prepared:true,communityName:'Teste',preparedAt:1000,validForMs:1000,snapshot:snapshot()});
  assert.equal(app.elements.get('reader-content').hidden,false);
  assert.equal(app.elements.get('items').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.doesNotMatch(source,/innerHTML|localStorage|indexedDB|fetch\(/);
  app.elements.get('tab-agenda').handlers.click();
  assert.equal(app.elements.get('tab-agenda').attributes['aria-pressed'],'true');
  app.elements.get('search').value='inexistente'; app.elements.get('search').handlers.input();
  assert.match(app.elements.get('list-status').textContent,/0 item/);
  app.elements.get('lock').handlers.click();
  assert.equal(app.elements.get('reader-content').hidden,true); assert.equal(app.elements.get('items').textContent,'');
  assert.equal(app.elements.get('search').value,'');
  assert.equal(app.requests.at(-1).action,'lock');
});
test('out-of-order replies cannot restore a snapshot after lock; expiry removes content', () => {
  const app=shell(), ready={prepared:true,communityName:'Teste',preparedAt:1000,validForMs:1000,snapshot:snapshot()};
  app.send(ready); const oldId=app.requests.at(-1).requestId;
  app.elements.get('lock').handlers.click(); app.send({...ready,requestId:oldId});
  assert.equal(app.elements.get('reader-content').hidden,true);
  app.send(ready); [...app.timers.values()][0]();
  assert.equal(app.elements.get('reader-content').hidden,true); assert.equal(app.elements.get('items').textContent,'');
});
test('revoked sections, empty content and capped results are explained', () => {
  const app=shell(), data=snapshot(); data.mural={allowed:false,hasMore:false,items:[]};
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data});
  assert.match(app.elements.get('list-status').textContent,/não foi autorizada/);
  data.mural={allowed:true,hasMore:true,items:[]};
  app.send({prepared:true,preparedAt:2,validForMs:1000,snapshot:data});
  assert.match(app.elements.get('list-status').textContent,/mais itens disponíveis online/);
});

test('personal requests require a separate opt-in and are never invented for older snapshots', () => {
  const app=shell();
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:snapshot()});
  assert.equal(app.elements.get('tab-pedidos').hidden,true);
  app.elements.get('prepare').handlers.click();assert.equal(app.requests.at(-1).action,'refresh');
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:snapshot()});
  app.elements.get('prepare-requests').handlers.click();assert.equal(app.requests.at(-1).action,'refresh-requests');
});
test('own request text is literal, searchable and visibly historical; revoked consent clears the selected section', () => {
  const app=shell(),data=snapshot();
  data.pedidos={allowed:true,hasMore:true,items:[{id:4,titulo:'<b>Meu pedido</b>',texto:'Texto particular',tipo:'ORACAO',status:'EM_ANALISE',data:'2026-09-27',atualizado:'2026-09-27'}]};
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data});
  app.elements.get('tab-pedidos').handlers.click();
  assert.equal(app.elements.get('tab-pedidos').hidden,false);
  assert.equal(app.elements.get('requests-notice').hidden,false);
  const article=app.elements.get('items').children.at(-1);
  assert.equal(article.children[0].textContent,'<b>Meu pedido</b>');
  assert.ok(article.children.some(x=>x.textContent==='Oração · Em análise'));
  app.elements.get('search').value='particular';app.elements.get('search').handlers.input();
  assert.match(app.elements.get('list-status').textContent,/1 item/);
  data.pedidos={allowed:false,hasMore:false,items:[]};
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data,result:'requests-denied'});
  assert.equal(app.elements.get('tab-pedidos').hidden,true);
  assert.equal(app.elements.get('requests-notice').hidden,true);
  assert.equal(app.elements.get('tab-mural').attributes['aria-pressed'],'true');
  assert.match(app.elements.get('context-detail').textContent,/acesso ou plano/);
});

test('home shortcuts select a saved section without sending a consent or clearing a draft', () => {
  const app=shell(), data=snapshot();
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data});
  assert.equal(app.elements.get('shortcut-agenda').attributes.href,'#read-agenda');
  const count=app.requests.length;
  app.elements.get('search').value='consulta antiga';
  app.elements.get('shortcut-agenda').handlers.click();
  assert.equal(app.elements.get('tab-agenda').attributes['aria-pressed'],'true');
  assert.equal(app.elements.get('search').value,'');
  assert.equal(app.requests.length,count);
  assert.equal(app.elements.get('shortcut-pedidos').attributes.href,'#offline-settings');
  app.elements.get('shortcut-pedidos').handlers.click();
  assert.equal(app.elements.get('offline-settings').open,true);
  assert.equal(app.requests.length,count);
});

test('home availability is cleared on expiry, lock and denied sections', () => {
  const app=shell(), data=snapshot();
  data.mural.allowed=false;data.mural.items=[];
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data});
  assert.equal(app.elements.get('shortcut-mural').attributes['data-ready'],'false');
  assert.match(app.elements.get('shortcut-mural-status').textContent,/Não autorizado/);
  assert.equal(app.elements.get('context-dot').attributes['data-ready'],'true');
  [...app.timers.values()][0]();
  for(const name of ['mural','agenda','escalas','pedidos']) {
    assert.equal(app.elements.get('shortcut-'+name).attributes.href,'#offline-settings');
    assert.equal(app.elements.get('shortcut-'+name).attributes['data-ready'],'false');
  }
  assert.equal(app.elements.get('context-dot').attributes['data-ready'],'false');
  assert.doesNotMatch(app.elements.get('home-notice').textContent,/acesso até/);
});

test('network availability does not claim confirmed server connectivity', () => {
  const app=shell();
  assert.equal(app.elements.get('network-badge').textContent,'Sem conexão');
  assert.doesNotMatch(source,/textContent\s*=\s*navigator.onLine\s*\?\s*'Online'/);
});
