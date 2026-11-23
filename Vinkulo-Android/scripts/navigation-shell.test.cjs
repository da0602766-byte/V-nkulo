const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-app/'+name+'.js'),'utf8');
function shell(){
 const elements=new Map(),events={},opened=[],selected=[];
 const document={title:'',getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',focus(){document.focus=id;},addEventListener(){}});return elements.get(id);},addEventListener(k,fn){events[k]=fn;}};
 const window={location:{hash:''},history:{replaceState(a,b,hash){window.location.hash=hash;}},scrollTo(){},confirm:()=>false,alert(){},addEventListener(k,fn){events[k]=fn;},VinkuloModuleScreen:{open:k=>opened.push(k)},VinkuloReaderSelect:k=>selected.push(k)};
 vm.runInNewContext(source('navigation'),{window,document});return {window,document,elements,events,opened,selected,nav:window.VinkuloNavigation};
}
test('dedicated screens expose one workspace and focus the route title',()=>{
 const s=shell();s.nav.go('#module-section');assert.equal(s.elements.get('module-menu').hidden,false);assert.equal(s.elements.get('home-screen').hidden,true);assert.equal(s.document.focus,'screen-title');
 s.nav.go('#module-notes');assert.deepEqual(s.opened,['notes']);assert.equal(s.elements.get('module-menu').hidden,true);assert.equal(s.elements.get('module-section').hidden,false);
 s.nav.back();assert.equal(s.nav.current(),'#module-section');s.nav.back();assert.equal(s.nav.current(),'#top');assert.equal(s.nav.back(),false);
 s.nav.go('#read-agenda');assert.deepEqual(s.selected,['agenda']);assert.equal(s.elements.get('reader').hidden,false);
});
test('cancel/back/hash changes preserve dirty fields; confirmed discard never sends or saves',()=>{
 const s=shell();let dirty=true,discarded=0;
 s.nav.register('module-section',{dirty:()=>dirty,busy:()=>false,discard(){discarded++;dirty=false;}});s.nav.go('#module-notes');
 assert.equal(s.nav.go('#top'),false);assert.equal(s.nav.current(),'#module-notes');assert.equal(discarded,0);
 s.nav.back();assert.equal(s.nav.current(),'#module-notes');s.window.location.hash='#top';s.events.hashchange();assert.equal(s.window.location.hash,'#module-notes');
 s.window.confirm=()=>true;s.nav.go('#top');assert.equal(discarded,1);assert.equal(s.nav.current(),'#top');
});
test('in-flight writes block route changes, while clean local status does not',()=>{
 const s=shell();let busy=true;s.nav.register('visitor-section',{busy:()=>busy,dirty:()=>false,discard(){throw Error('No discard');}});s.nav.go('#visitor-section');
 assert.equal(s.nav.go('#module-notes'),false);assert.equal(s.nav.current(),'#visitor-section');busy=false;assert.equal(s.nav.go('#module-notes'),true);
});
test('community theme applies bounded colors only and resets on lock, old grant or invalid data',()=>{
 const values={},attrs={},root={style:{removeProperty:k=>delete values[k],setProperty:(k,v)=>values[k]=v},removeAttribute:k=>delete attrs[k],setAttribute:(k,v)=>attrs[k]=v};
 const media={matches:false,addEventListener(k,fn){this.change=fn;}},window={matchMedia:()=>media};vm.runInNewContext(source('theme'),{window,document:{documentElement:root}});
 const light=Object.fromEntries(['bg','surface','surface-2','text','muted','line','primary','on-primary','link'].map(k=>[k,'#112233'])),dark={...light,primary:'#ddeeff'};
 const ready={prepared:true,theme:{version:1,paletteId:'CLASSICO',light,dark}};window.VinkuloTheme(ready);assert.equal(values['--primary'],'#112233');assert.equal(attrs['data-palette'],'CLASSICO');
 media.matches=true;media.change();assert.equal(values['--primary'],'#ddeeff');window.VinkuloTheme({prepared:false,theme:ready.theme});assert.deepEqual(values,{});assert.deepEqual(attrs,{});
 window.VinkuloTheme(ready);window.VinkuloTheme({prepared:true});assert.deepEqual(values,{});
 ready.theme.light.primary='url(https://evil.test)';window.VinkuloTheme(ready);assert.deepEqual(values,{});
});
