// Browser-only fixtures. No production account, storage or endpoint.
const {chromium}=require(process.env.VINKULO_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const assets=path.resolve(__dirname,'../app/src/main/assets/mobile-app'),output=path.resolve(process.env.VINKULO_QA_DIR||'app/build/reports/redesign');
const csp="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://localhost').pathname.replace('/mobile-app/','');
  assert.match(name,/^(index\.html|app\.(css|js)|theme\.js|navigation\.js|visitors\.js|modules\.js|instrument-sans\.woff2)$/);
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'application/javascript','Content-Security-Policy':csp});res.end(await fs.readFile(path.join(assets,name)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({headless:true,...(process.env.VINKULO_BROWSER_CHANNEL?{channel:process.env.VINKULO_BROWSER_CHANNEL}:{})});}catch(e){server.close();throw e;}
 const errors=[];
 try{for(const scheme of ['light','dark'])for(const width of [320,390,600]){
  const page=await browser.newPage({viewport:{width,height:844},colorScheme:scheme});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'onLine',{get:()=>false});window.qaRequests=[];window.qaPrepared=true;window.qaFailSave=false;window.qaSaveDelay=0;
   const section=items=>({allowed:true,hasMore:false,items:items||[]});
   const light={'bg':'#f6f0ea','surface':'#fffaf6','surface-2':'#eee1d7','text':'#34241f','muted':'#79675f','line':'#e0d0c4','primary':'#9b4938','on-primary':'#ffffff','link':'#9b4938'};
   const dark={'bg':'#120c0b','surface':'#1d1412','surface-2':'#2a1d1a','text':'#fff3eb','muted':'#c4aaa0','line':'#45302a','primary':'#e88a70','on-primary':'#000000','link':'#e88a70'};
   window.qaTheme={version:1,paletteId:'ACOLHEDOR',light,dark};
   window.VinkuloOffline={postMessage(raw){const q=JSON.parse(raw);window.qaRequests.push(q);setTimeout(()=>this.onmessage({data:JSON.stringify({requestId:q.requestId,...(window.qaPrepared?{prepared:true,communityName:'Comunidade de teste',preparedAt:1,validForMs:3600000,theme:window.qaTheme,snapshot:{from:'2026-09-27',until:'2026-10-27',mural:section([{id:1,titulo:'Aviso de teste local',texto:'Somente validação visual.',data:'2026-09-28'}]),eventos:section(),compromissos:section(),escalas:section()}}:{prepared:false})})}),0);}};
   for(const name of ['Visitors','Modules'])window['Vinkulo'+name]={postMessage(raw){const q=JSON.parse(raw);window.qaRequests.push(q);setTimeout(()=>this.onmessage({data:JSON.stringify({requestId:q.requestId,module:q.module,prepared:window.qaPrepared,communityName:'Comunidade de teste',issuedAt:1,validForMs:3600000,canWrite:true,snapshot:{items:[],options:[{id:1,label:'Registro autorizado',version:1}]},rows:[],...(q.action==='save'?(window.qaFailSave?{error:'Falha de teste ao salvar'}:{savedId:'fixture-id'}):{})})}),q.action==='save'?window.qaSaveDelay:0);}};
  });
  const visible=async id=>assert.equal(await page.locator('#'+id).isVisible(),true,id);
  const shot=async name=>page.screenshot({path:path.join(output,name+'-'+scheme+'-'+width+'.png')});
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
  const go=async hash=>page.evaluate(h=>window.VinkuloNavigation.go(h),hash);
  await page.goto('http://127.0.0.1:'+server.address().port+'/mobile-app/index.html');await page.waitForFunction(()=>document.getElementById('shortcut-mural-status').textContent==='Consulta salva');
  await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('16px "Instrument Sans"')),true);
  assert.equal(await page.locator('.feature').count(),6);assert.equal(await page.locator('#visitor-section').isVisible(),false);
  assert.equal(await page.locator('html').getAttribute('data-palette'),'ACOLHEDOR');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),scheme==='light'?'#9b4938':'#e88a70');
  const end=await page.locator('.feature-grid').boundingBox();assert.ok(end.y+end.height<844);await fit();await shot('home');
  await page.locator('#shortcut-agenda').click();await visible('reader');assert.equal(await page.locator('#home-screen').isVisible(),false);assert.equal(await page.locator('#tab-agenda').getAttribute('aria-pressed'),'true');
  await page.locator('#screen-back').click();await page.locator('#manage-offline').click();await visible('offline-settings');assert.equal(await page.evaluate(()=>window.qaRequests.some(q=>q.action!=='status')),false);await shot('settings');
  await go('#module-section');await visible('module-menu');await shot('functions');await page.locator('a[href="#module-notes"]').click();await page.locator('#module-input-titulo').waitFor();
  await page.locator('#module-input-titulo').fill('Não perder este texto');await visible('module-dirty');page.once('dialog',d=>d.dismiss());await page.locator('a[href="#module-section"]').last().click();assert.equal(await page.locator('#module-input-titulo').inputValue(),'Não perder este texto');
  await page.evaluate(()=>window.qaFailSave=true);await page.locator('#module-save').click();await page.waitForFunction(()=>document.getElementById('module-status').textContent==='Falha de teste ao salvar');await visible('module-dirty');
  await page.evaluate(()=>{window.qaFailSave=false;window.qaSaveDelay=250;});await page.locator('#module-save').click();await page.locator('#module-input-titulo').fill('Edição durante salvamento');await page.waitForFunction(()=>document.getElementById('module-status').textContent.includes('Rascunho salvo'));await visible('module-dirty');
  page.once('dialog',d=>d.dismiss());await go('#module-parking');assert.equal(await page.locator('#module-input-titulo').inputValue(),'Edição durante salvamento');await page.locator('#module-save').click();await page.waitForFunction(()=>document.getElementById('module-dirty').hidden);await shot('notes');
  for(const kind of ['requests','followups','checklists','cells','parking']){await go('#module-'+kind);await page.waitForFunction(()=>!document.getElementById('module-workspace').hidden);await fit();await shot(kind);}
  await go('#visitor-section');await page.locator('#visitor-name').fill('Visitante não salvo');page.once('dialog',d=>d.dismiss());await page.locator('#screen-back').click();assert.equal(await page.locator('#visitor-name').inputValue(),'Visitante não salvo');
  await page.locator('#visitor-save').click();await page.waitForFunction(()=>document.getElementById('visitor-dirty').hidden);await shot('visitor');await page.locator('#visitor-name').fill('Descartar formulário');page.once('dialog',d=>d.accept());await go('#top');assert.equal(await page.locator('#visitor-name').inputValue(),'');
  assert.equal(await page.evaluate(()=>window.qaRequests.some(q=>['enqueue','discard','prepare','refresh'].includes(q.action))),false);
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await fit();assert.ok((await page.locator('.app-header > div').boundingBox()).width>=256);assert.ok((await page.locator('.feature').first().boundingBox()).width>=256);await shot('large-home');
  await go('#module-notes');await page.waitForFunction(()=>!document.getElementById('module-workspace').hidden);await fit();assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('button,a,input,select,textarea,summary')).filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<48).map(e=>e.id||e.textContent)),[]);await shot('large-notes');
  await page.evaluate(()=>{window.qaPrepared=false;window.dispatchEvent(new Event('vinkulo:offline-status'));});await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-palette'));assert.equal(await page.locator('#community').textContent(),'');await go('#read-agenda');await visible('reader-locked');await page.close();
 }assert.deepEqual(errors,[]);console.log('Visual QA passed: six layouts/themes; dedicated screens; guards; failed/raced saves; theme reset; 200% text; offline navigation. '+output);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
