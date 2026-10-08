const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function shell(bridge=true){
 const elements=new Map(),events={},requests=[],timers=new Map();let nextTimer=0;
 function node(){return {children:[],attrs:{},events:{},disabled:false,_text:'',set textContent(v){this._text=v;this.children=[];},get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},appendChild(n){this.children.push(n);return n;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},querySelector(){return this.children.find(c=>c.attrs['aria-pressed']==='true');},focus(){this.focused=true;}};}
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,createDocumentFragment:node,addEventListener(k,f){events[k]=f;}};
 const window={confirm:()=>false,setTimeout(f,ms){const id=++nextTimer;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(f){this.interval=f;}};
 if(bridge)window.VinkuloPending={postMessage:raw=>requests.push(JSON.parse(raw))};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-app/pending.js'),'utf8'),{window,document});
 return {window,document,requests,timers,events,el:id=>document.getElementById('pending-'+id),reply(state,id=requests.at(-1).requestId){window.VinkuloPending.onmessage({data:JSON.stringify({requestId:id,...state})});}};
}
const row=(state,title=state)=>({id:state,state,title,updatedAt:1});
const state=rows=>({sections:[{module:'notes',ready:true,communityName:'Teste',rows,canSync:rows.some(r=>r.state==='PENDING')},{module:'visitors',ready:false,rows:[row('DRAFT','SEGREDO BLOQUEADO')]}],validForMs:100000});
test('central groups authorized rows, never exposes locked rows, renders literal titles and filters',()=>{
 const s=shell();s.reply(state(['DRAFT','PENDING','CONFIRMED','CONFLICT','REJECTED','SENDING','RETRY'].map(x=>row(x,x==='DRAFT'?'<img onerror=alert(1)>':x))));
 assert.match(s.el('result').textContent,/7 registro/);assert.doesNotMatch(s.el('list').textContent,/SEGREDO/);assert.match(s.el('list').textContent,/<img onerror/);assert.equal(s.el('filters').children[1].textContent,'Revisão (2)');
 s.el('filters').children[1].events.click();assert.match(s.el('result').textContent,/2 registro/);assert.doesNotMatch(s.el('list').textContent,/Rascunho/);assert.equal(s.el('filters').children[1].focused,true);
 assert.equal(s.el('list').children.length,1,'one batched fragment');assert.equal(s.requests.length,1,'read only');
});
test('sync requires confirmation and sends no payload, draft or enqueue operation',()=>{
 const s=shell();s.reply(state([row('PENDING'),row('DRAFT')]));s.el('sync').events.click();assert.equal(s.requests.length,1);
 s.window.confirm=()=>true;s.el('sync').events.click();assert.deepEqual(s.requests.at(-1),{action:'sync',requestId:2});s.reply({...state([row('PENDING')]),scheduled:1});assert.match(s.el('status').textContent,/Isso não confirma/);
});
test('lock, background, expiry and stale callbacks cannot restore protected summaries',()=>{
 const s=shell();s.reply(state([row('DRAFT','PRIVADO')]));s.window.VinkuloPendingScreen.invalidate();assert.equal(s.el('list').textContent,'');s.reply(state([row('DRAFT','PRIVADO')]),1);assert.equal(s.el('list').textContent,'');
 s.window.VinkuloPendingScreen.refresh();s.reply(state([row('DRAFT','PRIVADO')]));s.document.hidden=true;s.events.visibilitychange();assert.equal(s.el('list').textContent,'');s.reply(state([row('DRAFT','PRIVADO')]));assert.equal(s.el('list').textContent,'');
 s.document.hidden=false;s.events.visibilitychange();s.reply(state([row('DRAFT','PRIVADO')]));[...s.timers.values()].find(t=>t.ms===100000).f();assert.equal(s.el('list').textContent,'');assert.equal(s.requests.at(-1).action,'status');
});
test('dropped replies time out, reject late data and allow retry; bridge errors fail closed',()=>{
 const s=shell();[...s.timers.values()].find(t=>t.ms===12000).f();assert.equal(s.el('refresh').disabled,false);s.reply(state([row('DRAFT','PRIVADO')]),1);assert.equal(s.el('list').textContent,'');
 s.el('refresh').events.click();s.reply({error:true});assert.match(s.el('status').textContent,/não foi apagado/);assert.equal(s.el('sync').disabled,true);
 const unsupported=shell(false);assert.equal(unsupported.el('refresh').disabled,true);assert.match(unsupported.el('status').textContent,/WebView/);
});
test('background polling never sends and active central only polls local status',()=>{
 const s=shell();s.reply(state([]));s.window.interval();assert.equal(s.requests.length,1);s.window.VinkuloNavigation={current:()=>'#pending-section'};s.window.interval();assert.equal(s.requests.at(-1).action,'status');s.reply(state([]));s.document.hidden=true;s.window.interval();assert.equal(s.requests.length,2);
});

test('locked counts are unknown rather than zero and previously visible summary is cleared',()=>{
 const s=shell();s.reply(state([row('CONFLICT'),row('PENDING')]));
 assert.equal(s.el('count-review').textContent,'1');assert.equal(s.el('home').attrs['data-attention'],'true');
 assert.match(s.el('scope').textContent,/Resumo parcial/);
 s.window.VinkuloPendingScreen.refresh();s.reply({sections:[{module:'notes',ready:false,rows:[row('DRAFT','SEGREDO')]}]});
 assert.equal(s.el('count-review').textContent,'—');assert.equal(s.el('count-drafts').textContent,'—');
 assert.match(s.el('home-status').textContent,/Acesso não preparado/);assert.doesNotMatch(s.el('home-status').textContent,/0 /);
 assert.equal(s.el('access-details').open,true);assert.doesNotMatch(s.el('list').textContent,/SEGREDO/);
 s.window.VinkuloPendingScreen.invalidate();assert.equal(s.el('count-queued').textContent,'—');assert.equal(s.el('scope').hidden,true);
});

test('empty authorized queues cannot sync even through a programmatic click',()=>{
 const s=shell();s.reply(state([row('DRAFT')]));s.window.confirm=()=>true;
 const count=s.requests.length;s.el('sync').events.click();assert.equal(s.requests.length,count);
});

test('pending search combines the selected filter and authorized titles without exposing locked rows or sending data',()=>{
 const s=shell();s.reply(state([row('DRAFT','Reunião de domingo'),row('CONFLICT','Reunião de líderes'),row('CONFIRMED','Recibo') ]));
 s.el('search').value='reunião';s.el('search').events.input();assert.match(s.el('result').textContent,/2 registros encontrados nesta busca/);
 s.el('filters').children[1].events.click();assert.match(s.el('result').textContent,/1 registro encontrado/);assert.doesNotMatch(s.el('list').textContent,/domingo/);
 s.el('search').value='SEGREDO';s.el('search').events.input();assert.match(s.el('result').textContent,/0 registros/);assert.doesNotMatch(s.el('list').textContent,/SEGREDO/);
 assert.equal(s.requests.length,1);s.window.VinkuloPendingScreen.invalidate();assert.equal(s.el('search').value,'');
});
