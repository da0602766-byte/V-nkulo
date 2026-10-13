const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-app/modules.js'),'utf8');
test('module shell avoids replaceAll so bridge-capable older WebViews render selectors',()=>assert.doesNotMatch(source,/\.replaceAll\(/));
function shell(supported=true){
 const elements=new Map(),requests=[],events={},timers=new Map();let tick=0;
 function node(tag='div'){let content='';const n={tagName:tag.toUpperCase(),value:'',hidden:false,disabled:false,children:[],handlers:{},attributes:{},focus(){},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.handlers[k]=f;},appendChild(c){if(c.isFragment)this.children.push(...c.children);else this.children.push(c);if(c.id)elements.set(c.id,c);}};Object.defineProperty(n,'textContent',{get:()=>content,set:v=>{content=v;n.children=[];}});return n;}
 function fragment(){return {isFragment:true,children:[],appendChild(c){this.children.push(c);}};}
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,createDocumentFragment:fragment,addEventListener(k,f){events[k]=f;}};
 document.getElementById('module-kind').value='requests';
 const window={confirm:()=>true,setInterval(){},setTimeout(f){timers.set(++tick,f);return tick;},clearTimeout(i){timers.delete(i);}};
 if(supported)window.VinkuloModules={postMessage:s=>requests.push(JSON.parse(s))};vm.runInNewContext(source,{document,window});
 return {window,requests,document,events,timers,el:k=>document.getElementById('module-'+k),send(state){window.VinkuloModules.onmessage({data:JSON.stringify({requestId:requests.at(-1).requestId,module:requests.at(-1).module,...state})});}};
}
const state={prepared:true,communityName:'Test',issuedAt:1,validForMs:5000,canWrite:true,snapshot:{items:[],options:[]},rows:[]};
test('module saves only acknowledges native persistence; stale replies cannot reveal another module',()=>{const s=shell();s.send(state);s.el('input-titulo').value='Test';s.el('save').handlers.click();assert.equal(s.requests.at(-1).action,'save');assert.doesNotMatch(s.el('status').textContent,/Rascunho salvo/);s.send({...state,savedId:'uuid'});assert.match(s.el('status').textContent,/Rascunho salvo/);s.el('kind').value='notes';const old=s.requests.at(-1).requestId;s.el('kind').handlers.change();s.send({...state,requestId:old,module:'requests'});assert.equal(s.el('workspace').hidden,true);});
test('module pending work stays immutable and content is literal',()=>{const s=shell();s.send({...state,rows:[{id:'x',state:'PENDING',payload:{titulo:'<script>literal</script>'}}]});assert.equal(s.el('rows').children[0].children[0].textContent,'<script>literal</script>');assert.equal(s.el('rows').children[0].children.length,3);assert.equal(s.el('rows').children[0].children[2].children[0].textContent,'Conferir os dados salvos');});
test('cells have drafts but no enqueue, and hidden/expiry clears private contents',()=>{const s=shell();s.send(state);s.el('kind').value='cells';s.el('kind').handlers.change();s.send({...state,canWrite:false,rows:[{id:'x',state:'DRAFT',payload:{observacoes:'test'}}]});assert.equal(s.el('sync').hidden,true);assert.equal(s.el('rows').children[0].children.filter(n=>n.textContent==='Colocar na fila de envio').length,0);s.document.hidden=true;s.events.visibilitychange();assert.equal(s.el('fields').children.length,0);assert.equal(s.el('items').children.length,0);});
test('unsupported WebView explains fallback and lock preempts an in-flight action',()=>{assert.equal(shell(false).el('prepare').disabled,true);const s=shell();s.send(state);s.el('save').handlers.click();s.el('lock').handlers.click();assert.equal(s.requests.at(-1).action,'lock');assert.equal(s.el('workspace').hidden,true);});
test('switching modules never carries a saved acknowledgement into a different form',()=>{const s=shell();s.send({...state,savedId:'saved-note'});assert.match(s.el('status').textContent,/Rascunho salvo/);s.el('kind').value='followups';s.el('kind').handlers.change();assert.equal(s.el('status').textContent,'');s.send(state);assert.doesNotMatch(s.el('status').textContent,/Rascunho salvo/);assert.match(s.el('status').textContent,/Preencha abaixo/);});

test('combined save/send queues only the native saved ID and never submits cells or unauthorized modules',()=>{
 const s=shell();s.send(state);s.el('input-titulo').value='Pedido';s.el('save-send').handlers.click();assert.equal(s.requests.at(-1).action,'save');s.send({...state,savedId:'persisted'});assert.equal(s.requests.at(-1).action,'enqueue');assert.equal(s.requests.at(-1).id,'persisted');
 const cells=shell();cells.send(state);cells.el('kind').value='cells';cells.el('kind').handlers.change();cells.send({...state,canWrite:false});const count=cells.requests.length;cells.el('save-send').handlers.click();assert.equal(cells.requests.length,count);assert.equal(cells.el('save-send').hidden,true);assert.match(cells.el('save-help').textContent,/ainda não está disponível/);
 const denied=shell();denied.send({...state,canWrite:false});denied.el('save-send').handlers.click();assert.equal(denied.requests.length,1);
 const fail=shell();fail.send(state);fail.el('save-send').handlers.click();fail.send({...state,error:'Falha'});assert.equal(fail.requests.at(-1).action,'save');
});

 test('activation timeout unlocks retry and ignores a late response; acknowledged activation reveals form',()=>{
 const s=shell();s.send({prepared:false});s.el('prepare').handlers.click();
 assert.equal(s.requests.at(-1).action,'prepare');assert.equal(s.el('prepare').disabled,true);
 assert.match(s.el('status').textContent,/Ativando/);
 const stale=s.requests.at(-1).requestId;[...s.timers.values()].at(-1)();
 assert.equal(s.el('prepare').disabled,false);assert.match(s.el('status').textContent,/Sem confirmação/);
 s.send({...state,requestId:stale});assert.equal(s.el('workspace').hidden,true);
 s.el('prepare').handlers.click();s.send(state);assert.equal(s.el('workspace').hidden,false);assert.equal(s.el('locked').hidden,true);
 });
