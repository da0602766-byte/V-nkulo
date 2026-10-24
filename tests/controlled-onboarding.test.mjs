import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac,createHash,randomBytes } from 'node:crypto';
import { createPilotD1,createPilotUser } from './helpers/sqlite-d1.mjs';

const secret='isolated-onboarding-tests-only';
const password='Seguro123!';
const context={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
const worker=(await import('../dist/server/index.js')).default;
function cpf(n){let s=String(900000000+n);for(let i=9;i<=10;i++){let sum=0;for(let j=0;j<i;j++)sum+=Number(s[j])*(i+1-j);s+=String((sum*10)%11%10);}return s;}
const hash=value=>createHmac('sha256',secret).update(`cpf:v1:${value}`).digest('hex');
function cookie(r){return (r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||'']).map(x=>x.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean)||'';}
async function fixture(){
 const {database:db,d1}=await createPilotD1();
 const env={DB:d1,AUTH_SECRET:secret,SYSTEM_OWNER_EMAIL:'owner@test.invalid',SYSTEM_OWNER_LOCKED_BEFORE:'2099-01-01',ASSETS:{fetch:async()=>new Response('',{status:404})}};
 let ip=0;
 async function call(path,{method='GET',body,cookie:session='',headers={}}={}){
  return worker.fetch(new Request(`https://test.invalid${path}`,{method,headers:{'content-type':'application/json',origin:'https://test.invalid','cf-connecting-ip':`192.0.2.${++ip%200+1}`,cookie:session,...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,context);
 }
 async function account(n,email,owner=false){const id=await createPilotUser(db,{nome:'Pessoa de Teste',email,senha:password,memberships:owner?[]:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});db.prepare('INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES (?,?,?)').run(id,hash(cpf(n)),cpf(n).slice(-2));return {id,cpf:cpf(n),email};}
 async function login(person,owner=false){const r=await call(owner?'/api/auth/proprietario':'/api/auth/login',{method:'POST',body:{cpf:person.cpf,senha:password}});assert.equal(r.status,200,await r.clone().text());return cookie(r);}
 const owner=await account(1,'owner@test.invalid',true);const ownerCookie=await login(owner,true);
 return {db,d1,env,call,account,login,owner,ownerCookie};
}
async function configure(f,changes={}){
 const r=await f.call('/api/proprietario/planos',{cookie:f.ownerCookie});assert.equal(r.status,200,await r.clone().text());
 const p=(await r.json()).plans.find(x=>x.id==='gratuito');const plan={...p,ativo:true,contratavel:true,modulos:['people','events'],recursos:['feed'],limites:{usuarios:2,administradores:1,cadastros:1,celulas:0,ministerios:0},...changes};
 const saved=await f.call('/api/proprietario/planos',{method:'PUT',cookie:f.ownerCookie,body:plan});assert.equal(saved.status,200,await saved.clone().text());return (await saved.json()).plans.find(x=>x.id===plan.id);
}
async function requestLink(f,n=20){
 const doc=cpf(n);const r=await f.call('/api/public/log1',{method:'POST',body:{nome:'Solicitante Teste',telefone:'11987654321',nascimento:'1990-03-14',cpf:doc,aceite:true,role:'owner'}});assert.equal(r.status,202,await r.clone().text());
 const row=f.db.prepare('SELECT id FROM solicitacoes_log1 WHERE cpf_hash=?').get(hash(doc));
 const link=await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:row.id,action:'GERAR_LINK',planos:['gratuito'],horas:2}});assert.equal(link.status,200,await link.clone().text());
 const token=(await link.json()).url.split('/').pop();return {id:row.id,token,cpf:doc};
}
async function contract(f,link,plan){const response=await f.call(`/api/public/contratacao/${link.token}`,{method:'POST',body:{cpf:link.cpf,email:`request-${link.id}@test.invalid`,senha:password,comunidadeNome:'Comunidade de Teste',cidade:'São Paulo',planoId:plan.id,versao:plan.versao,aceite:true,role:'owner'}});assert.equal(response.status,202,await response.clone().text());}

