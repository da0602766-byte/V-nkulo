import assert from 'node:assert/strict';
import test from 'node:test';
import {journeyFixture} from './helpers/role-journey.mjs';

const views=['inicio','fio','eventos','ministerios','solicitacoes','visitantes','celulas','estacionamento','redes','membro','lider','pessoas','comunidade','relatorios','avisos','configuracoes','continuidade','conta','mensagens'];
const denied={member:['redes','lider','pessoas','configuracoes','continuidade'],official:['redes','lider','pessoas','configuracoes','continuidade'],admin:['redes']};
for(const role of ['member','official','admin'])test(`páginas por perfil: ${role}, todas as áreas e consultas principais`,async()=>{
  const f=await journeyFixture();
  try{
    for(const view of views){
      const response=await f.as(role,view==='visitantes'?'/painel/visitantes':'/painel?view='+view);
      assert.equal(response.status,200,`${role}: ${view}`);const html=await response.text();
      assert.doesNotMatch(html,/A navegação foi interrompida|Internal Server Error/);
      if(denied[role].includes(view))assert.match(html,/Esta aba não está autorizada/,`${role}: ${view}`);
    }
    for(const url of ['/api/pilot/central','/api/pilot/agenda','/api/pilot/eventos','/api/pilot/ministerios','/api/pilot/celulas','/api/pilot/anotacoes','/api/pilot/notificacoes','/api/pilot/presenca','/api/pilot/chat','/api/conta/perfil','/api/storage/preferences','/api/pilot/comunidades']){
      const response=await f.as(role,url);assert.equal(response.status,200,`${role}: ${url}: ${await response.clone().text()}`);
    }
    for(const url of ['/api/pilot/editorial','/api/pilot/estatisticas','/api/pilot/feature-flags','/api/proprietario?section=users'])assert.equal((await f.as(role,url)).status,403,url);
    const profile=await (await f.as(role,'/api/conta/perfil')).json();assert.equal(profile.account.id,f.accounts[role].id);
    const people=await (await f.as(role,'/api/pilot/pessoas')).json();assert.equal(people.canViewPeople,role==='admin');
    if(role!=='admin')assert.deepEqual(people.people,[]);
  }finally{f.db.close();}
});

test('páginas públicas, entrada e links inválidos retornam resposta tratada nos três perfis',async()=>{
  const f=await journeyFixture();
  try{
    for(const role of ['member','official','admin'])for(const url of ['/','/comunidades','/comunidades/nao-existe','/login','/log1','/planos','/contato','/termos','/privacidade','/exclusao-de-dados','/acesso-negado','/sem-comunidade','/vincular-cpf','/ativar-admin','/primeiro-acesso','/redefinir-senha','/login/google-concluido','/proprietario','/proprietario/acesso','/convite/invalido','/cadastro-membro/invalido','/acesso/invalido','/contratacao/invalido','/escala/invalido','/compartilhar/publicacao/999999','/painel/modulos/nao-existe']){
      const response=await f.as(role,url);assert.ok(response.status<500,`${role}: ${url} ${response.status}`);
      const html=await response.text();assert.doesNotMatch(html,/A navegação foi interrompida|Internal Server Error/,`${role}: ${url}`);
    }
  }finally{f.db.close();}
});
