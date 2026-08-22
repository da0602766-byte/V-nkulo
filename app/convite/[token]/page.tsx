import { notFound } from "next/navigation";
import Link from "../../components/StableLink";
import { getD1 } from "../../../db";
import InviteAcceptanceForm from "../../components/InviteAcceptanceForm";
import { sha256 } from "../../lib/local-auth";

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
      WHERE i.token_hash = ? AND i.status = 'PENDENTE'
        AND datetime(i.expira_em) > CURRENT_TIMESTAMP
      LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<{ email: string; papel: string; comunidade_nome: string }>();
  if (!invite || invite.papel !== "MEMBRO") notFound();
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/">
        <span>V+</span>
        <strong>Vínkulo</strong>
      </Link>
      <section className="pilot-legal-card pilot-invite-card">
        <p className="pilot-kicker">CONVITE SEGURO · VÍNKULO</p>
        <h1>Entre na comunidade</h1>
        <p>
          Este convite é individual, expira automaticamente e concede somente o
          perfil de membro.
        </p>
        <InviteAcceptanceForm
          token={token}
          communityName={invite.comunidade_nome}
          maskedEmail={maskEmail(invite.email)}
        />
        <small>
          Ao continuar, você declara ter lido os <Link href="/termos">Termos de Uso</Link>{" "}
          e a <Link href="/privacidade">Política de Privacidade</Link>.
        </small>
      </section>
    </main>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
