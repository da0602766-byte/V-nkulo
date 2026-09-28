const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('app/src/main/assets/mobile-app/index.html');
const css=read('app/src/main/assets/mobile-app/app.css');
const app=read('app/src/main/assets/mobile-app/app.js');
const visitors=read('app/src/main/assets/mobile-app/visitors.js');
const modules=read('app/src/main/assets/mobile-app/modules.js');
const activity=read('app/src/main/java/com/vinkulo/app/MainActivity.java');

test('local document exposes named navigation, regions, lists and atomic status',()=>{
  for(const value of ['aria-label="Atalhos desta tela"','aria-labelledby="reader-title"','aria-labelledby="visitor-title"','aria-labelledby="module-title"','role="list"','aria-atomic="true"'])assert.match(html,new RegExp(value));
  assert.match(html,/href="#visitor-section"/);assert.match(html,/href="#module-section"/);assert.match(html,/enterkeyhint="search"/);
});
test('large text and touch targets remain first-class layout constraints',()=>{
  assert.match(css,/min-height:\s*48px/);assert.match(css,/font-size:\s*\.875rem/);assert.match(css,/@media \(max-width: 360px\)/);
  assert.match(css,/overflow-wrap:\s*anywhere/);assert.match(css,/focus-visible/);assert.match(css,/prefers-reduced-motion/);
});
test('all local lists batch connected mutations and repeated actions have contextual names',()=>{
  for(const source of [app,visitors,modules]){assert.match(source,/createDocumentFragment\(\)/);assert.match(source,/aria-busy/);}
  assert.match(visitors,/aria-label/);assert.match(modules,/aria-label/);assert.match(app,/requestAnimationFrame/);
});
test('notifications are requested from explicit feature use, never at startup',()=>{
  assert.doesNotMatch(activity,/requestStartupPermissions\(\)/);assert.match(activity,/case "push-token": requestPushToken\(reply\)/);
  assert.match(activity,/BuildConfig\.VERSION_NAME/);
});
test('Android back delegates local focus and anchors before leaving the activity',()=>{
  assert.match(app,/window\.VinkuloLocalBack/);assert.match(app,/window\.history\.back\(\)/);
  assert.match(activity,/VinkuloLocalBack&&window\.VinkuloLocalBack/);assert.match(activity,/finishWebBack\(\)/);
});
