const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/mobile-app/app.js'), 'utf8');

function shell(supported = true) {
  const elements = new Map(), events = {}, requests = [], timers = new Map();
  let nextTimer = 0;
  const document = { hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {textContent:'', hidden:false, disabled:false, addEventListener(){}});
      return elements.get(id);
    }, addEventListener(name, fn) { events[name] = fn; },
  };
  const window = {location:{assign(){}}, addEventListener(){}, setInterval(){},
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
  };
  if (supported) window.VinkuloOffline = {postMessage(raw) { requests.push(JSON.parse(raw)); }};
  vm.runInNewContext(source, {window, document, navigator:{onLine:false}});
  return {elements, events, requests, timers, document, window,
    send(state) { window.VinkuloOffline.onmessage({data:JSON.stringify(state)}); },
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
