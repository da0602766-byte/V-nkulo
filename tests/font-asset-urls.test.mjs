import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {journeyFixture} from './helpers/role-journey.mjs';

test('font CSS adapter handles Windows roots and leaves public URLs and unrelated code intact',()=>{
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../build/font-asset-urls.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
  const root='C:\\Projeto Vínkulo\\site',input='_selfHostedCSS: "src:url(C:/Projeto Vínkulo/site/.vinext/fonts/family/font.woff2)"';
  assert.equal(exports.rewriteFontAssetUrls(input,root),'_selfHostedCSS: "src:url(/assets/_vinext_fonts/family/font.woff2)"');
  assert.match(exports.rewriteFontAssetUrls(input,root,'static'),/\/static\/_vinext_fonts/);
  for(const value of ['_selfHostedCSS: "src:url(/assets/_vinext_fonts/a.woff2)"','const path="C:/Projeto Vínkulo/site/.vinext/fonts/a"'])assert.equal(exports.rewriteFontAssetUrls(value,root),value);
});

test('built pages reference packaged fonts rather than workstation paths',async()=>{
  const f=await journeyFixture();
  try{
    const html=await (await f.as('admin','/painel/visitantes')).text();
    const css=html.match(/<style data-vinext-fonts[^>]*>([\s\S]*?)<\/style>/)?.[1];
    assert.ok(css,'font CSS is present');assert.doesNotMatch(css,/[A-Z]:\/|\.vinext\/fonts/);
    const urls=[...css.matchAll(/url\(["']?([^)'"\s]+)/g)].map(m=>m[1]);
    assert.ok(urls.length>=3);
    for(const url of urls){assert.match(url,/^\/assets\/_vinext_fonts\//);assert.ok(existsSync(new URL('../dist/client'+url,import.meta.url)),url);}
  }finally{f.db.close();}
});