test('CPF: credenciais corretas/incorretas, formato, enumeração, tentativas e revogação de sessão',async()=>{
 const f=await fixture();const user=await f.account(2,'normal@test.invalid');
 const bad=await f.call('/api/auth/login',{method:'POST',body:{cpf:user.cpf,senha:'errada123'}});const unknown=await f.call('/api/auth/login',{method:'POST',body:{cpf:cpf(99),senha:'errada123'}});assert.equal(bad.status,401);assert.deepEqual(await bad.json(),await unknown.json());
 const malformed=await f.call('/api/auth/login',{method:'POST',body:{cpf:'00000000000',senha:password}});assert.equal(malformed.status,401);
 const formatted=user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
 const ok=await f.call('/api/auth/login',{method:'POST',body:{cpf:formatted,senha:password}});assert.equal(ok.status,200);assert.match(ok.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 f.db.prepare("UPDATE sessoes SET expira_em='2000-01-01' WHERE usuario_id=?").run(user.id);
 const expired=await f.call('/api/pilot/comunidades',{cookie:cookie(ok)});assert.equal(expired.status,401);
 for(let i=0;i<9;i++){const r=await f.call('/api/auth/login',{method:'POST',body:{cpf:cpf(98),senha:password}});if(i===8)assert.equal(r.status,429);}
 assert.equal((await f.call('/api/auth/cadastro',{method:'POST',body:{email:'random@test.invalid',senha:password}})).status,403);
 const html=await (await f.call('/login')).text();assert.match(html,/<form[^>]*method="post"/);
 const native=await worker.fetch(new Request('https://test.invalid/api/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({cpf:user.cpf,senha:password})}),f.env,context);
 assert.equal(native.status,303);assert.ok(!native.headers.get('location').includes(user.cpf));assert.ok(!native.headers.get('location').includes(password));
});
test('proprietário exige rota própria, autorização global, sessão válida e CSRF',async()=>{
 const f=await fixture();const user=await f.account(3,'community-owner@test.invalid');f.db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(user.id);
 const common=await f.login(user);assert.equal((await f.call('/api/proprietario/planos',{cookie:common})).status,403);
 assert.equal((await f.call('/api/auth/proprietario',{method:'POST',body:{cpf:user.cpf,senha:password,system_owner:true,role:'owner'}})).status,401);
 assert.equal((await f.call('/api/proprietario/planos')).status,401);
 const ordinaryOwner=await f.login(f.owner);assert.equal((await f.call('/api/proprietario/planos',{cookie:ordinaryOwner})).status,403);
 f.db.prepare("UPDATE usuarios SET perfil='ADMIN' WHERE id=?").run(f.owner.id);
 const adminOwnerNormal=await f.login(f.owner);assert.equal((await f.call('/api/proprietario/planos',{cookie:adminOwnerNormal})).status,403);
 const privileged=await f.login(f.owner,true);assert.equal((await f.call('/api/proprietario/planos',{cookie:privileged})).status,200);
 const token=privileged.split('=')[1];const payload=JSON.parse(Buffer.from(token.split('.')[0],'base64url'));assert.equal(payload.scope,'owner');assert.ok(payload.e-Date.now()<=3600000);
 const changed={...payload,scope:'owner',u:user.id};const forged=Buffer.from(JSON.stringify(changed)).toString('base64url')+'.'+token.split('.')[1];
 assert.equal((await f.call('/api/proprietario/planos',{cookie:`__Host-adote_session=${forged}`})).status,401);
 assert.equal((await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:privileged,body:{id:1,action:'ATIVAR'},headers:{origin:'https://attacker.invalid'}})).status,403);
 f.db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(f.owner.id);assert.equal((await f.call('/api/proprietario/planos',{cookie:privileged})).status,401);
});
test('contas existentes vinculam CPF mediante senha, sem duplicar usuário ou trocar documento',async()=>{
 const f=await fixture();const id=await createPilotUser(f.db,{nome:'Conta Antiga',email:'legacy@test.invalid',senha:password});
 const bad=await f.call('/api/auth/vincular-cpf',{method:'POST',body:{email:'legacy@test.invalid',senha:'errada123',cpf:cpf(5)}});assert.equal(bad.status,401);
 const ok=await f.call('/api/auth/vincular-cpf',{method:'POST',body:{email:'legacy@test.invalid',senha:password,cpf:cpf(5)}});assert.equal(ok.status,200,await ok.clone().text());assert.equal(f.db.prepare('SELECT usuario_id FROM identidades_cpf WHERE cpf_hash=?').get(hash(cpf(5))).usuario_id,id);
 const duplicate=await f.call('/api/auth/vincular-cpf',{method:'POST',body:{email:'legacy@test.invalid',senha:password,cpf:cpf(6)}});assert.equal(duplicate.status,401);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuario_comunidades WHERE usuario_id=?').get(id).n,1);
});
test('LOG1 → link → contratação → aprovação cria uma comunidade sem privilégios globais',async()=>{
 const f=await fixture();const p=await configure(f);const before=f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;const link=await requestLink(f);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,before);
 const view=await f.call(`/api/public/contratacao/${link.token}`);assert.equal(view.status,200);const data=await view.json();assert.equal(data.payments.available,false);assert.equal(JSON.stringify(data).includes(link.cpf),false);
 await contract(f,link,p);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,before);assert.equal((await f.call(`/api/public/contratacao/${link.token}`)).status,404);
 const activated=await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'ATIVAR',fundamento:'GRATUITO'}});assert.equal(activated.status,200,await activated.clone().text());
 const row=f.db.prepare('SELECT * FROM solicitacoes_log1 WHERE id=?').get(link.id);assert.equal(row.status,'ATIVADA');assert.equal(row.senha_hash,null);assert.ok(row.comunidade_id);assert.equal(f.db.prepare('SELECT perfil FROM usuarios WHERE id=?').get(row.usuario_id).perfil,'ACOMPANHANTE');
 assert.equal(f.db.prepare('SELECT papel FROM usuario_comunidades WHERE usuario_id=?').get(row.usuario_id).papel,'ADMIN_COMUNIDADE');
 const second=await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'ATIVAR',fundamento:'GRATUITO'}});assert.equal(second.status,409);
 const session=await f.login({cpf:link.cpf});assert.equal((await f.call('/api/proprietario/planos',{cookie:session})).status,403);
 assert.equal((await f.call('/api/pilot/solicitacoes',{cookie:session})).status,403);
 assert.equal((await f.call('/api/pilot/solicitacoes/central',{cookie:session})).status,403);
 assert.equal((await f.call('/api/pilot/ministerios',{cookie:session})).status,403);
 assert.equal((await f.call('/api/pilot/comunidade-ativa',{method:'POST',cookie:session,body:{comunidadeId:1}})).status,403);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM assinaturas_comunidade WHERE comunidade_id=?').get(row.comunidade_id).n,1);
});
test('links de contratação expirados/revogados e versões antigas não concedem acesso',async()=>{
 const f=await fixture();await configure(f);let link=await requestLink(f,30);
 f.db.prepare("UPDATE links_contratacao SET expira_em='2000-01-01' WHERE solicitacao_id=?").run(link.id);assert.equal((await f.call(`/api/public/contratacao/${link.token}`)).status,404);
 link=await requestLink(f,31);await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'REVOGAR'}});assert.equal((await f.call(`/api/public/contratacao/${link.token}`)).status,404);
 link=await requestLink(f,32);const invalid=await f.call(`/api/public/contratacao/${link.token}`,{method:'POST',body:{cpf:link.cpf,email:'check@test.invalid',senha:password,comunidadeNome:'Uma Comunidade',cidade:'Recife',planoId:'gratuito',versao:-1,aceite:true}});assert.equal(invalid.status,409);
});
test('catálogo e contratação usam o plano atual; alteração rejeita aceite antigo sem consumir o link',async()=>{
 const f=await fixture();const old=await configure(f,{nome:'Oferta de auditoria',valor_centavos:12345,descricao:'Descrição conferida',condicoes:'Condição inicial'});const link=await requestLink(f,33);
 const current=await configure(f,{nome:old.nome,valor_centavos:23456,descricao:old.descricao,condicoes:'Condição revisada',duracao_dias:60});
 const html=await(await f.call('/planos')).text();assert.match(html,/Oferta de auditoria/);assert.match(html,/234,56/);assert.match(html,/href="\/log1"/);assert.doesNotMatch(html,/123,45/);
 const home=await(await f.call('/')).text();assert.match(home,/href="\/planos"/);assert.doesNotMatch(home,/1\.200|180K|Quem usa,/);
 const payload={cpf:link.cpf,email:'revised@test.invalid',senha:password,comunidadeNome:'Comunidade de Teste',cidade:'Recife',planoId:old.id,versao:old.versao,aceite:true};
 assert.equal((await f.call(`/api/public/contratacao/${link.token}`,{method:'POST',body:payload})).status,409);
 assert.equal((await f.call(`/api/public/contratacao/${link.token}`,{method:'POST',body:{...payload,versao:current.versao,aceite:false}})).status,400);
 assert.equal(f.db.prepare('SELECT usado_em FROM links_contratacao WHERE solicitacao_id=?').get(link.id).usado_em,null);
 assert.equal(f.db.prepare('SELECT status FROM solicitacoes_log1 WHERE id=?').get(link.id).status,'LINK_GERADO');
 const viewed=await(await f.call(`/api/public/contratacao/${link.token}`)).json();assert.equal(viewed.plans[0].versao,current.versao);assert.equal(viewed.plans[0].condicoes,'Condição revisada');
 await contract(f,link,current);
 const snapshot=JSON.parse(f.db.prepare('SELECT contrato FROM solicitacoes_log1 WHERE id=?').get(link.id).contrato);assert.equal(snapshot.valor_centavos,23456);assert.equal(snapshot.duracao_dias,60);assert.equal(snapshot.condicoes,'Condição revisada');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuarios WHERE email=?').get(`request-${link.id}@test.invalid`).n,0);
});

