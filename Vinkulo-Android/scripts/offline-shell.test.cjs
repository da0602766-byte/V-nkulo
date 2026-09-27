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
      appendChild(child) {this.children.push(child);},
    };
  }
  const document = { hidden: false,
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }, addEventListener(name, fn) { events[name] = fn; },
  };
  const window = {location:{assign(){}}, addEventListener(){}, setInterval(){},
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
  assert.equal(app.elements.get('reader').hidden,false);
  assert.equal(app.elements.get('items').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.doesNotMatch(source,/innerHTML|localStorage|indexedDB|fetch\(/);
  app.elements.get('tab-agenda').handlers.click();
  assert.equal(app.elements.get('tab-agenda').attributes['aria-pressed'],'true');
  app.elements.get('search').value='inexistente'; app.elements.get('search').handlers.input();
  assert.match(app.elements.get('list-status').textContent,/0 item/);
  app.elements.get('lock').handlers.click();
  assert.equal(app.elements.get('reader').hidden,true); assert.equal(app.elements.get('items').textContent,'');
  assert.equal(app.elements.get('search').value,'');
  assert.equal(app.requests.at(-1).action,'lock');
});
test('out-of-order replies cannot restore a snapshot after lock; expiry removes content', () => {
  const app=shell(), ready={prepared:true,communityName:'Teste',preparedAt:1000,validForMs:1000,snapshot:snapshot()};
  app.send(ready); const oldId=app.requests.at(-1).requestId;
  app.elements.get('lock').handlers.click(); app.send({...ready,requestId:oldId});
  assert.equal(app.elements.get('reader').hidden,true);
  app.send(ready); [...app.timers.values()][0]();
  assert.equal(app.elements.get('reader').hidden,true); assert.equal(app.elements.get('items').textContent,'');
});
test('revoked sections, empty content and capped results are explained', () => {
  const app=shell(), data=snapshot(); data.mural={allowed:false,hasMore:false,items:[]};
  app.send({prepared:true,preparedAt:1,validForMs:1000,snapshot:data});
  assert.match(app.elements.get('list-status').textContent,/não foi autorizada/);
  data.mural={allowed:true,hasMore:true,items:[]};
  app.send({prepared:true,preparedAt:2,validForMs:1000,snapshot:data});
  assert.match(app.elements.get('list-status').textContent,/mais itens disponíveis online/);
});
