import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/official-badge.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {officialBadge}=exports;
test('official badges accept feminine and accented titles without elevating ordinary members',()=>{
 for(const [titles,tone] of [[['Aspirante'],'aspirant'],[['DIÁCONO','Diaconisa','diacono'],'deacon'],[['PRESBÍTERO','Presbítera'],'elder'],[['Pastor','Pastora'],'pastor']])for(const title of titles)assert.equal(officialBadge(title).tone,tone);
 assert.equal(officialBadge(),null);assert.equal(officialBadge('',false),null);
 assert.equal(officialBadge('LÍDER',true).tone,'official');assert.equal(officialBadge('',true).label,'Oficial da comunidade');
});
