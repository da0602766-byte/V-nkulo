
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PARKING_QA_PLAYWRIGHT_MODULE || 'playwright');
const root='outputs/parking-review';
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
 await page.locator('.parking-v2-context-bar select').selectOption({index:1});
 await page.locator('.parking-v2-space.available').first().click();
 await shot('membro-mapa-desktop','Membro · escolha da vaga','.parking-v2-map-heading');
 await page.locator('.parking-v2-booking').screenshot({animations:'disabled',path:root+'/membro-revisao-desktop.png'});
 shots.push({file:'membro-revisao-desktop.png',title:'Membro · formulário da solicitação'});
 await page.setViewportSize({width:390,height:900});
 await shot('membro-mapa-celular','Membro · mapa no celular','.parking-v2-map-heading');
 await page.locator('.parking-v2-booking').screenshot({animations:'disabled',path:root+'/membro-revisao-celular.png'});
 shots.push({file:'membro-revisao-celular.png',title:'Membro · formulário no celular'});
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
 const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estacionamento · revisão para aprovação</title><style>body{margin:0;background:#f3f1f8;color:#251e38;font:16px/1.55 system-ui}main{max-width:1300px;margin:auto;padding:32px 20px}h1{font-size:30px;margin-bottom:8px}header{max-width:850px;margin-bottom:30px}.badge{display:inline-block;background:#ede3ff;border:1px solid #bca8e2;border-radius:20px;padding:6px 12px;font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:20px}figure{margin:0;background:white;border:1px solid #d9d1e7;border-radius:12px;overflow:hidden}img{width:100%;height:300px;object-fit:contain;object-position:top;background:#e9e5ee;display:block}figcaption{padding:14px;font-weight:600}a{color:inherit}li{margin:8px 0}</style><main><header><span class="badge">Prévia local · aguardando sua confirmação</span><h1>Estacionamento: telas revisadas</h1><p>Capturas reais da aplicação com dados fictícios. Clique em uma imagem para abrir em tamanho original. Esta revisão ainda não foi publicada.</p><ul><li>Atividade obrigatória antes de apresentar a disponibilidade.</li><li>Solicitação, aprovação e comprovante explicados em etapas.</li><li>Formulário com CPF da conta e horários mais claros.</li><li>Menu compacto e filtros recolhíveis no celular.</li><li>Busca para registrar saídas e explicações de cada área da gestão.</li></ul></header><div class="grid">'+shots.map(s=>'<figure><a href="'+s.file+'" target="_blank"><img loading="lazy" src="'+s.file+'" alt="'+s.title+'"></a><figcaption>'+s.title+'</figcaption></figure>').join('')+'</div><p>Publicação somente após sua confirmação. Câmera e APK físicos não foram ensaiados nesta revisão.</p></main></html>';
 await fs.writeFile(root+'/avaliacao.html',html);
 await fs.writeFile(root+'/resultados.json',JSON.stringify({shots,checks,errors},null,2));
 console.log(JSON.stringify({screenshots:shots.length,checks,errors},null,2));
} finally {await browser.close();}
