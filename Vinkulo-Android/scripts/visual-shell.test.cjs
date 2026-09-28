// Browser-only fixtures. Never packaged or connected to a real account/server.
const {chromium}=require(process.env.VINKULO_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const assets=path.resolve(__dirname,'../app/src/main/assets/mobile-app');
const output=path.resolve(process.env.VINKULO_QA_DIR || path.join(__dirname,'../app/build/reports/redesign'));
const csp="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const server=http.createServer(async(req,res)=>{try{
    const name=new URL(req.url,'http://localhost').pathname.replace('/mobile-app/','');
    assert.match(name,/^(index\.html|app\.(css|js)|visitors\.js|modules\.js|instrument-sans\.woff2)$/);
    res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'application/javascript','Content-Security-Policy':csp});res.end(await fs.readFile(path.join(assets,name)));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try { browser=await chromium.launch({headless:true, ...(process.env.VINKULO_BROWSER_CHANNEL ? {channel:process.env.VINKULO_BROWSER_CHANNEL} : {})}); }
  catch(error) { server.close(); throw error; }
  const errors=[];
  try {
    for(const scheme of ['light','dark']) for(const width of [320,390,600]) {
      const page=await browser.newPage({viewport:{width,height:844},colorScheme:scheme});
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        Object.defineProperty(navigator,'onLine',{get:()=>false});
        window.qaRequests=[];
        const section=items=>({allowed:true,hasMore:false,items:items||[]});
        window.qaPrepared=true;
        window.VinkuloOffline={postMessage(raw){const q=JSON.parse(raw);window.qaRequests.push(q);setTimeout(()=>this.onmessage({data:JSON.stringify({requestId:q.requestId,...(window.qaPrepared?{prepared:true,communityName:'Comunidade de teste',preparedAt:Date.now(),validForMs:3600000,snapshot:{from:'2026-09-27',until:'2026-10-27',mural:section([{id:1,titulo:'Aviso de teste local',texto:'Somente para validação visual.',data:'2026-09-28'}]),eventos:section(),compromissos:section(),escalas:section()}}:{prepared:false})})}),0);}};
      });
      await page.goto('http://127.0.0.1:'+server.address().port+'/mobile-app/index.html');
      await page.waitForFunction(()=>document.getElementById('shortcut-mural-status').textContent==='Consulta salva');
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.fonts.check('16px "Instrument Sans"')),true);
      assert.equal(await page.locator('.feature').count(),6);
      assert.equal(await page.locator('#offline-settings').getAttribute('open'),null);
      const end=await page.locator('.feature-grid').boundingBox();assert.ok(end.y+end.height<844,JSON.stringify({width,end}));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(output,'home-'+scheme+'-'+width+'.png')});
      await page.locator('#shortcut-agenda').click();
      assert.equal(await page.locator('#tab-agenda').getAttribute('aria-pressed'),'true');
      await page.locator('#manage-offline').click();
      assert.equal(await page.locator('#offline-settings').getAttribute('open'),'');
      assert.equal(await page.evaluate(()=>window.qaRequests.some(q=>q.action!=='status')),false);
      await page.screenshot({path:path.join(output,'settings-'+scheme+'-'+width+'.png')});
      await page.evaluate(()=>{document.documentElement.style.fontSize='200%';window.scrollTo(0,0);});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% overflow '+width);
      assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('button,a,input,select,textarea,summary')).filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<48).map(e=>e.id||e.textContent)),[]);
      await page.screenshot({path:path.join(output,'large-'+scheme+'-'+width+'.png')});
      await page.evaluate(()=>{window.qaPrepared=false;window.dispatchEvent(new Event('vinkulo:offline-status'));});
      await page.waitForFunction(()=>document.getElementById('shortcut-mural').getAttribute('href')==='#offline-settings');
      assert.equal(await page.locator('#community').textContent(),'');
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Visual QA: 6 viewports/themes, fonts, shortcuts, consent, expiry, 200% text and 48px targets passed. '+output);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
