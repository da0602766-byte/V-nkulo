// All messages and posts in this QA belong to the isolated in-memory preview.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { startLogoPreview } from "./logo-transition-preview.mjs";
const { chromium } = await import(process.env.VINKULO_PLAYWRIGHT_MODULE || "playwright");
const preview = await startLogoPreview(4188);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1864, height: 1000 } });
const results = [], errors = [];
page.on("pageerror", e => errors.push(e.message));
await fs.mkdir("outputs/brand-actions", { recursive: true });
async function ready() {
  await page.waitForFunction(() => document.querySelector('.platform-loading-transition')?.dataset.phase === 'idle');
}
async function localOnly() {
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-logo-transition')), false, 'an action must not activate a page loader');
}
async function hold(pattern, method = 'POST') {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const active = new Set();
  const handler = route => {
    const task = (async () => { if (route.request().method() === method) await gate; await route.continue(); })();
    active.add(task);
    return task.finally(() => active.delete(task));
  };
  await page.route(pattern, handler);
  return async () => { release(); await Promise.all([...active]); await page.unroute(pattern, handler); };
}
async function capture(name) {
  for (const width of [1864,768,390]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    const controls=await page.locator('button.vinkulo-brand-action').evaluateAll(els=>els.map(el=>el.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({width:r.width,height:r.height})));
    assert.ok(controls.every(r=>r.width>=43.9&&r.height>=43.9),JSON.stringify({name,width,controls}));
    await page.screenshot({path:`outputs/brand-actions/${name}-${width}.png`});
  }
  await page.setViewportSize({width:1864,height:1000});
}
try {
  await page.goto(preview.base+'/qa-login/member');await ready();
  await page.getByRole('button',{name:'Manter no celular',exact:true}).click();
  await page.locator('dialog.storage-onboarding').waitFor({state:'detached'});
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:1000}).catch(()=>{});
  await page.goto(preview.base+'/painel?view=mensagens');await ready();
  await page.locator('.private-chat-people button').first().click();
  const field=page.getByRole('textbox',{name:'Mensagem',exact:true});
  await field.waitFor();
  const releaseChat=await hold('**/api/pilot/chat');
  await field.fill('Mensagem sintética de QA da marca Vínkulo');
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await page.locator('.private-chat-thread form .vinkulo-action-mark[data-state="pending"]').waitFor();
  await localOnly();
  assert.ok(await page.locator('.private-chat-thread form .vinkulo-mark-draw').evaluate(el=>el.getAnimations().length>0));
  await capture('chat-enviando');
  await releaseChat();
  await page.locator('.private-chat-thread form .vinkulo-action-mark[data-state="success"]').waitFor();
  await page.screenshot({path:'outputs/brand-actions/chat-confirmado.png'});
  results.push('chat-local-pending-and-server-confirmed-success-three-widths');
  await page.route('**/api/pilot/chat',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha simulada de envio'})}):route.continue());
  await field.fill('Mensagem de QA para testar falha e reenvio');
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await page.locator('.private-chat-thread form .vinkulo-action-mark[data-state="error"]').waitFor();
  assert.equal(await page.locator('.private-chat-thread form .vinkulo-action-mark[data-state="success"]').count(),0);
  await page.unroute('**/api/pilot/chat');
  await page.getByRole('button',{name:'Falha ao enviar · toque para reenviar'}).click();
  await page.locator('.private-chat-thread form .vinkulo-action-mark[data-state="success"]').waitFor();
  results.push('chat-failure-without-false-success-and-retry');

  await page.goto(preview.base+'/painel?view=inicio');await ready();
  await page.getByRole('button',{name:'O que você quer compartilhar?',exact:true}).click();
  await page.getByRole('textbox',{name:'Título da publicação',exact:true}).fill('Publicação sintética da identidade V');
  const composer=page.locator('#community-publication-form');
  await composer.locator('textarea[name="conteudo"]').fill('Conteúdo criado somente no banco de testes para verificar a marca animada.');
  const releasePost=await hold('**/api/pilot/publicacoes');
  await composer.getByRole('button',{name:'Salvar publicação',exact:true}).click();
  await composer.locator('.vinkulo-action-mark[data-state="pending"]').waitFor();
  assert.ok(await composer.locator('button.vinkulo-brand-action').evaluate(el=>getComputedStyle(el).backgroundImage.includes('linear-gradient')));
  await localOnly();
  await capture('feed-publicando');
  await releasePost();
  await page.locator('.app-toast-card.is-success .vinkulo-action-mark[data-state="success"]').waitFor();
  assert.equal(await page.locator('.app-toast-symbol').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  results.push('feed-publish-pending-and-branded-success-toast');
  const post=page.locator('.worship-post').filter({hasText:'Publicação sintética da identidade V'}).first();
  await post.waitFor();
  await post.locator('.community-comments-toggle').click();
  await post.locator('textarea[name="texto"]').fill('Comentário sintético para conferir a animação.');
  const releaseComment=await hold('**/api/pilot/publicacoes/*/comentarios');
  await post.getByRole('button',{name:'Enviar comentário',exact:true}).click();
  await post.locator('.community-comment-form .vinkulo-action-mark[data-state="pending"]').waitFor();
  await localOnly();
  await page.screenshot({path:'outputs/brand-actions/comentario-enviando.png'});
  await releaseComment();
  await post.locator('.community-comment-form .vinkulo-action-mark[data-state="success"]').waitFor();
  results.push('comment-pending-and-server-confirmed-success');
  await page.route('**/api/pilot/publicacoes/*/comentarios',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Leitura de comentários indisponível'})}):route.continue());
  await post.locator('textarea[name="texto"]').fill('Comentário aceito antes da falha de leitura.');
  await post.getByRole('button',{name:'Enviar comentário',exact:true}).click();
  await post.getByRole('alert').waitFor();
  assert.equal(await post.locator('.community-comment[data-pending="true"]').count(),0);
  assert.ok(await post.innerText().then(text=>text.includes('Comentário aceito antes da falha de leitura.')));
  await page.unroute('**/api/pilot/publicacoes/*/comentarios');
  results.push('acknowledged-comment-stops-pending-even-if-follow-up-read-fails');

  await post.getByRole('button',{name:'Abrir ações da publicação'}).click();
  await page.getByRole('button',{name:'Ocultar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Ocultar publicação?',exact:true});
  await dialog.waitFor();
  assert.equal(await dialog.locator('.vinkulo-action-mark').getAttribute('data-state'),'idle');
  await capture('confirmacao');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await post.count(),1);
  await post.getByRole('button',{name:'Abrir ações da publicação'}).click();
  await page.getByRole('button',{name:'Ocultar',exact:true}).click();
  await page.route('**/api/pilot/publicacoes/*',route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha de confirmação simulada'})}):route.continue());
  await dialog.getByRole('button',{name:'Ocultar publicação',exact:true}).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.locator('.vinkulo-action-mark').getAttribute('data-state'),'error');
  assert.equal(await post.count(),1);
  await page.unroute('**/api/pilot/publicacoes/*');
  results.push('failed-confirmation-retains-the-dialog-and-original-post');
  const releaseConfirm=await hold('**/api/pilot/publicacoes/*','PATCH');
  await dialog.getByRole('button',{name:'Ocultar publicação',exact:true}).click();
  await dialog.locator('.vinkulo-action-mark[data-state="pending"]').waitFor();
  await localOnly();
  await page.screenshot({path:'outputs/brand-actions/confirmacao-processando.png'});
  await releaseConfirm();
  await dialog.waitFor({state:'detached'});
  await page.locator('.app-toast-card.is-success .vinkulo-action-mark[data-state="success"]').waitFor();
  results.push('confirmation-cancel-safe-and-pending-until-server-three-widths');
  await page.getByRole('button',{name:'Fazer um pedido',exact:true}).click();
  const prayer=page.getByRole('dialog',{name:'Pedido de oração',exact:true});
  await prayer.getByLabel('Assunto',{exact:true}).fill('Pedido sintético da marca');
  await prayer.getByLabel('Seu pedido de oração',{exact:true}).fill('Texto sintético privado para conferir o envio do pedido.');
  const releasePrayer=await hold('**/api/pilot/solicitacoes');
  await prayer.getByRole('button',{name:'Enviar pedido',exact:true}).click();
  await prayer.locator('.feed-prayer-form .vinkulo-action-mark[data-state="pending"]').waitFor();
  await localOnly();
  await page.screenshot({path:'outputs/brand-actions/oracao-enviando.png'});
  await releasePrayer();
  await prayer.waitFor({state:'detached'});
  await page.locator('.feed-prayer .vinkulo-action-status .vinkulo-action-mark[data-state="success"]').waitFor();
  results.push('private-prayer-request-has-local-pending-and-server-confirmed-success');
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.dataset.pilotTheme='escuro';});
  await page.screenshot({path:'outputs/brand-actions/feedback-escuro.png'});
  results.push('brand-signature-on-dark-community-surfaces');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.feed-prayer .vinkulo-action-mark').first().evaluate(el=>el.getAnimations({subtree:true}).length),0);
  results.push('reduced-motion-keeps-feedback-readable-without-animation');
  assert.deepEqual(errors,[]);
} finally {
  await fs.writeFile('outputs/brand-actions/results.json',JSON.stringify({results,errors},null,2));
  await browser.close();await preview.close();
}
console.log(JSON.stringify({results,errors},null,2));
