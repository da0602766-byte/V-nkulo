import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test('Drive: built SQLite engine runs in workerd without browser Location or dynamic WASM',async()=>{
  const root=path.resolve('dist/server');
  const files=(await readdir(root,{recursive:true})).filter(f=>f.endsWith('.js'));
  const sql=files.find(f=>/^assets[\\/]sql-asm-.*\.js$/.test(f));
  assert.ok(sql,'Build before running this test');
  const mf=new Miniflare(convertV4MiniflareOptions({modulesRoot:root,cf:false,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modules:[
    {type:'ESModule',path:path.join(root,'visitor-engine-test.js'),contents:`import init from './${sql.replaceAll('\\','/')}';
      export default {async fetch(){const SQL=await init();const db=new SQL.Database();try{
        db.run('CREATE TABLE visitors(id INTEGER PRIMARY KEY, name TEXT)');
        db.run('INSERT INTO visitors(name) VALUES(?)',['Fictício']);
        return Response.json(db.exec('SELECT name FROM visitors')[0].values);
      }finally{db.close();}}}`},
    ...files.map(f=>({type:'ESModule',path:path.join(root,f)})),
  ]}));
  try{const response=await mf.dispatchFetch('https://test.local');assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),[['Fictício']]);}
  finally{await mf.dispose();}
});