test('planos pagos exigem fundamento legítimo; assinatura personalizada altera permissões e cotas reais',async()=>{
 const f=await fixture();const p=await configure(f,{valor_centavos:5000});const link=await requestLink(f,40);await contract(f,link,p);
 const denied=await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'ATIVAR',fundamento:'GRATUITO'}});assert.equal(denied.status,409);
 const ok=await f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'ATIVAR',fundamento:'ISENCAO',referencia:'Isenção aprovada para teste isolado'}});assert.equal(ok.status,200,await ok.clone().text());
 const row=f.db.prepare('SELECT comunidade_id,usuario_id FROM solicitacoes_log1 WHERE id=?').get(link.id);
 const u=await createPilotUser(f.db,{nome:'Segundo Usuário',email:'second@test.invalid',senha:password,memberships:[]});f.db.prepare("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES (?,?,'MEMBRO','ATIVO')").run(u,row.comunidade_id);
 const third=await createPilotUser(f.db,{nome:'Terceiro Usuário',email:'third@test.invalid',senha:password,memberships:[]});assert.throws(()=>f.db.prepare("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES (?,?,'MEMBRO','ATIVO')").run(third,row.comunidade_id),/PLAN_USER_LIMIT/);
 assert.throws(()=>f.db.prepare("UPDATE usuario_comunidades SET papel='ADMIN_COMUNIDADE' WHERE usuario_id=?").run(u),/PLAN_ADMIN_LIMIT/);
 const session=await f.login({cpf:link.cpf});assert.equal((await f.call('/api/pilot/ministerios',{cookie:session})).status,403);
 const changed=await f.call('/api/proprietario/assinaturas',{method:'PATCH',cookie:f.ownerCookie,body:{comunidadeId:row.comunidade_id,plan:{...p,modulos:['people','ministries'],limites:{...p.limites,usuarios:3}},status:'ATIVA',fundamento:'ISENCAO',referencia:'Ampliação aprovada em teste isolado'}});assert.equal(changed.status,200,await changed.clone().text());
 // Community module configuration remains a second gate; plan alone cannot grant extra permissions.
 f.db.prepare("UPDATE configuracoes SET valor='[\"people\",\"ministries\"]' WHERE chave=?").run(`community_modules:${row.comunidade_id}`);
 assert.equal((await f.call('/api/pilot/ministerios',{cookie:session})).status,200);
 f.db.prepare("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES (?,?,'MEMBRO','ATIVO')").run(third,row.comunidade_id);
 assert.throws(()=>f.db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome) VALUES (?,'Extra')").run(row.comunidade_id),/PLAN_QUOTA_LIMIT/);
 f.db.prepare("UPDATE assinaturas_comunidade SET status='SUSPENSA' WHERE comunidade_id=?").run(row.comunidade_id);
 assert.equal((await f.call('/api/pilot/ministerios',{cookie:session})).status,403);
});

