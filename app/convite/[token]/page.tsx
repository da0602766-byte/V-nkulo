import { notFound } from "next/navigation";
import Link from "../../components/StableLink";
import { getD1 } from "../../../db";
import InviteAcceptanceForm from "../../components/InviteAcceptanceForm";
import { sha256 } from "../../lib/local-auth";
import { AccessShell } from '../../components/AccessPortal';

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getD1()
    .prepare(
      `SELECT i.email, i.papel, c.nome AS comunidade_nome
      FROM convites_comunidade i
      JOIN comunidades c ON c.id = i.comunidade_id
      WHERE i.token_hash = ? AND i.status = 'PENDENTE' AND c.status='ATIVA'
        AND datetime(i.expira_em) > CURRENT_TIMESTAMP
      LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<{ email: string; papel: string; comunidade_nome: string }>();
  if (!invite || !['MEMBRO','LIDER','ADMIN_COMUNIDADE'].includes(invite.papel)) notFound();
  return (
    <AccessShell>
      <Link className="access-back" href="/login">← Voltar ao acesso</Link>
      <section>
        <header className="access-heading"><p className="access-eyebrow">CONVITE SEGURO · VÍNKULO</p>
        <h1>Entre na comunidade</h1>
        <p>
          Este convite é individual e expira automaticamente. O papel concedido é {invite.papel === 'LIDER' ? 'líder' : invite.papel === 'ADMIN_COMUNIDADE' ? 'administrador desta comunidade' : 'membro'}.
        </p></header>
        <InviteAcceptanceForm
          token={token}
          communityName={invite.comunidade_nome}
          maskedEmail={maskEmail(invite.email)}
        />
        <p className="access-private-note">
          Ao continuar, você declara ter lido os <Link href="/termos">Termos de Uso</Link>{" "}
          e a <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>
    </AccessShell>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
