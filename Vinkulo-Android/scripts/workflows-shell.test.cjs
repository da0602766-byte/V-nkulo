const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function shell(online=true){
 const nodes=new Map(),events={},calls=[],timers=new Map();let counter=0,guard;
 const node=()=>({textContent:'',disabled:false,checked:false,value:'',events:{},setAttribute(){},addEventListener(k,f){this.events[k]=f;}});
 const el=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const inputs=['visitors','cells','notes'].map(value=>({...node(),value}));el('work-choices').querySelectorAll=()=>inputs;
 const window={VinkuloPending:{},VinkuloPendingScreen:{refresh(){}},VinkuloVisitorScreen:{prepareOffline(done){calls.push({module:'visitors',done});return true;}},VinkuloModuleScreen:{prepareOffline(module,done){calls.push({module,done});return true;}},VinkuloNavigation:{register(_,value){guard=value;}},addEventListener(k,f){events['window:'+k]=f;},setTimeout(f){timers.set(++counter,f);return counter;},clearTimeout(id){timers.delete(id);}};
 const document={hidden:false,getElementById:el,addEventListener(k,f){events[k]=f;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-app/workflows.js'),'utf8'),{window,document,navigator:{onLine:online}});
 return {window,document,el,inputs,calls,timers,events,guard:()=>guard};
}
test('activation is explicit, sequential, and preserves successful functions when another is denied',()=>{
 const s=shell();assert.equal(s.calls.length,0);assert.equal(s.el('work-activate').disabled,true);
 s.inputs.forEach(n=>n.checked=true);s.el('work-choices').events.change();s.el('work-activate').events.click();s.el('work-activate').events.click();
 assert.equal(s.calls.length,1);assert.equal(s.guard().busy(),true);assert.equal(s.inputs.every(n=>n.disabled),true);
 s.calls[0].done({prepared:true});assert.equal(s.calls[1].module,'cells');s.calls[1].done({error:'Sem permissão'});s.calls[2].done({prepared:true});
 assert.match(s.el('work-setup-status').textContent,/2 de 3 funções ativadas/);assert.equal(s.el('setup-cells').textContent,'Sem permissão');assert.equal(s.guard().busy(),false);
});
test('offline cannot start activation; timeout cannot replay a late callback into the next function',()=>{
 const offline=shell(false);offline.inputs[0].checked=true;offline.el('work-activate').events.click();assert.equal(offline.calls.length,0);
 const s=shell();s.inputs.forEach(n=>n.checked=true);s.el('work-activate').events.click();[...s.timers.values()][0]();
 s.calls[0].done({prepared:true});assert.equal(s.calls.length,1);assert.match(s.el('work-setup-status').textContent,/não respondeu/);assert.equal(s.guard().busy(),false);
});
test('backgrounding stops the activation sequence and stale native callbacks cannot restore summaries',()=>{
 const s=shell();s.inputs.forEach(n=>n.checked=true);s.el('work-activate').events.click();s.document.hidden=true;s.events.visibilitychange();s.calls[0].done({prepared:true});
 assert.equal(s.calls.length,1);assert.equal(s.el('setup-visitors').textContent,'');assert.equal(s.guard().busy(),false);assert.match(s.el('work-visitors-status').textContent,/Precisa ativar/);
});
