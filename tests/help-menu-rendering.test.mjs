import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../app/components/GlobalFeedbackLauncher.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText;

for (const pathname of ['/painel','/painel/visitantes','/']) {
  test(`Help launcher rendering on ${pathname} does not depend on CSS`,()=>{
    const module={exports:{}};
    runInNewContext(source,{exports:module.exports,module,require(name){
      if(name==='next/navigation')return {usePathname:()=>pathname};
      if(name==='./SafeImage')return {default:()=>null};
      if(name==='../lib/client-image')return {};
      return require(name);
    }});
    const html=renderToStaticMarkup(React.createElement(module.exports.default));
    assert.equal(html.includes('global-feedback-launcher'),pathname==='/');
  });
}
