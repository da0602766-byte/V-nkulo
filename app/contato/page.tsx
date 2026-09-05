import Link from "../components/StableLink";
import { CONTACT_EMAILS } from "../lib/contact-emails";

function EmailList() {
  return (
    <>
      {CONTACT_EMAILS.map((email, index) => (
        <span key={email}>
          {index > 0 && " ou "}
          <a href={`mailto:${email}`}>{email}</a>
        </span>
      ))}
    </>
  );
}

export default function ContactPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p>
        <h1>Contato e suporte</h1>
        <p className="legal-updated">Última atualização: 1 de setembro de 2026</p>

        <h2>Suporte</h2>
        <p>
          Para dúvidas sobre sua conta, sua comunidade ou o funcionamento do
          VÍNKULO: <EmailList />.
        </p>

        <h2>Privacidade e Conta Google</h2>
        <p>
          Para dúvidas sobre como o VÍNKULO usa sua Conta Google, o Google
          Drive ou para pedir a exclusão da sua conta e dos seus dados,
          veja a página de <Link href="/exclusao-de-dados">Exclusão de conta e de dados</Link>{" "}
          ou escreva para <EmailList />.
        </p>

        <h2>Responsável pela plataforma</h2>
        <p>
          [Razão social / responsável legal a definir] · [Endereço a
          definir, se exigido pela etapa de verificação do Google]
        </p>

        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
