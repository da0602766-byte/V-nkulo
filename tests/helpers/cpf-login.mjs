import {createHmac} from 'node:crypto';

// Migrate authentication fixtures to CPF and the separate owner entrance.
// The worker still performs real password/session checks. Production has no email-login adapter.
export async function cpfLoginRequest(env,request){
 const form=(request.headers.get('content-type')||'').includes('application/x-www-form-urlencoded');
 const body=form?Object.fromEntries((await request.clone().formData()).entries()):await request.clone().json();
 if(body.cpf)return request;
 const email=String(body.email||'').toLowerCase();
 const user=await env.DB.prepare('SELECT id,criado_em FROM usuarios WHERE lower(email)=?').bind(email).first();
 let cpf=String(700000000+(Number(user?.id)||999999));
 for(let i=9;i<=10;i++){let sum=0;for(let j=0;j<i;j++)sum+=Number(cpf[j])*(i+1-j);cpf+=String((sum*10)%11%10);}
 if(user) await env.DB.prepare('INSERT OR IGNORE INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES (?,?,?)')
  .bind(user.id,createHmac('sha256',env.AUTH_SECRET).update(`cpf:v1:${cpf}`).digest('hex'),cpf.slice(-2)).run();
 const payload={...body,cpf};delete payload.email;
 const url=new URL(request.url);
 if(email&&email===env.SYSTEM_OWNER_EMAIL?.toLowerCase()&&user&&Date.parse(user.criado_em)<=Date.parse(env.SYSTEM_OWNER_LOCKED_BEFORE))url.pathname='/api/auth/proprietario';
 return new Request(url,{method:request.method,headers:request.headers,body:form?new URLSearchParams(payload):JSON.stringify(payload)});
}
