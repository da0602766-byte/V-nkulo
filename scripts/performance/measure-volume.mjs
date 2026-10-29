import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { volumeFixture } from './volume-fixture.mjs';

const output=process.argv[2];
if(!output)throw Error('Usage: node scripts/performance/measure-volume.mjs <report.json>');
const report={node:process.version,kind:'local Worker + in-memory SQLite; no network or production data',samples:7,warmups:2,cases:[]};
for(const size of [100,1000,10000]) {
  const f=await volumeFixture(size);
  for(const path of ['/api/pilot/pessoas?aba=todos','/api/pilot/pessoas?aba=todos&vinculo=com-escala','/api/pilot/agenda?de=2099-01-01&ate=2099-01-31','/api/pilot/notificacoes']) {
    const times=[];let queries,body,bytes;
    for(let i=0;i<report.samples+report.warmups;i++) {
      f.measurements.length=0;const start=performance.now();const response=await f.call(path,{cookie:f.actor.cookie});
      const text=await response.text();assert.equal(response.status,200,text);body=JSON.parse(text);bytes=Buffer.byteLength(text);
      if(i>=report.warmups)times.push(performance.now()-start);
      queries=f.measurements.map(q=>({...q,plan:f.db.prepare('EXPLAIN QUERY PLAN '+q.query).all(...q.bindings)}));
    }
    times.sort((a,b)=>a-b);
    const row={size,path,medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1),responseBytes:bytes,returnedRows:queries.reduce((a,q)=>a+q.rows,0),databaseReturnBytes:queries.reduce((a,q)=>a+q.bytes,0),queryCount:queries.length,items:body.people?.length??body.notifications?.length??body.items?.length,unread:body.unread,queries};
    report.cases.push(row);console.log(JSON.stringify({...row,queries:undefined}));
  }
  f.db.close();
}
await writeFile(output,JSON.stringify(report,null,2)+'\n');
