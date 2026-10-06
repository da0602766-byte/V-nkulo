const { chromium } = await import(process.env.PARKING_QA_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('outputs/parking',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
async function open(role,width){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:'light',timezoneId:'America/Sao_Paulo'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>results.push({role,pageError:e.message}));
 page.on('dialog',d=>d.accept());
 await page.goto('http://localhost:4178/qa-login/'+role);
 await page.locator('.parking-redesign').waitFor();
 await page.getByText('Manter no celular',{exact:true}).click({timeout:2500}).catch(()=>{});
 for (let intro=0;intro<2;intro++) await page.getByText('Pular introdução',{exact:true}).click({timeout:3500}).catch(()=>{});
 await page.locator('.parking-v2-context-bar select').selectOption({index:1});
 await page.waitForTimeout(400);
 return {context,page};
}
const member=await open('member',390);
await member.page.locator('.parking-v2-space.available').first().click();
for(const theme of ['CLARO','ESCURO']){
 await member.page.evaluate(theme=>{localStorage.setItem('vinkulo-theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'vinkulo-theme',newValue:theme}));},theme);
 for(const width of [320,390,430,768,1024,1440]){
  await member.page.setViewportSize({width,height:900});await member.page.evaluate(()=>scrollTo(0,0));
  await member.page.waitForTimeout(100);
  const layout=await member.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,slot:(()=>{const r=document.querySelector('.parking-v2-space').getBoundingClientRect();return {width:r.width,height:r.height};})()}));
  results.push({role:'member',theme,width,...layout});
  await member.page.screenshot({path:`outputs/parking/member-${width}-${theme.toLowerCase()}.png`});
 }
}
await member.page.setViewportSize({width:390,height:900});
await member.page.locator('.parking-v2-booking').scrollIntoViewIfNeeded();
await member.page.screenshot({path:'outputs/parking/member-review-dark.png'});
const form=member.page.locator('.parking-v2-booking form');
await form.getByLabel('Celular',{exact:true}).fill('47999998888');
await form.getByLabel('Placa',{exact:true}).fill('QAQ9Z99');
await form.getByLabel('Marca e modelo',{exact:true}).fill('Veículo QA');
await form.getByLabel('Cor',{exact:true}).fill('Azul');
await form.getByRole('button',{name:/Solicitar vaga/}).click();
await member.page.getByText('Solicitação enviada',{exact:true}).waitFor();
results.push({flow:'member-reservation',result:'persisted-pending'});
const manager=await open('manager',1440);
await manager.page.getByRole('button',{name:'Reservas',exact:true}).click();
for(const theme of ['CLARO','ESCURO']){
 await manager.page.evaluate(theme=>{localStorage.setItem('vinkulo-theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'vinkulo-theme',newValue:theme}));},theme);
 for(const width of [320,390,430,768,1024,1440]){
  await manager.page.setViewportSize({width,height:1000});await manager.page.evaluate(()=>scrollTo(0,0));await manager.page.waitForTimeout(100);
  const layout=await manager.page.evaluate(()=>{const table=document.querySelector('.parking-v2-data-table'),wrapper=table.parentElement;return {width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,mobileTableClipped:innerWidth<=760 && table.getBoundingClientRect().width>wrapper.getBoundingClientRect().width+1};});
  results.push({role:'manager',theme,width,...layout});await manager.page.screenshot({path:`outputs/parking/manager-${width}-${theme.toLowerCase()}.png`});
 }
}
await manager.page.locator('.parking-v2-filters input').fill('QAQ9Z99');await manager.page.waitForTimeout(400);
const row=manager.page.locator('.parking-v2-data-table tbody tr').filter({hasText:'QAQ9Z99'});
await row.getByRole('button',{name:'Aprovar',exact:true}).click();
await row.getByRole('button',{name:'Registrar entrada',exact:true}).waitFor();
await row.getByRole('button',{name:'Registrar entrada',exact:true}).click();
await row.getByText('No local',{exact:true}).waitFor();
results.push({flow:'manager-approval-entry',result:'persisted'});
await manager.page.getByRole('button',{name:'Entradas e saídas',exact:true}).click();
await manager.page.locator('.gestao-simple-list article').filter({hasText:'QAQ9Z99'}).getByRole('button',{name:'Registrar saída',exact:true}).click();
await manager.page.getByText('Saída registrada e vaga liberada.',{exact:true}).waitFor();
results.push({flow:'manager-exit',result:'persisted'});
// Network errors and empty filters are visibly distinguished.
await manager.page.getByRole('button',{name:'Reservas',exact:true}).click();
await manager.page.locator('.parking-v2-filters input').fill('SEM-RESULTADO-QA');await manager.page.getByText('Nenhuma reserva encontrada para estes filtros.',{exact:true}).waitFor();
await manager.page.screenshot({path:'outputs/parking/manager-empty.png'});
await member.context.setOffline(true);await member.page.waitForTimeout(200);await member.page.evaluate(()=>scrollTo(0,0));
await member.page.screenshot({path:'outputs/parking/member-offline.png'});
results.push({flow:'offline',visible:await member.page.getByText('Você está sem conexão',{exact:true}).isVisible()});
await member.context.setOffline(false);
await fs.writeFile('outputs/parking/visual-results.json',JSON.stringify(results,null,2));
const overflow=results.filter(r=>r.scroll>r.width+1);console.log(JSON.stringify({cases:results.length,overflow,pageErrors:results.filter(r=>r.pageError),flows:results.filter(r=>r.flow)},null,2));
await browser.close();
assert.equal(overflow.length,0,'Page overflow in QA matrix');
assert.equal(results.filter(r=>r.mobileTableClipped).length,0,'Clipped columns in mobile table');
assert.equal(results.filter(r=>r.pageError).length,0,'JavaScript errors in QA matrix');
