// Touch QA against the isolated synthetic fixture server, never production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium, devices} = await import(process.env.PARKING_QA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PARKING_QA_BASE_URL || 'http://localhost:4178';
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844},reducedMotion:'reduce'});
const page = await context.newPage();
const errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
page.setDefaultTimeout(15000);
await fs.mkdir('outputs/parking-scene',{recursive:true});
try {
  await page.goto(base+'/qa-login/manager');
  await page.locator('.parking-redesign').waitFor();
  await page.getByRole('button',{name:'Manter no celular',exact:true}).tap({timeout:10000}).catch(()=>{});
  for(let i=0;i<2;i++)await page.getByText('Pular introdução',{exact:true}).tap({timeout:1500}).catch(()=>{});
  await page.getByRole('button',{name:'Mapa e vagas',exact:true}).tap();
  const editor=page.locator('.parking-scene-editor');
  await editor.locator('canvas').waitFor();
  await editor.getByRole('button',{name:'Aumentar zoom',exact:true}).tap();
  await editor.getByRole('button',{name:'Diminuir zoom',exact:true}).tap();
  await editor.getByRole('button',{name:'Centralizar',exact:true}).tap();
  results.push({case:'mobile-touch-3d-and-zoom',passed:true});
  await editor.locator('.parking-scene-tools select').selectOption('tree');
  await editor.getByRole('button',{name:'+ Adicionar',exact:true}).tap();
  await editor.getByLabel('Nome / código').fill('Árvore toque móvel');
  await editor.getByLabel('Posição X',{exact:true}).fill('25');
  await editor.getByLabel('Posição Y',{exact:true}).fill('3');
  await editor.getByRole('button',{name:'Salvar rascunho',exact:true}).tap();
  await editor.getByText('Rascunho salvo. Os usuários continuam vendo a versão publicada.').waitFor();
  const saved=await page.request.get(base+'/api/pilot/estacionamento/cenario?editor=1').then(r=>r.json());
  assert.ok(saved.draft.objects.some(o=>o.name==='Árvore toque móvel'));
  assert.ok(!saved.published?.objects.some(o=>o.name==='Árvore toque móvel'));
  results.push({case:'mobile-edit-and-save-private-draft',passed:true});
  await editor.getByRole('button',{name:'Duplicar',exact:true}).tap();
  await editor.getByRole('button',{name:'Excluir',exact:true}).tap();
  await editor.getByRole('button',{name:'2D',exact:true}).tap();
  await editor.locator('svg[role="img"]').waitFor();
  await editor.getByRole('button',{name:'Lista',exact:true}).tap();
  await editor.locator('.parking-scene-object-list button').first().tap();
  results.push({case:'mobile-duplicate-delete-and-view-switch',passed:true});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await editor.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await editor.screenshot({path:`outputs/parking-scene/touch-${viewport.width}.png`});
  }
  // Use real browser touch events against the production renderer to cover multitouch.
  await page.setViewportSize({width:390,height:844});
  const asset=(await fs.readdir('dist/client/assets')).find(f=>/^parking-three-.*\.js$/.test(f));
  await page.evaluate(async ({asset,scene})=>{
    const {mountParkingRenderer}=await import('/assets/'+asset);
    scene.width=20;scene.depth=20;
    scene.objects=[{...scene.objects.find(o=>o.kind==='space'),id:'touch-center',x:10,y:10,rotation:0}];
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:999999';document.body.append(host);
    const q={host,moves:[],selections:[]};
    q.options={scene,selected:[],states:{},editing:true,move:false,top:false,snap:true,onSelect:id=>q.selections.push(id),onMove:(id,x,y)=>q.moves.push({id,x,y}),onError:()=>{throw Error('WebGL');}};
    q.engine=mountParkingRenderer(host,q.options);window.__touchQA=q;
  },{asset,scene:saved.draft});
  await page.waitForTimeout(200);
  await page.touchscreen.tap(195,422);
  assert.deepEqual(await page.evaluate(()=>window.__touchQA.selections),['touch-center']);
  await page.evaluate(()=>{const q=window.__touchQA;q.options.move=true;q.engine.update(q.options);});
  const cdp=await context.newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
  await touch('touchStart',[[1,195,422]]);
  await touch('touchMove',[[1,220,430]]);
  await touch('touchStart',[[1,220,430],[2,245,435]]);
  await touch('touchMove',[[1,220,430],[2,270,460]]);
  await touch('touchEnd',[[2,270,460]]);
  assert.equal(await page.evaluate(()=>window.__touchQA.moves.length),0,'second finger must not commit drag');
  await touch('touchMove',[[1,225,435]]);
  await touch('touchEnd',[[1,225,435]]);
  const moves=await page.evaluate(()=>window.__touchQA.moves);
  assert.equal(moves.length,1);assert.equal(moves[0].id,'touch-center');
  await page.evaluate(()=>{window.__touchQA.engine.dispose();window.__touchQA.host.remove();delete window.__touchQA;});
  results.push({case:'touch-select-drag-with-second-finger-guard',passed:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({environment:'Edge mobile emulation, real touch events; not physical Android',results,errors},null,2));
} finally {
  await fs.writeFile('outputs/parking-scene/mobile-touch.json',JSON.stringify({environment:'mobile emulation',results,errors},null,2));
  await browser.close();
}
