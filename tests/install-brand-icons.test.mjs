import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import sharp from 'sharp';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
test('PWA keeps its identity and supplies transparent V installation icons at standard sizes',async()=>{
 const manifest=JSON.parse(await read('public/manifest.webmanifest'));
 assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
 for(const icon of manifest.icons){
  assert.equal(icon.purpose,'any');assert.equal(icon.type,'image/png');
  const file=new URL('../public'+icon.src,import.meta.url),image=sharp(fileURLToPath(file)),metadata=await image.metadata();
  const size=icon.sizes.split('x')[0];
  assert.ok((await readFile(new URL(`../public/vinkulo-app-icon-${size}.png`,import.meta.url))).equals(await readFile(file)), 'legacy installation URL must serve the same V');
  assert.equal(metadata.width,Number(icon.sizes.split('x')[0]));assert.equal(metadata.hasAlpha,true);assert.equal((await image.stats()).isOpaque,false);
  const {data,info}=await image.raw().toBuffer({resolveWithObject:true});
  for(const [x,y]of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(data[(y*info.width+x)*info.channels+3],0);
 }
 const layout=await read('app/layout.tsx');assert.match(layout,/vinkulo-apple-180-v3\.png/);assert.match(layout,/vinkulo-favicon-32-v3\.png/);
});
test('an icon update is offered without revoking the 1.23 offline policy',async()=>{
 const exports={};runInNewContext(ts.transpileModule(await read('app/lib/android-version.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
 assert.equal(exports.needsAndroidIconUpdate('1.23.0'),true);assert.equal(exports.needsAndroidPolicyUpdate('1.23.0'),false);
 for(const version of ['1.24.0','1.24.1','2.0.0'])assert.equal(exports.needsAndroidIconUpdate(version),false);
 for(const version of [undefined,'invalid','1.7.1'])assert.equal(exports.needsAndroidIconUpdate(version),true);
 const install=await read('app/components/MobileAppInstall.tsx');assert.match(install,/VINKULO_ANDROID_1\.24\.1_HOMOLOGACAO\.apk/);
 for(const component of ['AndroidOfflineControl','FirebaseIntegrationForm','OfflineModeEntry']){
  const source=await read(`app/components/${component}.tsx`);
  assert.match(source,/VINKULO_ANDROID_1\.24\.1_HOMOLOGACAO\.apk/);
  assert.doesNotMatch(source,/VINKULO_ANDROID_1\.23\.0\.apk/);
 }
});

test('URL migration requests an update through 1.24.0 and accepts the corrected APK',async()=>{
 const exports={};runInNewContext(ts.transpileModule(await read('app/lib/android-version.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
 for(const version of [undefined,'invalid','1.23.0','1.24.0'])assert.equal(exports.needsAndroidUrlUpdate(version),true);
 for(const version of ['1.24.1','1.24.2','1.25.0','2.0.0'])assert.equal(exports.needsAndroidUrlUpdate(version),false);
});
