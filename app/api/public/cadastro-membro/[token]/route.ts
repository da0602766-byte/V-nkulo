import { normalizeCpf,validBirthDate } from '../../../../lib/cpf';
import { privateHash, rateLimit, secureToken } from '../../../../lib/access-security';
import { getD1 } from "../../../../../db";
import { getMemberRegistrationForm } from "../../../../lib/member-registration";
import { hashPassword, validatePassword } from "../../../../lib/local-auth";

type Context = { params: Promise<{ token: string }> };
const DAY_VALUES = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);
const PERIOD_VALUES = new Set(["MANHA", "TARDE", "NOITE", "FLEXIVEL"]);

export async function GET(_request: Request, context: Context) {
  const token = (await context.params).token;
  const form = await getMemberRegistrationForm(getD1(), token);
  if (!form) {
    return Response.json({ error: "Link de cadastro inválido." }, { status: 404 });
  }
  return Response.json(form, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const token = (await context.params).token;
  if (!await rateLimit(request,'member-link',token,30)) return Response.json({error:'Muitas tentativas. Aguarde 15 minutos.'},{status:429});
  const db = getD1();
  const registration = await getMemberRegistrationForm(db, token);
  if (!registration) {
    return Response.json({ error: "Link de cadastro inválido." }, { status: 404 });
  }
  if (registration.state !== "ABERTO") {
    return Response.json(
      {
        error: registration.state === "AGUARDANDO"
          ? "O período de cadastro ainda não começou."
          : registration.state === "ENCERRADO"
            ? "O período de cadastro já terminou."
            : "Este link de cadastro foi cancelado.",
        state: registration.state,
      },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Não foi possível ler o formulário." }, { status: 400 });
  }
  const fullName = clean(form.get("fullName"), 120);
  const email = clean(form.get("email"), 180).toLocaleLowerCase("pt-BR");
  const cpf = normalizeCpf(form.get("cpf"));
  const senha = String(form.get("senha") || "");
  if (!cpf || validatePassword(senha) || senha.length > 256) return Response.json({error:"Informe CPF válido e uma senha com pelo menos 8 caracteres, letras e números."},{status:400});
  const cep = digits(form.get("cep")).slice(0, 8);
  const birthDate = clean(form.get("birthDate"), 10);
  const communityId = positiveInteger(form.get("communityId"));
  const anointing = clean(form.get("anointing"), 40).toUpperCase();
  const ministryId = positiveInteger(form.get("ministryId"));
  const functionId = positiveInteger(form.get("functionId"));
  const period = clean(form.get("period"), 20).toUpperCase();
  const acceptedTerms = String(form.get("acceptedTerms")) === "true";
  const days = form.getAll("availableDays").map(String).filter((day) => DAY_VALUES.has(day));
  const community = registration.communities.find((item) => item.id === communityId);
  const ministry = community?.ministries.find((item) => item.id === ministryId);
  const ministryFunction = functionId
    ? ministry?.functions.find((item) => item.id === functionId)
    : undefined;
  if (
    fullName.length < 5 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    cep.length !== 8 ||
    !validBirthDate(birthDate) ||
    !community ||
    !community.anointings.some((item) => item.id === anointing) ||
    !ministry
  ) {
    return Response.json(
      { error: "Revise nome, e-mail, CEP, nascimento, comunidade, unção e ministério." },
      { status: 400 },
    );
  }
  if (functionId && !ministryFunction) {
    return Response.json({ error: "A função escolhida não pertence a este ministério." }, { status: 400 });
  }
  if (period && !PERIOD_VALUES.has(period)) {
    return Response.json({ error: "Período disponível inválido." }, { status: 400 });
  }
  if (!acceptedTerms) return Response.json({ error: "Aceite os Termos de Uso e a Política de Privacidade." }, { status: 400 });

  const existingUser = await db.prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1").bind(email).first<{ id: number }>();
  if (existingUser) return Response.json({ error: "Já existe uma conta com este e-mail. Entre com sua conta ou use outro e-mail." }, { status: 409 });

  const duplicate = await db
    .prepare("SELECT id FROM cadastros_membros_temporarios WHERE link_id = ? AND email = ? LIMIT 1")
    .bind(registration.id, email)
    .first<{ id: number }>();
  if (duplicate) {
    return Response.json(
      { error: "Este e-mail já enviou um cadastro por este link." },
      { status: 409 },
    );
  }

  const customAnswers: Record<string, string> = {};
  for (const field of ministry.extraFields) {
    const value = clean(form.get(`extra:${field.id}`), 500);
    if (field.required && !value) {
      return Response.json({ error: `Preencha “${field.label}”.` }, { status: 400 });
    }
    if (value) customAnswers[field.id] = value;
  }

  const photoUrl = "";

  const passwordData = await hashPassword(senha);
  const marker = JSON.stringify({ origem: 'LINK_CADASTRO_MEMBROS', operacao: secureToken() });
  const cpfHash = await privateHash('cpf', cpf);
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO usuarios(nome,email,perfil,permissoes,senha_hash,senha_salt,titulo_eclesiastico,ativo,cadastro_dados)
        SELECT ?,?,'LEITURA','',?,?,'MEMBRO',1,? FROM links_cadastro_membros l
        JOIN comunidades c ON c.id=l.comunidade_origem_id AND c.proprietario_usuario_id=l.criado_por AND c.status='ATIVA'
        JOIN ministerios_comunidade m ON m.id=? AND m.comunidade_id=c.id AND m.status='ATIVO'
        WHERE l.id=? AND c.id=? AND l.status='ATIVO' AND datetime(l.abre_em)<=CURRENT_TIMESTAMP AND datetime(l.fecha_em)>CURRENT_TIMESTAMP AND l.usos<l.max_usos`)
        .bind(fullName,email,passwordData.hash,passwordData.salt,marker,ministry.id,registration.id,community.id),
      db.prepare(`INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) SELECT id,?,? FROM usuarios WHERE email=? AND cadastro_dados=?`).bind(cpfHash,cpf.slice(-2),email,marker),
      db.prepare(`INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) SELECT id,?,'MEMBRO','ATIVO' FROM usuarios WHERE email=? AND cadastro_dados=?`).bind(community.id,email,marker),
      db.prepare(`INSERT INTO cadastros_membros_temporarios(link_id,comunidade_id,ministerio_id,nome_completo,email,cpf,cep,data_nascimento,uncao,foto_url,ministerio_dados,status)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,'PENDENTE' WHERE EXISTS(SELECT 1 FROM usuarios WHERE email=? AND cadastro_dados=?)`)
        .bind(registration.id,community.id,ministry.id,fullName,email,'***.***.***-'+cpf.slice(-2),cep,birthDate,anointing,photoUrl,
          JSON.stringify({functionId:ministryFunction?.id||null,functionName:ministryFunction?.name||'',availableDays:[...new Set(days)],preferredPeriod:period||'FLEXIVEL',customAnswers}),email,marker),
      db.prepare(`UPDATE links_cadastro_membros SET usos=usos+1 WHERE id=? AND EXISTS(SELECT 1 FROM usuarios WHERE email=? AND cadastro_dados=?)`).bind(registration.id,email,marker),
      db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT ?,id,'CADASTRO_POR_LINK','SUCESSO',? FROM usuarios WHERE email=? AND cadastro_dados=?`).bind(community.id,JSON.stringify({linkId:registration.id}),email,marker),
    ]);
    if (!result[0].meta.changes) return Response.json({error:'O link não está mais disponível.'},{status:409});
    return Response.json({submitted:true,accountCreated:true,membershipCreated:true,redirect:'/login'},{status:201,headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({error:'Não foi possível concluir. Confira seus dados ou solicite à comunidade a revisão dos limites.'},{status:409});
  }
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}
function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function positiveInteger(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
