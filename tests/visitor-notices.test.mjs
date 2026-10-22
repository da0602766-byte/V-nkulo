import assert from 'node:assert/strict';
import test from 'node:test';
import {buildVisitorNotices,relevantVisitorNotes} from '../app/lib/visitor-notices.ts';
const today='2026-10-22';
const person={id:'1',nome:'Pessoa teste',arquivado:false,categoria:'Kids',telefone:'11999999999',ultimo:'2026-10-22T15:00:00Z',entrada:'2026-10-01',status:'Integrado',celula:'Célula',ministerio:'Acolhida',discipulado:'Sim',batizado:'Sim',certificado:'Sim',apoio:'Não'};
const cats=[{nome:'Kids',responsavel:'Responsável da categoria'}];
test('cadastro completo usa responsável da categoria e não gera avisos',()=>assert.deepEqual(buildVisitorNotices([person],cats,today),[]));
test('retornos, ações de hoje e futuros são distintos; arquivados ficam fora',()=>{
 const rows=buildVisitorNotices([{...person,retorno:'2026-10-21',prazo:today,proximaAcao:'Ligar'}, {...person,id:'2',retorno:'2026-10-29'}, {...person,id:'3',retorno:'2026-10-30'},{...person,id:'4',arquivado:true,retorno:'2020-01-01'}],cats,today);
 assert.deepEqual(rows.map(r=>r.person.id),['1','2']);
 assert.deepEqual(rows[0].reasons.map(r=>r.group),['atrasado','hoje']);
 assert.equal(rows[0].priority,0);
});
test('reconhece cuidados e dados ausentes sem duplicar pessoas',()=>{
 const rows=buildVisitorNotices([{...person,status:'Novo',ultimo:undefined,categoria:undefined,telefone:undefined,apoio:'Sim',proximaAcao:'Visitar'}],cats,today);
 assert.equal(rows.length,1);
 for(const label of ['Primeiro contato','15 dias','Sem responsável','apoio social','sem prazo','Sem categoria','Sem telefone nem e-mail'])assert.ok(rows[0].reasons.some(r=>r.text.includes(label)),label);
});
test('sem permissão não revela condições baseadas no histórico',()=>{
 const rows=buildVisitorNotices([{...person,status:'Novo',ultimo:undefined,retorno:'2020-01-01',apoio:'Sim'}],cats,today,false);
 assert.equal(rows[0].reasons.length,1);
 assert.match(rows[0].reasons[0].text,/apoio social/);
});
test('15 dias respeita o dia de São Paulo e o limite exato',()=>{
 const make=ultimo=>buildVisitorNotices([{...person,ultimo}],cats,today).flatMap(r=>r.reasons).some(r=>r.text.includes('15 dias'));
 assert.equal(make('2026-10-08T01:00:00Z'),true);
 assert.equal(make('2026-10-08T15:00:00Z'),false);
});
test('anotações se restringem a visitantes ativos acessíveis; gerais e outras áreas ficam fora',()=>{
 const note={id:'n',titulo:'Cuidado',visitanteId:1,visitanteNome:'Pessoa',checklist:[{concluido:false}]};
 const rows=relevantVisitorNotes([note,{...note,id:'outro',visitanteId:2},{...note,id:'geral',visitanteId:null},{...note,id:'feito',checklist:[{concluido:true}]},{...note,id:'lembrete',checklist:[],lembreteEm:'2026-10-22T15:00:00Z'}],[person],today);
 assert.deepEqual(rows.map(r=>r.id),['n','lembrete']);
 assert.deepEqual(relevantVisitorNotes([note],[{...person,arquivado:true}],today),[]);
});
