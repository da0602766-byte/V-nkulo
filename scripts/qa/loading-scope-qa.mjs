import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startLogoPreview} from './logo-transition-preview.mjs';
const {chromium}=await import(process.env.VINKULO_PLAYWRIGHT_MODULE || 'playwright');
const preview=await startLogoPreview(4190);
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1864,height:1000}});
const results=[],errors=[];
const record=message=>{results.push(message);console.log(message);};
page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);
page.on('pageerror',error=>errors.push(error.message));
const idle=()=>page.waitForFunction(()=>document.documentElement.dataset.logoController==='ready'&&document.querySelector('.platform-loading-transition')?.dataset.phase==='idle');
const state=()=>page.evaluate(()=>({phase:document.querySelector('.platform-loading-transition')?.dataset.phase,inert:document.querySelector('#main-content').inert,blocked:document.documentElement.hasAttribute('data-logo-transition')}));
const expectedIdle={phase:'idle',inert:false,blocked:false};
await fs.mkdir('outputs/loading-scope',{recursive:true});
try {
 await page.goto(preview.base+'/qa-fixture');await idle();
 assert.deepEqual(await state(),expectedIdle);
 record('A ready document does not force an initial loading screen');
 const localClasses=['workspace-module-loading','pilot-page-loading','pilot-loading','global-navigation-loading','owner-loading','oc-loading','people-loading','gestao-loading','event-skeleton-grid','secretary-skeleton-hero','request-care-skeleton','network-loading','editorial-loading','statistics-loading','platform-optimizer-loading','cells-load-state','storage-load-state','central-dashboard','day-thread-main-v5'];
 for(const name of localClasses){
  await page.evaluate(name=>{const el=document.createElement('section');el.id='local-pending';el.className=name;el.setAttribute('aria-busy','true');el.dataset.pageLoading='true';el.textContent='Preparando dados desta aba';document.querySelector('#main-content').append(el);},name);
  await page.waitForTimeout(20);
  assert.deepEqual(await state(),expectedIdle,name);
  await page.evaluate(()=>document.querySelector('#local-pending').remove());
 }
 record('19 local module/skeleton loaders do not activate a full-page overlay');
 const navigationState=await page.evaluate(()=>{window.dispatchEvent(new Event('vinkulo:document-navigation'));document.querySelector('#native').click();return {phase:document.querySelector('.platform-loading-transition').dataset.phase,inert:document.querySelector('#main-content').inert,blocked:document.documentElement.hasAttribute('data-logo-transition')};});
 assert.deepEqual(navigationState,expectedIdle);
 record('Ordinary document navigation and links do not force a loading screen');
 await page.goto(preview.base+'/qa-fixture');await idle();
 const submitState=await page.evaluate(()=>{const form=document.createElement('form');form.action='/ordinary-submit';document.body.append(form);form.requestSubmit();return document.querySelector('.platform-loading-transition').dataset.phase;});
 assert.equal(submitState,'idle');
 record('Ordinary forms do not force a loading screen');
 await page.goto(preview.base+'/qa-fixture');await idle();
 await page.evaluate(()=>{const el=document.createElement('div');el.id='visitors-loading';el.className='vp-loading';el.setAttribute('aria-busy','true');document.querySelector('#main-content').append(el);});
 await page.waitForFunction(()=>document.querySelector('.platform-loading-transition').dataset.phase==='waiting');
 assert.equal((await state()).inert,true);
 await page.evaluate(()=>document.querySelector('#visitors-loading').remove());await idle();
 record('Visitantes still waits for its data and reveals the page');
 await page.goto(preview.base+'/qa-login/member');
 await page.waitForFunction(()=>document.documentElement.dataset.logoController==='ready');
 assert.equal(await page.locator('.platform-loading-transition').getAttribute('data-phase'),'waiting');
 await idle();
 record('Community entry still starts its arrival animation');
 await page.getByRole('button',{name:'Manter no celular',exact:true}).click();
 await page.locator('dialog.storage-onboarding').waitFor({state:'detached'});
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:1000}).catch(()=>{});
 await page.evaluate(()=>{window.loadingStarts=[];new MutationObserver(()=>{if(document.querySelector('.platform-loading-transition').dataset.phase==='waiting')window.loadingStarts.push(location.href);}).observe(document.querySelector('.platform-loading-transition'),{attributes:true,attributeFilter:['data-phase']});});
 const buttons=await page.locator('.pilot-sidebar nav button[data-editor-key^="menu-principal-"]').evaluateAll(els=>els.map(el=>({key:el.dataset.editorKey,label:el.getAttribute('aria-label')})));
 let checked=0;
 for(const {key,label}of buttons){
  if(key.includes('visitantes')||key.includes('visual-editor'))continue;
  const button=page.locator(`.pilot-sidebar button[data-editor-key="${key}"]`);
  await button.click();await page.waitForTimeout(160);
  assert.deepEqual(await state(),expectedIdle,label);
  checked++;
 }
 assert.equal(checked,buttons.filter(({key})=>!key.includes('visitantes')&&!key.includes('visual-editor')).length);
 assert.ok(checked>0);
 assert.deepEqual(await page.evaluate(()=>window.loadingStarts),[]);
 record(`${checked} real community tab clicks do not activate the full-page overlay`);
 await page.locator('.pilot-sidebar button[data-editor-key="menu-principal-visitantes"]').click();
 await page.waitForURL('**/painel/visitantes');
 await page.waitForFunction(()=>document.documentElement.dataset.logoController==='ready');
 assert.equal(await page.locator('.platform-loading-transition').getAttribute('data-phase'),'waiting');
 await idle();
 record('Real Visitantes navigation retains its arrival animation');
 for(const width of [1864,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`outputs/loading-scope/tabs-${width}.png`});}
 assert.deepEqual(errors,[]);
 await fs.writeFile('outputs/loading-scope/results.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2));
} finally {await browser.close();await preview.close();}
