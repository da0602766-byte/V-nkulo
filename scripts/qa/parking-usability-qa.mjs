
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PARKING_QA_PLAYWRIGHT_MODULE || 'playwright');
const root='outputs/parking-review-v2';
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Sao_Paulo'});
const page=await context.newPage();page.setDefaultTimeout(12000);
const shots=[],errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
async function login(role){
 await page.goto('http://localhost:4178/qa-login/'+role);
 await page.locator('.parking-redesign').waitFor();
 await page.getByRole('button',{name:'Manter no celular',exact:true}).click({timeout:2000}).catch(()=>{});
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Pular introdução',exact:true}).click({timeout:2000}).catch(()=>{});
}
async function shot(file,title,selector){
 if(selector)await page.locator(selector).evaluate(el=>el.scrollIntoView({block:'start'}));
 else await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({animations:'disabled',path:root+'/'+file+'.png'});
 shots.push({file:file+'.png',title});
 const size=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
 assert.ok(size.content<=size.width+1,JSON.stringify({title,...size}));
}
try {
 await login('member');
 assert.equal(await page.locator('.parking-v2-map').count(),0);
 checks.push('Nenhuma disponibilidade apresentada antes da escolha da atividade');
 await shot('membro-inicio-desktop','Membro · início e orientação');
 await page.locator('.parking-v4-guide summary').click();
 await shot('membro-guia-desktop','Membro · como funciona a reserva');
 await page.locator('.parking-v4-guide summary').click();
 await page.locator('.parking-v2-context-bar select').selectOption({index:1});
 await page.locator('.parking-v2-space.available').first().click();
 await shot('membro-mapa-desktop','Membro · escolha da vaga','.parking-v2-map-heading');
 const form=page.locator('.parking-v2-booking form');
 await form.getByLabel('Placa',{exact:true}).fill('ABC1D23');
 await form.getByLabel('Marca e modelo',{exact:true}).fill('Honda Civic');
 await form.getByLabel('Cor',{exact:true}).fill('Prata');
 await form.getByLabel('Celular',{exact:true}).fill('47999998888');
 await page.locator('.parking-v2-booking-action').screenshot({animations:'disabled',path:root+'/membro-resumo-desktop.png'});
 shots.push({file:'membro-resumo-desktop.png',title:'Membro · resumo antes do envio'});
 await shot('membro-reservas-desktop','Membro · próximo passo de cada reserva','#parking-my-reservations');
 await page.locator('.parking-v2-booking').screenshot({animations:'disabled',path:root+'/membro-revisao-desktop.png'});
 shots.push({file:'membro-revisao-desktop.png',title:'Membro · formulário da solicitação'});
 await page.setViewportSize({width:390,height:900});
 await shot('membro-mapa-celular','Membro · mapa no celular','.parking-v2-map-heading');
 await page.locator('.parking-v2-booking').screenshot({animations:'disabled',path:root+'/membro-revisao-celular.png'});
 shots.push({file:'membro-revisao-celular.png',title:'Membro · formulário no celular'});
 await page.locator('.parking-v2-booking-action').screenshot({animations:'disabled',path:root+'/membro-resumo-celular.png'});
 shots.push({file:'membro-resumo-celular.png',title:'Membro · resumo no celular'});
 await shot('membro-reservas-celular','Membro · aprovação e comprovantes','#parking-my-reservations');
 await shot('membro-garagem-celular','Membro · garagem neste aparelho','#parking-my-garage');
 await page.locator('.parking-v2-context-bar select').selectOption('');
 await shot('membro-inicio-celular','Membro · início no celular');
 await login('manager');
 const areas=[['visao','Vagas'],['reservas','Reservas'],['entradas','Entradas e saídas'],['historico','Histórico'],['ocorrencias','Ocorrências'],['relatorios','Relatórios'],['mapa','Mapa e vagas'],['equipe','Equipe e configuração']];
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const [id,label] of areas){
   if(width<760)await page.getByRole('combobox',{name:'Área de trabalho',exact:true}).selectOption(id);
   else await page.getByRole('navigation',{name:'Seções da gestão',exact:true}).getByRole('button',{name:label,exact:true}).click();
   await page.locator('.parking-v3-section-heading h2').filter({hasText:label}).waitFor();
   if(id==='historico')await page.getByText('Atualizando histórico…',{exact:true}).waitFor({state:'hidden'});
   if(['historico','ocorrencias','relatorios','mapa','equipe'].includes(id))assert.equal(await page.locator('.parking-v2-context-bar').count(),0);
   await shot('gestao-'+id+'-'+(width<760?'celular':'desktop'),'Gestão · '+label+' · '+(width<760?'celular':'computador'));
  }
 }
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1100});
  if(width<760)await page.getByRole('combobox',{name:'Área de trabalho',exact:true}).selectOption('visao');
  else await page.getByRole('navigation',{name:'Seções da gestão',exact:true}).getByRole('button',{name:'Vagas',exact:true}).click();
  if(width<760)await page.getByRole('button',{name:'Buscar e filtrar',exact:true}).click();
  await page.locator('.parking-v2-filters input').fill('FILTRO-ANTIGO-QA');
  if(width<760)await page.getByRole('button',{name:/^Ocultar filtros/}).click();
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pilot/estacionamento/reservas' && new URL(r.url()).searchParams.get('status')==='PENDENTE');
  await page.getByRole('button',{name:'Analisar solicitações',exact:true}).click();
  const pendingResponse=await pending;
  assert.equal(new URL(pendingResponse.url()).searchParams.get('q'),'');
  await page.waitForFunction(()=>[...document.querySelectorAll('.parking-v2-data-table tbody tr')].length>0 && [...document.querySelectorAll('.parking-v2-data-table tbody tr')].every(row=>row.textContent.includes('Aguardando aprovação')));
  assert.equal(await page.getByRole('group',{name:'Filtrar fila de reservas'}).getByRole('button',{name:'Aguardando aprovação',exact:true}).getAttribute('aria-pressed'),'true');
  await shot('gestao-pendentes-'+(width<760?'celular':'desktop'),'Gestão · fila de solicitações · '+(width<760?'celular':'computador'),width<760?'.parking-v4-queue':undefined);
  const approved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pilot/estacionamento/reservas' && new URL(r.url()).searchParams.get('status')==='CONFIRMADA');
  await page.getByRole('group',{name:'Filtrar fila de reservas'}).getByRole('button',{name:'Aprovadas',exact:true}).click();
  await approved;
  await page.waitForFunction(()=>[...document.querySelectorAll('.parking-v2-data-table tbody tr')].length>0 && [...document.querySelectorAll('.parking-v2-data-table tbody tr')].every(row=>row.textContent.includes('Aprovada')));
  await shot('gestao-aprovadas-'+(width<760?'celular':'desktop'),'Gestão · reservas aprovadas · '+(width<760?'celular':'computador'),width<760?'.parking-v4-queue':undefined);
 }
 checks.push('Atalho de pendências limpa buscas anteriores; filas de pendentes e aprovadas consultam o servidor corretamente');
 await page.setViewportSize({width:320,height:900});
 await page.getByRole('combobox',{name:'Área de trabalho',exact:true}).selectOption('visao');
 await page.getByRole('button',{name:'Buscar e filtrar',exact:true}).click();
 await page.locator('.parking-v2-filters input').fill('NENHUMA-VAGA-QA');
 await page.getByText('Nenhuma vaga encontrada para estes filtros.',{exact:true}).waitFor();
 await shot('gestao-filtros-320','Gestão · filtros em tela de 320 px','.parking-v3-filter-panel');
 const labels=await page.locator('.parking-v2-filters select').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
 assert.ok(labels.every(width=>width>=240));
 checks.push('Filtros de vagas sem resultados e com campos legíveis em 320 px');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 await page.getByRole('combobox',{name:'Área de trabalho',exact:true}).selectOption('entradas');
 await page.getByRole('textbox',{name:'Buscar veículo para saída',exact:true}).fill('NAOEXISTEQA');
 await page.getByText('Nenhum veículo corresponde à busca. Tente parte da placa ou o nome.',{exact:true}).waitFor();
 checks.push('Busca de veículo para saída com estado vazio explícito');
 await page.setViewportSize({width:390,height:900});
 await page.getByRole('combobox',{name:'Área de trabalho',exact:true}).selectOption('reservas');
 await page.evaluate(()=>{localStorage.setItem('vinkulo-theme','ESCURO');window.dispatchEvent(new StorageEvent('storage',{key:'vinkulo-theme',newValue:'ESCURO'}));});
 await shot('gestao-reservas-escuro','Gestão · reservas no tema escuro');
 assert.equal(errors.length,0,errors.join('\n'));
 checks.push('Todas as oito áreas da gestão verificadas no computador e no celular');
 const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estacionamento · revisão para aprovação</title><style>body{margin:0;background:#f3f1f8;color:#251e38;font:16px/1.55 system-ui}main{max-width:1300px;margin:auto;padding:32px 20px}h1{font-size:30px;margin-bottom:8px}header{max-width:850px;margin-bottom:30px}.badge{display:inline-block;background:#ede3ff;border:1px solid #bca8e2;border-radius:20px;padding:6px 12px;font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:20px}figure{margin:0;background:white;border:1px solid #d9d1e7;border-radius:12px;overflow:hidden}img{width:100%;height:300px;object-fit:contain;object-position:top;background:#e9e5ee;display:block}figcaption{padding:14px;font-weight:600}a{color:inherit}li{margin:8px 0}</style><main><header><span class="badge">Prévia local · aguardando sua confirmação</span><h1>Estacionamento: telas revisadas</h1><p>Capturas reais da aplicação com dados fictícios. Clique em uma imagem para abrir em tamanho original. Esta revisão ainda não foi publicada.</p><ul><li>Próximo passo explicado em cada reserva do membro.</li><li>Guia curto de solicitação, aprovação e entrada.</li><li>Resumo com atividade, vaga, veículo e período antes do envio.</li><li>Reservas pessoais de todas as atividades, independentes do mapa.</li><li>Atalhos da operação e filtros rápidos de pendentes/aprovadas.</li><li>Atividade visível na listagem e ação Aprovar destacada.</li></ul></header><div class="grid">'+shots.map(s=>'<figure><a href="'+s.file+'" target="_blank"><img loading="lazy" src="'+s.file+'" alt="'+s.title+'"></a><figcaption>'+s.title+'</figcaption></figure>').join('')+'</div><p>Publicação somente após sua confirmação. Câmera e APK físicos não foram ensaiados nesta revisão.</p></main></html>';
 await fs.writeFile(root+'/avaliacao.html',html);
 await fs.writeFile(root+'/resultados.json',JSON.stringify({shots,checks,errors},null,2));
 console.log(JSON.stringify({screenshots:shots.length,checks,errors},null,2));
} finally {await browser.close();}
