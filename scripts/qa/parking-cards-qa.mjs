import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PARKING_QA_PLAYWRIGHT_MODULE || 'playwright');
const root='outputs/reservas-redesign';
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:900},timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[],checks=[],shots=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
async function shot(file,title,locator) {
 await locator.screenshot({path:`${root}/${file}.png`,animations:'disabled',style:'.pilot-topbar { visibility: hidden !important; }'});
 shots.push({file:`${file}.png`,title});
}
try {
 await page.goto('http://localhost:4178/qa-login/manager');
 await page.locator('.parking-redesign').waitFor();
 await page.getByRole('button',{name:'Manter no celular',exact:true}).click({timeout:1500}).catch(()=>{});
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:1500}).catch(()=>{});
 await page.locator('.parking-v3-mobile-tabs select').selectOption('reservas');
 await page.getByRole('button',{name:'Buscar e filtrar',exact:true}).click();
 await page.locator('.parking-v2-filters input').fill('QAC');
 await page.waitForFunction(()=>document.querySelectorAll('.parking-reservation-card').length===6);
 await page.getByRole('button',{name:/^Ocultar filtros/}).click();
 const closed=page.locator('.parking-reservation-card').filter({hasText:'QAC0001'});
 const pending=page.locator('.parking-reservation-card').filter({hasText:'QAC0002'});
 const approved=page.locator('.parking-reservation-card').filter({hasText:'QAC0003'});
 const present=page.locator('.parking-reservation-card').filter({hasText:'QAC0004'});
 assert.match(await closed.locator('.parking-record-status').innerText(),/✓\s*Encerrada/);
 assert.match(await present.locator('.parking-record-status').innerText(),/No local/);
 assert.equal(await closed.getByRole('button',{name:'Excluir do histórico'}).isVisible(),false);
 for(const [theme,color] of [['CLARO','claro'],['ESCURO','escuro']]) {
  await page.evaluate(theme=>{localStorage.setItem('vinkulo-theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'vinkulo-theme',newValue:theme}));},theme);
  for(const width of [320,390,430,768,1024,1440]) {
   await page.setViewportSize({width,height:1000});
   const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.parking-reservation-card')].map(el=>({width:el.clientWidth,scroll:el.scrollWidth}))}));
   assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
   assert.ok(geometry.cards.every(card=>card.scroll<=card.width+1),JSON.stringify(geometry));
   checks.push({theme,width,overflow:false});
   if(width===390) {
    await shot(`encerrada-${color}`,'Reserva encerrada · '+color,closed);
    await shot(`pendente-${color}`,'Aguardando aprovação · '+color,pending);
    await shot(`aprovada-${color}`,'Reserva aprovada · '+color,approved);
    await shot(`no-local-${color}`,'Veículo no local · '+color,present);
    await closed.locator('summary').click();
    await shot(`detalhes-${color}`,'Detalhes e ação secundária · '+color,closed);
    assert.ok(await closed.getByRole('button',{name:'Excluir do histórico'}).isVisible());
    assert.equal(await closed.locator('.parking-record-detail-content').evaluate(el=>getComputedStyle(el).animationName),'none');
    await closed.locator('summary').click();
   }
   if(width===1440)await shot(`gestao-desktop-${color}`,'Gestão de reservas · computador · '+color,page.locator('.parking-reservations'));
  }
 }
 await page.evaluate(()=>{localStorage.setItem('vinkulo-theme','CLARO');window.dispatchEvent(new StorageEvent('storage',{key:'vinkulo-theme',newValue:'CLARO'}));document.documentElement.style.zoom='2';});
 await page.setViewportSize({width:1440,height:1000});
 const zoom=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(zoom.scroll<=zoom.width+1,JSON.stringify(zoom));
 checks.push({case:'200% zoom',overflow:false});
 await page.evaluate(()=>document.documentElement.style.zoom='');
 await page.setViewportSize({width:390,height:900});
 await closed.locator('summary').focus();await page.keyboard.press('Enter');
 assert.ok(await closed.locator('details').evaluate(el=>el.open));
 await page.keyboard.press('Enter');
 assert.equal(await closed.locator('details').evaluate(el=>el.open),false);
 checks.push({case:'Keyboard details and reduced motion',passed:true});
 await page.getByRole('button',{name:'Remover filtro: Busca: QAC',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.parking-v2-filters input').value==='');
 assert.equal(await page.locator('.parking-active-filters').count(),0);
 checks.push({case:'Visible filter chip clears query',passed:true});
 // Isolate the closed example through the real search endpoint for a contextual mobile screenshot.
 await page.getByRole('button',{name:'Buscar e filtrar',exact:true}).click();
 await page.locator('.parking-v2-filters input').fill('QAC0001');
 await page.waitForFunction(()=>document.querySelectorAll('.parking-reservation-card').length===1);
 await page.getByRole('button',{name:/^Ocultar filtros/}).click();
 await page.locator('.parking-v3-filter-panel').evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`${root}/gestao-celular.png`,animations:'disabled'});
 shots.unshift({file:'gestao-celular.png',title:'Gestão no celular · reserva encerrada'});
 await closed.locator('summary').click();
 page.once('dialog',dialog=>dialog.dismiss());
 await closed.getByRole('button',{name:'Excluir do histórico'}).click();
 assert.equal(await closed.count(),1);
 checks.push({case:'Cancel deletion preserves record',passed:true});
 page.once('dialog',dialog=>dialog.accept());
 await closed.getByRole('button',{name:'Excluir do histórico'}).click();
 await page.getByText('Nenhuma reserva encontrada para estes filtros.',{exact:true}).waitFor();
 checks.push({case:'Confirmed deletion refreshes empty state',passed:true});
 assert.equal(errors.length,0,errors.join('\n'));
 await fs.writeFile(`${root}/resultados.json`,JSON.stringify({checks,errors},null,2));
 await fs.writeFile(`${root}/avaliacao.html`,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reservas · revisão visual</title><style>body{margin:0;padding:32px;background:#f3f1f8;color:#211b30;font:16px system-ui}h1{margin-bottom:8px}p{color:#62596e}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}figure{margin:0;padding:18px;background:white;border:1px solid #ddd5eb;border-radius:16px}img{width:100%;height:auto}figcaption{font-weight:600;margin-bottom:16px}figure:has(img[src*=desktop]){grid-column:1/-1}</style><h1>Reservas com leitura de gestão</h1><p>Aplicação real, dados fictícios. Status, responsável, período e movimentação separados. Clique para ampliar.</p><main>${shots.map(s=>`<figure><figcaption>${s.title}</figcaption><a href="${s.file}"><img src="${s.file}" alt="${s.title}"></a></figure>`).join('')}</main></html>`);
 console.log(JSON.stringify({checks:checks.length,screenshots:shots.length,errors},null,2));
} finally {await browser.close();}
