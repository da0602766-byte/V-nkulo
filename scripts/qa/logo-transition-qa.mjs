import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { startLogoPreview } from "./logo-transition-preview.mjs";
const { chromium } = await import(process.env.VINKULO_PLAYWRIGHT_MODULE || "playwright");
const preview = await startLogoPreview();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [], errors = [];
await fs.mkdir("outputs/logo-transition", { recursive: true });
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.logoController === 'ready' && document.querySelector('.platform-loading-transition')?.dataset.phase === 'idle', null, { timeout: 20000 });
}
async function pageFor(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1864, height: 1000 }, ...options });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => {
    if (message.type() !== 'error') return;
    const expectedFailure = /\/api\/(pilot\/comunidade-ativa|auth\/login)$/.test(message.location().url)
      && /\b(401|503)\b/.test(message.text());
    if (!expectedFailure) errors.push(`${message.location().url} ${message.text()}`);
  });
  return page;
}
const waitPhase = (page, phase) => page.waitForFunction(expected => document.querySelector('.platform-loading-transition')?.dataset.phase === expected, phase);
try {
  // Deterministic clock exercises the real controller and server-rendered overlay.
  const fixture = await pageFor();
  await fixture.clock.install();
  await fixture.goto(preview.base + "/qa-fixture?pending");
  await fixture.waitForFunction(() => document.documentElement.dataset.logoController === 'ready');
  await fixture.clock.fastForward(5000);
  assert.equal(await fixture.locator('.platform-loading-transition').getAttribute('data-phase'), 'waiting');
  assert.equal(await fixture.locator('.platform-loading-symbol .vinkulo-mark-draw').evaluate(el => getComputedStyle(el).clipPath), 'none');
  assert.equal(await fixture.locator('.platform-loading-symbol .vinkulo-mark-draw').getAttribute('src'), '/vinkulo-symbol-v2.png');
  assert.equal(await fixture.locator('.vinkulo-animated-mark').evaluate(el => el.getAnimations().find(a => a.animationName === 'vinkulo-logo-breathe')?.effect.getTiming().duration), 2300);
  assert.ok(await fixture.locator('.vinkulo-mark-shine').evaluate(el=>getComputedStyle(el).maskImage.includes('vinkulo-symbol-v2.png')));
  assert.equal(await fixture.locator('.platform-loading-backdrop').evaluate(el => getComputedStyle(el).backgroundImage.includes('rgb(37, 22, 55)')), true);
  assert.equal(await fixture.locator('.platform-loading-transition').evaluate(el => getComputedStyle(el, '::before').borderRadius), '50%');
  await fixture.screenshot({path:'outputs/logo-transition/loading-desktop.png'});
  results.push('slow-loading-holds-an-unclipped-mark-with-a-subtle-pulse-and-masked-glint');
  await fixture.evaluate(() => document.querySelector('[data-vinkulo-loading]').remove());
  await fixture.clock.runFor(50);
  await ready(fixture);
  assert.equal(await fixture.locator('#main-content').evaluate(el => el.inert), false);

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

  for (const [width, colorScheme] of [[390, 'dark'], [768, 'light'], [1864, 'dark']]) {
    const motion = await pageFor({viewport:{width,height:844},colorScheme});
    const fly = width !== 768;
    await motion.goto(preview.base + '/qa-fixture?pending' + (fly ? '' : '&no-flight'));
    await waitPhase(motion, 'waiting');
    const entry = await motion.locator('.platform-loading-symbol').evaluate(el => ({
      width: el.offsetWidth,
      animation: el.getAnimations().map(a => a.effect.getTiming().duration),
    }));
    assert.deepEqual(entry.animation, [440, 360]);
    assert.equal(entry.width, Math.round(Math.min(250, Math.max(156, width * .24))));
    await motion.evaluate(() => {
      window.visualEnd = false;
      document.querySelector('#main-content').addEventListener('animationend', () => { window.visualEnd = true; }, {once:true});
      const overlay = document.querySelector('.platform-loading-transition');
      const readyAt = performance.now();
      const observer = new MutationObserver(() => {
        if (overlay.dataset.phase === 'revealing') window.readyToReveal = performance.now() - readyAt;
        if (overlay.dataset.phase === 'idle') observer.disconnect();
      });
      observer.observe(overlay, {attributes:true, attributeFilter:['data-phase']});
      document.querySelector('[data-vinkulo-loading]').remove();
    });
    await waitPhase(motion, 'revealing');
    const visual = await motion.evaluate(() => ({
      duration: document.querySelector('.platform-loading-symbol').getAnimations()[0]?.effect.getTiming().duration,
      destination: document.querySelectorAll('[data-vinkulo-destination]').length,
      reveal: document.querySelector('#main-content').getAnimations()[0]?.effect.getTiming().duration,
      pulse: getComputedStyle(document.querySelector('.vinkulo-animated-mark')).animationName,
      inert: document.querySelector('#main-content').inert,
      readyToReveal: window.readyToReveal,
    }));
    assert.equal(visual.duration, 560);
    assert.equal(visual.destination, fly ? 1 : 0);
    assert.equal(visual.reveal, 640);
    assert.equal(visual.pulse, 'vinkulo-pulse-settle');
    assert.equal(visual.inert, true);
    assert.ok(visual.readyToReveal < 300, `The reveal began ${visual.readyToReveal}ms after readiness`);
    await motion.screenshot({path:`outputs/logo-transition/revealing-${width}-${colorScheme}.png`});
    await ready(motion);
    assert.deepEqual(await motion.evaluate(() => ({
      ended: window.visualEnd,
      destination: document.querySelectorAll('[data-vinkulo-destination]').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      locked: document.querySelector('#main-content').inert || document.documentElement.hasAttribute('data-logo-transition'),
    })), {ended:true,destination:0,horizontalOverflow:false,locked:false});
    await motion.locator('#focus').click();
    results.push(`fast-real-reveal-${width}-${colorScheme}-${fly ? 'flight' : 'center'}`);
    await motion.close();
  }

  const interrupted = await pageFor();
  await interrupted.goto(preview.base + '/qa-fixture?pending');
  await waitPhase(interrupted, 'waiting');
  await interrupted.evaluate(() => document.querySelector('[data-vinkulo-loading]').remove());
  await waitPhase(interrupted, 'revealing');
  await interrupted.evaluate(() => {
    const late = document.createElement('div');
    late.dataset.vinkuloContentLoading = 'true';
    document.querySelector('#main-content').append(late);
  });
  await waitPhase(interrupted, 'waiting');
  assert.equal(await interrupted.locator('[data-vinkulo-destination]').count(), 0);
  await interrupted.waitForTimeout(700);
  assert.equal(await interrupted.locator('.platform-loading-transition').getAttribute('data-phase'), 'waiting');
  await interrupted.evaluate(() => document.querySelector('[data-vinkulo-content-loading]').remove());
  await ready(interrupted);
  await interrupted.evaluate(() => history.replaceState(history.state, '', '/qa-fixture'));
  await interrupted.locator('#native').click();
  await interrupted.waitForURL('**/login');
  await ready(interrupted);
  await interrupted.goBack();
  await ready(interrupted);
  await interrupted.locator('#focus').click();
  await interrupted.goForward();
  await ready(interrupted);
  assert.ok(interrupted.url().endsWith('/login'));
  results.push('late-readiness-cancels-the-reveal-and-browser-history-remains-interactive');
  await interrupted.close();

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
  await member.goto(preview.base + '/login');
  await ready(member);
  await member.locator('input[name="cpf"]').fill(preview.credentials.member.body.cpf);
  await member.locator('input[name="senha"]').fill('Senha incorreta');
  await member.getByRole('button',{name:'Entrar',exact:true}).click();
  await member.locator('.access-feedback[role="alert"]').waitFor();
  await ready(member);
  assert.ok(member.url().endsWith('/login'));
  await member.locator('input[name="senha"]').fill(preview.credentials.member.body.senha);
  await member.getByRole('button',{name:'Entrar',exact:true}).click();
  await member.waitForURL(url => url.pathname === '/painel');
  await ready(member);
  assert.ok(await member.locator('.pilot-dashboard').count());
  results.push('real-login-form-releases-on-error-and-reaches-the-panel-on-success');
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
  await reduced.goto(preview.base+'/qa-fixture?pending');
  await reduced.waitForFunction(()=>document.querySelector('.platform-loading-transition')?.dataset.phase==='waiting');
  assert.equal(await reduced.locator('.platform-loading-symbol').evaluate(el=>el.getAnimations().length),0);
  assert.equal(await reduced.locator('.vinkulo-animated-mark').evaluate(el=>el.getAnimations({subtree:true}).length),0);
  await reduced.evaluate(()=>document.querySelector('[data-vinkulo-loading]').remove());
  await ready(reduced);
  assert.equal(await reduced.locator('[data-vinkulo-destination]').count(),0);
  results.push('reduced-motion-keeps-a-static-mark-and-unlocks-as-soon-as-its-ready');
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
