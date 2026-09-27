const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-app/visitors.js'),'utf8');
function shell(supported=true){
  const elements=new Map(),requests=[],events={},timers=new Map();let tick=0;
  function node(){let content='';const n={value:'',hidden:false,disabled:false,children:[],handlers:{},focus(){},addEventListener(k,f){this.handlers[k]=f;},appendChild(c){this.children.push(c);}};Object.defineProperty(n,'textContent',{get:()=>content,set:v=>{content=v;n.children=[];}});return n;}
  const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,addEventListener(k,f){events[k]=f;}};
  const window={confirm:()=>true,setInterval(){},setTimeout(f){timers.set(++tick,f);return tick;},clearTimeout(i){timers.delete(i);}};
  if(supported)window.VinkuloVisitors={postMessage:s=>requests.push(JSON.parse(s))};
  vm.runInNewContext(source,{document,window});
  return {requests,document,events,timers,el:k=>document.getElementById('visitor-'+k),send(state){window.VinkuloVisitors.onmessage({data:JSON.stringify({requestId:requests.at(-1).requestId,...state})});}};
}
const state={prepared:true,communityName:'Test',validForMs:5000,rows:[]};
test('visitor form requires native access and explicit acknowledgement before saying saved',()=>{
  const s=shell();s.send(state);s.el('name').value='Example';s.el('save').handlers.click();
  assert.equal(s.requests.at(-1).action,'save');assert.equal(s.requests.at(-1).visitor.nomeCompleto,'Example');
  assert.doesNotMatch(s.el('status').textContent,/Rascunho salvo/);
  s.send({...state,savedId:'uuid'});assert.match(s.el('status').textContent,/Rascunho salvo/);
  s.el('save').handlers.click();assert.equal(s.requests.at(-1).id,'uuid');
});
test('visitor payload stays literal, pending work cannot be discarded or edited',()=>{
  const s=shell();s.send({...state,rows:[{id:'x',state:'PENDING',visitor:{nomeCompleto:'<script>literal</script>'}}]});
  assert.equal(s.el('rows').children[0].children[0].textContent,'<script>literal</script>');
  assert.equal(s.el('rows').children[0].children.length,2);
});
test('visitor hidden/expired view clears contacts and rejects stale native replies',()=>{
  const s=shell();s.send(state);s.el('name').value='Private';const old=s.requests.at(-1).requestId;
  s.document.hidden=true;s.events.visibilitychange();assert.equal(s.el('name').value,'');assert.equal(s.el('workspace').hidden,true);
  s.document.hidden=false;s.events.visibilitychange();s.send({...state,requestId:old});assert.equal(s.el('workspace').hidden,true);
  s.send(state);[...s.timers.values()][0]();assert.equal(s.el('workspace').hidden,true);
});
test('visitor errors do not loop requests and old WebView has a clear fallback',()=>{
  const s=shell();s.send({error:'Storage unavailable'});assert.equal(s.requests.length,1);assert.equal(s.el('status').textContent,'Storage unavailable');
  const old=shell(false);assert.equal(old.el('prepare').disabled,true);assert.match(old.el('status').textContent,/WebView/);
});
test('visitor lock preempts an in-flight save and rejected save keeps the expiry timer',()=>{
  const s=shell();s.send(state);s.el('save').handlers.click();s.el('lock').handlers.click();
  assert.equal(s.requests.at(-1).action,'lock');assert.equal(s.el('workspace').hidden,true);
  const other=shell();other.send(state);other.el('save').handlers.click();other.send({prepared:true,error:'Cannot save'});
  assert.equal(other.timers.size,1);[...other.timers.values()][0]();assert.equal(other.el('workspace').hidden,true);
});
