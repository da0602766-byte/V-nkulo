import { getD1 } from "../../../../db";
import { normalizeEmail, sha256 } from "../../../lib/local-auth";
import { requireTenantPermission } from "../../../lib/tenant";

const MAX_ACTIVE_INVITES = 10;
const INVITE_DURATION_HOURS = 48;

export async function GET() {
  const access = await requireTenantPermission("invites.manage");
  if ("error" in access) return access.error;
  const result = await getD1()
    .prepare(
      `SELECT id, email, papel, status, expira_em, criado_em
      FROM convites_comunidade
      WHERE comunidade_id = ?
      ORDER BY id DESC LIMIT 20`,
    )
    .bind(access.context.comunidadeId)
    .all<{
      id: number;
      email: string;
      papel: string;
      status: string;
      expira_em: string;
      criado_em: string;
    }>();
  return Response.json({
    invites: result.results.map((invite) => ({
      ...invite,
      email: maskEmail(invite.email),
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("invites.manage");
  if ("error" in access) return access.error;
  const payload = await request.json().catch(() => null) as { email?: string; papel?: string; horas?: number } | null;
  if (!payload || typeof payload.email !== 'string') return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
  const email = normalizeEmail(payload.email);
  const papel = String(payload.papel || "MEMBRO").toUpperCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!['MEMBRO','LIDER','ADMIN_COMUNIDADE'].includes(papel) || (papel !== 'MEMBRO' && !access.context.isCommunityOwner && !access.context.isOwner)) {
    return Response.json(
      {
        error:
          "Somente o proprietário pode convidar líderes ou administradores da comunidade.",
      },
      { status: 403 },
    );
  }

  const db = getD1();
  const hours = payload.horas === undefined ? INVITE_DURATION_HOURS : Number(payload.horas);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return Response.json({error:'Defina uma validade de 1 a 168 horas.'},{status:400});
  const token = randomHex(32);
  const expiresAt = new Date(
    Date.now() + hours * 60 * 60 * 1000,
  ).toISOString();
  const tokenHash = await sha256(token);
  const emailHash = await sha256(email);
  // D1 executes the batch atomically: concurrent requests cannot both consume
  // the last slot or leave multiple active links for the same recipient.
  const result = await db.batch([
    db.prepare(`UPDATE convites_comunidade SET status='EXPIRADO'
      WHERE comunidade_id=? AND status='PENDENTE'
        AND (email=? OR datetime(expira_em)<=CURRENT_TIMESTAMP)`)
      .bind(access.context.comunidadeId, email),
    db.prepare(`INSERT INTO convites_comunidade
      (comunidade_id,email,papel,token_hash,status,expira_em,criado_por)
      SELECT ?,?,?,?,'PENDENTE',?,?
      WHERE (SELECT COUNT(*) FROM convites_comunidade
        WHERE comunidade_id=? AND status='PENDENTE'
          AND datetime(expira_em)>CURRENT_TIMESTAMP) < ? RETURNING id`)
      .bind(access.context.comunidadeId, email, papel, tokenHash, expiresAt,
        access.user.id, access.context.comunidadeId, MAX_ACTIVE_INVITES),
    db.prepare(`INSERT INTO auditoria_piloto
      (comunidade_id,usuario_id,evento,resultado,metadados)
      SELECT comunidade_id,?,'CONVITE_MEMBRO_CRIADO','SUCESSO',
        json_object('conviteId',id,'emailHash',?,'papel',papel)
      FROM convites_comunidade WHERE comunidade_id=? AND token_hash=?`)
      .bind(access.user.id, emailHash, access.context.comunidadeId, tokenHash),
  ]);
  if (!result[1].results?.length) {
    return Response.json({ error: 'Limite temporário de convites pendentes atingido.' }, { status: 429 });
  }
  return Response.json(
    {
      ok: true,
      inviteUrl: new URL(`/convite/${token}`, request.url).toString(),
      expiresAt,
      warning:
        "O link é exibido uma única vez e deve ser compartilhado com cuidado.",
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const access=await requireTenantPermission('invites.manage'); if('error' in access) return access.error;
  const body=await request.json().catch(()=>null); const id=Number(body?.id);
  if(!Number.isSafeInteger(id)||id<1) return Response.json({error:'Convite inválido.'},{status:400});
  const db=getD1(); const result=await db.batch([
    db.prepare(`UPDATE convites_comunidade SET status='REVOGADO' WHERE id=? AND comunidade_id=? AND status='PENDENTE'`).bind(id,access.context.comunidadeId),
    db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT ?,?,'CONVITE_REVOGADO','SUCESSO',? WHERE changes()=1`).bind(access.context.comunidadeId,access.user.id,JSON.stringify({conviteId:id})),
  ]);
  return result[0].meta.changes ? Response.json({ok:true}) : Response.json({error:'Convite pendente não encontrado.'},{status:404});
}

function randomHex(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

