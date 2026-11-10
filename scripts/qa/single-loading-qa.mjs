import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startLogoPreview} from './logo-transition-preview.mjs';
const {chromium}=await import(process.env.VINKULO_PLAYWRIGHT_MODULE||'playwright');
const preview=await startLogoPreview(4192),browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1864,height:1000}}),results=[],errors=[];
page.setDefaultTimeout(18000);page.on('pageerror',error=>errors.push(error.message));
const record=message=>{results.push(message);console.log(message);};
const phase=()=>page.locator('.platform-loading-transition').getAttribute('data-phase');
const wait=state=>page.waitForFunction(state=>document.documentElement.dataset.logoController==='ready'&&document.querySelector('.platform-loading-transition')?.dataset.phase===state,state);
async function hidden(){assert.equal(await phase(),'waiting');assert.equal(await page.locator('#main-content').evaluate(el=>getComputedStyle(el).opacity),'0');assert.equal(await page.locator('#main-content').evaluate(el=>el.inert),true);}
async function hold(pattern){let release;const gate=new Promise(resolve=>{release=resolve;});let count=0;const tasks=new Set();await page.route(pattern,route=>{count++;const task=gate.then(()=>route.continue());tasks.add(task);return task.finally(()=>tasks.delete(task));});return {count:()=>count,release:async()=>{release();await Promise.all([...tasks]);await page.unroute(pattern);}};}
await fs.mkdir('outputs/single-loading',{recursive:true});
try{
 await page.goto(preview.base+'/qa-fixture?pending');await wait('waiting');
 await page.evaluate(()=>{window.phases=[];new MutationObserver(()=>window.phases.push(document.querySelector('.platform-loading-transition').dataset.phase)).observe(document.querySelector('.platform-loading-transition'),{attributes:true,attributeFilter:['data-phase']});const stage=document.createElement('section');stage.id='data-stage';stage.dataset.vinkuloContentLoading='true';stage.textContent='Aguardando dados iniciais';document.querySelector('#main-content').append(stage);document.querySelector('[data-vinkulo-loading]').remove();});
 await page.waitForTimeout(4200);await hidden();
 await page.evaluate(()=>{const next=document.createElement('section');next.id='module-stage';next.className='workspace-module-loading';next.setAttribute('aria-busy','true');next.textContent='Preparando módulo';document.querySelector('#main-content').append(next);document.querySelector('#data-stage').remove();});
 await page.waitForTimeout(500);await hidden();
 await page.evaluate(()=>document.querySelector('#module-stage').remove());await wait('idle');
 assert.deepEqual(await page.evaluate(()=>window.phases),['revealing','idle']);
 record('Consecutive module/data stages produce a single reveal after all stages finish');
 await page.goto(preview.base+'/qa-fixture?pending');await wait('waiting');await page.waitForTimeout(2200);
 const scripts=await hold('**/qa-controller.js');
 await page.goto(preview.base+'/qa-fixture?pending&destination=1',{waitUntil:'commit'});
 await page.locator('#main-content').waitFor({state:'attached'});
 assert.equal(await page.locator('html').getAttribute('data-logo-transition'),'waiting');
 assert.equal(await page.locator('#main-content').evaluate(el=>getComputedStyle(el).opacity),'0');
 assert.equal(await page.locator('.platform-loading-transition').isVisible(),true);
 await page.screenshot({path:'outputs/single-loading/before-hydration.png'});
 await scripts.release();await wait('waiting');
 const removed=Date.now();await page.evaluate(()=>document.querySelector('[data-vinkulo-loading]').remove());await wait('revealing');assert.ok(Date.now()-removed<1400,'continuation must not restart its 1800ms minimum');await wait('idle');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vinkulo:page-loading')),null);
 record('Document handoff covers the first paint and preserves the existing loading time');
 await page.goto(preview.base+'/qa-fixture');await wait('idle');assert.equal(await page.locator('html').getAttribute('data-logo-transition'),null);
 record('A finished transition does not leak into a later ordinary page');
 await page.goto(preview.base+'/qa-login/member');await wait('idle');
 await page.getByRole('button',{name:'Manter no celular',exact:true}).click();await page.locator('dialog.storage-onboarding').waitFor({state:'detached'});
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:1000}).catch(()=>{});
 const people=await hold('**/api/pilot/visitantes/pagina');
 await page.locator('.pilot-sidebar button[data-editor-key="menu-principal-visitantes"]').click();await page.waitForURL('**/painel/visitantes');await wait('waiting');await page.waitForTimeout(4200);assert.ok(people.count()>0);await hidden();
 await people.release();await wait('idle');assert.equal(await page.locator('.vp-loading').count(),0);
 record('Real Visitantes navigation waits for a slow people query before showing the page');
 const lists=await hold('**/api/pilot/visitantes/listas');
 await page.goto(preview.base+'/painel/visitantes?section=listas');await wait('waiting');await page.waitForTimeout(4200);assert.ok(lists.count()>0);await hidden();await lists.release();await wait('idle');
 assert.equal(await page.locator('[data-vinkulo-content-loading="true"]').count(),0);
 record('Visitor list access query is included in the initial loading');
 const background=await hold('**/api/pilot/visitantes/listas');await page.getByRole('button',{name:'Atualizar acessos',exact:true}).click();await page.waitForTimeout(300);assert.equal(await phase(),'idle');await background.release();
 record('Refreshing ready visitor lists does not start another full-page loading');
 await page.route('**/api/pilot/visitantes/pagina',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha sintética de consulta'})}));
 await page.goto(preview.base+'/painel/visitantes');await wait('idle');assert.ok(await page.locator('[role="alert"]').filter({hasText:'Falha sintética'}).count());await page.unroute('**/api/pilot/visitantes/pagina');
 record('A failed initial query reveals its error once and releases the page');
 for(const width of [1864,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`outputs/single-loading/ready-${width}.png`});}
 assert.deepEqual(errors,[]);
 await fs.writeFile('outputs/single-loading/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await preview.close();}