test('comunidade existente recebe condições somente por decisão global e preserva vínculos e vencimento',async()=>{
 const f=await fixture();const manager=await f.account(60,'existing-manager@test.invalid');const session=await f.login(manager);const plan=await configure(f,{duracao_dias:30});
 const count=f.db.prepare('SELECT COUNT(*) n FROM usuario_comunidades WHERE comunidade_id=1').get().n;
 const payload={comunidadeId:1,plan,status:'ATIVA',fundamento:'GRATUITO',referencia:'Condições aprovadas para comunidade existente'};
 assert.equal((await f.call('/api/proprietario/assinaturas',{method:'PATCH',cookie:session,body:payload})).status,403);
 const saved=await f.call('/api/proprietario/assinaturas',{method:'PATCH',cookie:f.ownerCookie,body:payload});assert.equal(saved.status,200,await saved.clone().text());
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuario_comunidades WHERE comunidade_id=1').get().n,count);
 f.db.prepare("UPDATE assinaturas_comunidade SET termina_em='2098-01-01' WHERE comunidade_id=1").run();
 assert.equal((await f.call('/api/proprietario/assinaturas',{method:'PATCH',cookie:f.ownerCookie,body:{...payload,status:'SUSPENSA'}})).status,200);
 assert.equal(f.db.prepare('SELECT termina_em FROM assinaturas_comunidade WHERE comunidade_id=1').get().termina_em,'2098-01-01');
 assert.equal((await f.call('/api/pilot/solicitacoes',{cookie:session})).status,403);
});
test('convite exige CPF, rejeita escopo do cliente, tem uso único e revogação',async()=>{
 const f=await fixture();const manager=await f.account(50,'manager@test.invalid');const session=await f.login(manager);
 let r=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'invite@test.invalid',comunidadeId:2,horas:1}});assert.equal(r.status,201,await r.clone().text());const token=(await r.json()).inviteUrl.split('/').pop();const payload={token,nome:'Novo Integrante',email:'invite@test.invalid',senha:password,cpf:cpf(51),aceite:true,communityId:2,role:'owner'};
 assert.equal((await f.call('/api/pilot/convites/aceitar',{method:'POST',body:{...payload,cpf:''}})).status,400);
 const accepted=await f.call('/api/pilot/convites/aceitar',{method:'POST',body:payload});assert.equal(accepted.status,201,await accepted.clone().text());
 const member=f.db.prepare('SELECT id FROM usuarios WHERE email=?').get(payload.email);const memberships=f.db.prepare('SELECT comunidade_id,papel FROM usuario_comunidades WHERE usuario_id=?').all(member.id);assert.deepEqual(memberships.map(x=>({...x})),[{comunidade_id:1,papel:'MEMBRO'}]);
 assert.equal((await f.call('/api/pilot/convites/aceitar',{method:'POST',body:payload})).status,404);
 r=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'revoked@test.invalid'}});const revokedToken=(await r.json()).inviteUrl.split('/').pop();const invite=f.db.prepare("SELECT id FROM convites_comunidade WHERE email='revoked@test.invalid'").get();
 assert.equal((await f.call('/api/pilot/convites',{method:'PATCH',cookie:session,body:{id:invite.id}})).status,200);
 assert.equal((await f.call('/api/pilot/convites/aceitar',{method:'POST',body:{...payload,token:revokedToken,email:'revoked@test.invalid',cpf:cpf(52)}})).status,404);
});


