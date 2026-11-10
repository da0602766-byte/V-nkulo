import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { startLogoPreview } from "./logo-transition-preview.mjs";
const { chromium } = await import(process.env.VINKULO_PLAYWRIGHT_MODULE || "playwright");
const preview = await startLogoPreview();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [], errors = [];
await fs.mkdir("outputs/logo-transition", { recursive: true });
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.platform-loading-transition')?.dataset.phase === 'idle', null, { timeout: 20000 });
}
async function pageFor(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1864, height: 1000 }, ...options });
  page.on("pageerror", e => errors.push(e.message));
  return page;
}
try {
  // Deterministic clock exercises the real controller and server-rendered overlay.
  const fixture = await pageFor();
  await fixture.clock.install();
  await fixture.goto(preview.base + "/qa-fixture?pending");
  await fixture.waitForFunction(() => document.documentElement.dataset.logoController === 'ready');
  await fixture.clock.fastForward(5000);
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'waiting');
  const clips = [];
  for (const time of [240, 850, 1800]) {
    clips.push(await fixture.locator('.vinkulo-mark-draw').evaluate((el,time)=>{
      for (const animation of document.querySelector('.vinkulo-animated-mark').getAnimations({subtree:true})) { animation.pause(); animation.currentTime=time; }
      return getComputedStyle(el).clipPath;
    }, time));
    await fixture.screenshot({path:`outputs/logo-transition/drawing-${time}.png`});
  }
  assert.equal(new Set(clips).size,3,'the actual artwork must be progressively drawn, not just faded');
  assert.ok(await fixture.locator('.vinkulo-mark-shine').evaluate(el=>getComputedStyle(el).maskImage.includes('vinkulo-symbol-v2.png')));
  results.push('v-arms-draw-progressively-with-shine-masked-to-the-artwork');
  await fixture.screenshot({path:'outputs/logo-transition/loading-desktop.png'});
  await fixture.evaluate(() => document.querySelector('[data-vinkulo-loading]').remove());
  await fixture.clock.fastForward(125);
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'revealing');
  await fixture.clock.fastForward(1990);
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'revealing');
  await fixture.clock.fastForward(15);
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'idle');
  assert.equal(await fixture.locator('#main-content').evaluate(el => el.inert), false);
  results.push('waits-for-data-and-reveals-for-at-least-2000ms');

  await fixture.locator('#focus').focus();
  await fixture.evaluate(() => { const marker=document.createElement('div'); marker.dataset.vinkuloLoading='Nova área'; document.querySelector('#main-content').append(marker); });
  await fixture.clock.fastForward(26000);
  assert.equal(await fixture.locator('.platform-loading-recovery').isVisible(), true);
  await fixture.locator('[data-loading-dismiss]').click();
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'idle');
  assert.equal(await fixture.locator('#main-content').evaluate(el => el.inert), false);
  assert.equal(await fixture.evaluate(() => document.activeElement.id), 'focus');
  await fixture.evaluate(() => document.querySelector('[data-vinkulo-loading]').remove());
  await fixture.locator('#hash').click();
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'idle');
  results.push('slow-response-recovery-keyboard-focus-and-hash-links');
  await fixture.evaluate(() => { window.dispatchEvent(new Event('vinkulo:document-navigation')); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})); });
  assert.equal(await fixture.locator('#main-content').evaluate(el => el.inert), false);
  results.push('back-forward-cache-releases-departure-overlay');
  await fixture.close();

  const motion = await pageFor({viewport:{width:390,height:844}});
  await motion.goto(preview.base+'/login');
  await motion.waitForFunction(()=>document.querySelector('.platform-loading-transition')?.dataset.phase==='revealing');
  const flight = await motion.locator('.platform-loading-symbol').evaluate(el=>({duration:el.getAnimations()[0]?.effect.getTiming().duration,destination:document.querySelectorAll('[data-vinkulo-destination]').length,reveal:getComputedStyle(document.querySelector('#main-content')).transitionDuration}));
  assert.deepEqual(flight,{duration:2000,destination:1,reveal:'2s'});
  await motion.screenshot({path:'outputs/logo-transition/revealing-mobile.png'});
  await ready(motion);
  results.push('real-mobile-flight-and-content-fade-last-2000ms');
  await motion.close();

  for (const width of [1864, 768, 390]) {
    const page = await pageFor({ viewport: { width, height: 1000 } });
    for (const route of ["/login", "/proprietario/acesso", "/"]) {
      await page.goto(preview.base + route);
      await ready(page);
      const marks = await page.locator('[data-vinkulo-logo]').evaluateAll(els => els.filter(el => el.getBoundingClientRect().width > 0).map(el => ({ src:el.getAttribute('src'), radius:getComputedStyle(el).borderRadius, background:getComputedStyle(el).backgroundColor, loaded:el.naturalWidth > 0 })));
      assert.ok(marks.length && marks.every(m => m.src === '/vinkulo-symbol-v2.png' && m.radius === '0px' && m.background === 'rgba(0, 0, 0, 0)' && m.loaded), JSON.stringify(marks));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `outputs/logo-transition/${width}-${route.replaceAll('/','') || 'home'}.png` });
    }
    results.push(`transparent-brand-public-login-owner-access-${width}`);
    await page.close();
  }
  const member = await pageFor();
  await member.goto(preview.base + '/qa-login/member');
  await ready(member);
  assert.ok(await member.locator('.pilot-dashboard').count());
  await member.getByRole('button',{name:'Manter no celular',exact:true}).click();
  await member.locator('dialog.storage-onboarding').waitFor({state:'detached'});
  for(let i=0;i<2;i++) await member.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:2000}).catch(()=>{});
  await member.screenshot({path:'outputs/logo-transition/community-desktop.png'});
  // The server changes session community and the next document waits for its own data.
  await member.locator('.pilot-user-menu > summary').click();
  await member.locator('.pilot-user-community-switcher > summary').click();
  member.on('dialog',dialog=>dialog.accept());
  await member.route('**/api/pilot/comunidade-ativa',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha de teste na troca'})}));
  await member.locator('.pilot-user-community-switcher button:not([disabled])').first().click();
  await ready(member);
  assert.ok(await member.locator('.community-brand-trigger').innerText().then(t=>t.includes('Comunidade Logo QA 1')));
  assert.equal(await member.locator('#main-content').evaluate(el=>el.inert),false);
  results.push('failed-community-switch-releases-the-current-page');
  await member.unroute('**/api/pilot/comunidade-ativa');
  await member.locator('.pilot-user-community-switcher button:not([disabled])').first().click();
  await member.waitForURL('**/painel?view=inicio');
  await ready(member);
  assert.ok(await member.locator('.community-brand-trigger').innerText().then(t=>t.includes('Comunidade Logo QA 2')));
  results.push('real-session-community-switch');
  await member.close();

  for (const width of [1864,390]) {
    const owner = await pageFor({viewport:{width,height:1000}});
    await owner.goto(preview.base+'/qa-login/owner');
    await ready(owner);
    assert.ok(await owner.locator('.owner-console').count());
    assert.ok(await owner.locator('[data-vinkulo-logo]').evaluateAll(els=>els.some(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight;})));
    await owner.screenshot({path:`outputs/logo-transition/owner-${width}.png`});
    results.push(`owner-console-visible-destination-${width}`);
    await owner.close();
  }
  const reduced = await pageFor({ reducedMotion:'reduce',viewport:{width:390,height:844} });
  await reduced.goto(preview.base+'/login');
  await reduced.waitForFunction(()=>document.querySelector('.platform-loading-transition')?.dataset.phase==='revealing');
  assert.equal(await reduced.locator('.platform-loading-symbol').evaluate(el=>el.getAnimations().length),0);
  assert.equal(await reduced.locator('.vinkulo-animated-mark').evaluate(el=>el.getAnimations({subtree:true}).length),0);
  await ready(reduced);
  results.push('reduced-motion-without-flight');
  await reduced.close();
  const noJs = await pageFor({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await noJs.goto(preview.base+'/login');
  assert.equal(await noJs.locator('.platform-loading-transition').isVisible(),false);
  assert.equal(await noJs.getByRole('button',{name:'Entrar',exact:true}).isVisible(),true);
  results.push('login-remains-visible-with-javascript-disabled');
  await noJs.close();
  assert.deepEqual(errors,[]);
} finally {
  await fs.writeFile('outputs/logo-transition/results.json',JSON.stringify({results,errors},null,2));
  await browser.close();
  await preview.close();
}
console.log(JSON.stringify({results,errors},null,2));
