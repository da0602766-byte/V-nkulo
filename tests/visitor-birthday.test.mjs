import test from 'node:test';
import assert from 'node:assert/strict';
import {visitorBirthdayInYear as birthday} from '../app/lib/visitor-birthday.ts';
test('aniversários do mês distinguem passado, hoje e próximos dias',()=>{
 assert.equal(birthday('2020-10-07','2026-10-22').label,'Foi há 15 dias');
 assert.equal(birthday('2007-10-27','2026-10-22').label,'Faltam 5 dias');
 assert.equal(birthday('2000-10-28','2026-10-22').age,26);
 assert.equal(birthday('2000-10-22','2026-10-22').days,0);
 assert.equal(birthday('2000-10-23','2026-10-22').label,'Amanhã · falta 1 dia');
 assert.equal(birthday('2000-10-21','2026-10-22').label,'Foi ontem');
});
test('meses anteriores e seguintes usam o ano exibido',()=>{
 assert.equal(birthday('2000-01-01','2026-12-31').days,-364);
 assert.equal(birthday('2000-12-31','2026-01-01').days,364);
});
test('29 de fevereiro, datas inválidas e nascimento futuro',()=>{
 assert.equal(birthday('2000-02-29','2026-02-27').days,1);
 assert.equal(birthday('2000-02-29','2026-02-27').adjusted,true);
 assert.equal(birthday('2000-02-29','2028-02-28').days,1);
 assert.equal(birthday('2000-02-29','2028-02-28').adjusted,false);
 assert.equal(birthday('2001-02-29','2026-10-22'),null);
 assert.equal(birthday('2027-10-22','2026-10-22'),null);
});