test('emissão concorrente de convites respeita a última vaga e mantém uma auditoria por emissão',async()=>{
 const f=await fixture();const manager=await f.account(51,'concurrent-manager@test.invalid');const session=await f.login(manager);
 for(let i=0;i<9;i++)f.db.prepare("INSERT INTO convites_comunidade(comunidade_id,email,papel,token_hash,status,expira_em,criado_por) VALUES(1,?,'MEMBRO',?,'PENDENTE','2099-01-01',?)").run(`seed-${i}@test.invalid`,`seed-${i}`,manager.id);
 const responses=await Promise.all(['a','b'].map(n=>f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:`concurrent-${n}@test.invalid`}})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,429]);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM convites_comunidade WHERE comunidade_id=1 AND status='PENDENTE'").get().n,10);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM auditoria_piloto WHERE evento='CONVITE_MEMBRO_CRIADO'").get().n,1);
 const replacement=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'seed-0@test.invalid'}});
 assert.equal(replacement.status,201,await replacement.clone().text());
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM convites_comunidade WHERE comunidade_id=1 AND status='PENDENTE'").get().n,10);
 assert.equal(f.db.prepare("SELECT status FROM convites_comunidade WHERE token_hash='seed-0'").get().status,'EXPIRADO');
});

test('emissões simultâneas para o mesmo e-mail deixam somente o último convite ativo',async()=>{
 const f=await fixture();const manager=await f.account(52,'duplicate-manager@test.invalid');const session=await f.login(manager);
 const responses=await Promise.all([1,2].map(()=>f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'same@test.invalid'}})));
 assert.deepEqual(responses.map(r=>r.status),[201,201]);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM convites_comunidade WHERE email='same@test.invalid' AND status='PENDENTE'").get().n,1);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM auditoria_piloto WHERE evento='CONVITE_MEMBRO_CRIADO'").get().n,2);
});

test('falha de auditoria reverte a substituição do convite e entradas inválidas são recusadas',async()=>{
 const f=await fixture();const manager=await f.account(53,'rollback-manager@test.invalid');const session=await f.login(manager);
 for(const body of [null,{}, {email:[]},{email:'x'.repeat(255)+'@test.invalid'}])assert.equal((await f.call('/api/pilot/convites',{method:'POST',cookie:session,body})).status,400);
 const first=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'rollback@test.invalid'}});assert.equal(first.status,201);
 const before=f.db.prepare("SELECT * FROM convites_comunidade WHERE email='rollback@test.invalid'").all();
 f.db.exec("CREATE TRIGGER fail_invite_audit BEFORE INSERT ON auditoria_piloto WHEN NEW.evento='CONVITE_MEMBRO_CRIADO' BEGIN SELECT RAISE(ABORT,'QA audit failure'); END");
 const failed=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'rollback@test.invalid'}});assert.equal(failed.status,500);
 assert.deepEqual(f.db.prepare("SELECT * FROM convites_comunidade WHERE email='rollback@test.invalid'").all(),before);
});

test('cadastro coletivo: prazo, revogação, CPF mascarado e limite atômico sob concorrência',async()=>{
 const f=await fixture();const manager=await f.account(70,'collective-manager@test.invalid');
 f.db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(manager.id);
 const session=await f.login(manager);
 const ministry=Number(f.db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,status,criado_por) VALUES (1,'Ministério de Teste','ATIVO',?)").run(manager.id).lastInsertRowid);
 const creation={title:'Cadastro isolado',opensAt:new Date(Date.now()-60000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString(),maxUses:1};
 const made=await f.call('/api/pilot/cadastros-membros',{method:'POST',cookie:session,body:creation});assert.equal(made.status,201,await made.clone().text());const link=await made.json();
 async function submit(n,token=link.token){const form=new FormData();for(const [key,value] of Object.entries({fullName:'Pessoa de Teste',email:'collective-'+n+'@test.invalid',cpf:cpf(n),senha:password,cep:'58000000',birthDate:'1990-05-20',communityId:'1',anointing:'MEMBRO',ministryId:String(ministry),acceptedTerms:'true'}))form.set(key,value);
  return worker.fetch(new Request('https://test.invalid/api/public/cadastro-membro/'+token,{method:'POST',headers:{origin:'https://test.invalid'},body:form}),f.env,context);
 }
 const before=f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
 const responses=await Promise.all([submit(71),submit(72)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,before+1);
 assert.equal(f.db.prepare('SELECT usos FROM links_cadastro_membros WHERE id=?').get(link.id).usos,1);
 const saved=f.db.prepare('SELECT cpf FROM cadastros_membros_temporarios WHERE link_id=?').get(link.id);assert.ok(saved.cpf.startsWith('***.***.***-'));assert.equal(saved.cpf.length,14);
 assert.equal((await submit(73)).status,409);
 assert.equal((await f.call('/api/pilot/cadastros-membros',{method:'PATCH',cookie:session,body:{id:link.id,...creation,closesAt:new Date(Date.now()+40*86400000).toISOString()}})).status,400);
 const another=await f.call('/api/pilot/cadastros-membros',{method:'POST',cookie:session,body:creation});const second=await another.json();
 f.db.prepare("UPDATE links_cadastro_membros SET fecha_em='2000-01-01' WHERE id=?").run(second.id);assert.equal((await submit(73,second.token)).status,409);
 f.db.prepare("UPDATE links_cadastro_membros SET fecha_em='2099-01-01' WHERE id=?").run(second.id);
 assert.equal((await f.call('/api/pilot/cadastros-membros',{method:'PATCH',cookie:session,body:{id:second.id,action:'CANCEL'}})).status,200);
 assert.equal((await submit(73,second.token)).status,409);
});

test('convite com cota esgotada reverte conta, identidade e consumo do token na mesma transação',async()=>{
 const f=await fixture();const plan=await configure(f,{limites:{usuarios:1,administradores:1,cadastros:0,celulas:0,ministerios:0}});
 const manager=await f.account(80,'quota-manager@test.invalid');const session=await f.login(manager);
 f.db.prepare("INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,status,contrato,fundamento,aprovado_por) VALUES (1,'gratuito','ATIVA',?,'GRATUITO',?)").run(JSON.stringify(plan),f.owner.id);
 const response=await f.call('/api/pilot/convites',{method:'POST',cookie:session,body:{email:'quota-invite@test.invalid'}});assert.equal(response.status,201,await response.clone().text());const token=(await response.json()).inviteUrl.split('/').pop();
 const accepted=await f.call('/api/pilot/convites/aceitar',{method:'POST',body:{token,nome:'Pessoa sem cota',email:'quota-invite@test.invalid',senha:password,cpf:cpf(81),aceite:true}});assert.equal(accepted.status,409);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM usuarios WHERE email='quota-invite@test.invalid'").get().n,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM identidades_cpf WHERE cpf_hash=?').get(hash(cpf(81))).n,0);
 assert.equal(f.db.prepare("SELECT status FROM convites_comunidade WHERE email='quota-invite@test.invalid'").get().status,'PENDENTE');
});

test('recuperação não enumera CPF; token simultâneo altera senha uma só vez e revoga sessões',async()=>{
 const f=await fixture();const user=await f.account(90,'reset@test.invalid');const session=await f.login(user);
 const known=await f.call('/api/auth/esqueci-senha',{method:'POST',body:{cpf:user.cpf}});const missing=await f.call('/api/auth/esqueci-senha',{method:'POST',body:{cpf:cpf(91)}});assert.equal(known.status,missing.status);assert.deepEqual(await known.json(),await missing.json());
 const token=randomBytes(32).toString('hex');f.db.prepare("INSERT INTO redefinicoes_senha(usuario_id,token_hash,expira_em,usado) VALUES (?,?,datetime('now','+30 minutes'),0)").run(user.id,createHash('sha256').update(token).digest('hex'));
 const responses=await Promise.all(['Alterada123!','OutraSenha123!'].map(senha=>f.call('/api/auth/redefinir-senha',{method:'POST',body:{token,senha}})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);assert.equal((await f.call('/api/pilot/comunidades',{cookie:session})).status,401);
 assert.equal((await f.call('/api/auth/login',{method:'POST',body:{cpf:user.cpf,senha:password}})).status,401);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM auditoria_piloto WHERE usuario_id=? AND evento='SENHA_REDEFINIDA'").get(user.id).n,1);
});

test('contratação e ativação simultâneas criam um único responsável; retenção preserva assinatura',async()=>{
 const f=await fixture();const plan=await configure(f);const link=await requestLink(f,95);
 const body={cpf:link.cpf,email:'concurrent@test.invalid',senha:password,comunidadeNome:'Comunidade Única',cidade:'Recife',planoId:plan.id,versao:plan.versao,aceite:true};
 const contracts=await Promise.all([1,2].map(()=>f.call('/api/public/contratacao/'+link.token,{method:'POST',body})));
 assert.equal(contracts.filter(r=>r.status===202).length,1);assert.ok(contracts.some(r=>r.status>=400));
 const activations=await Promise.all([1,2].map(()=>f.call('/api/proprietario/solicitacoes',{method:'PATCH',cookie:f.ownerCookie,body:{id:link.id,action:'ATIVAR',fundamento:'GRATUITO'}})));
 assert.deepEqual(activations.map(r=>r.status).sort(),[200,409]);
 const community=f.db.prepare('SELECT comunidade_id FROM solicitacoes_log1 WHERE id=?').get(link.id).comunidade_id;
 f.db.prepare("UPDATE solicitacoes_log1 SET retencao_ate='2000-01-01' WHERE id=?").run(link.id);
 await f.call('/api/proprietario/solicitacoes',{cookie:f.ownerCookie});
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM solicitacoes_log1 WHERE id=?').get(link.id).n,0);
 assert.equal(f.db.prepare('SELECT status FROM assinaturas_comunidade WHERE comunidade_id=?').get(community).status,'ATIVA');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comunidades WHERE id=?').get(community).n,1);
 assert.equal((await f.call('/api/payments/webhook',{method:'POST',body:{status:'approved'}})).status,503);
 assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
});
