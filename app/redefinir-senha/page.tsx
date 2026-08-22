import PasswordSetupForm from "../components/PasswordSetupForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || "";
  return <main className="setup-page"><section className="setup-card"><span className="setup-mark">V+</span><p className="login-kicker">VÍNKULO · SEGURANÇA</p><h1>Criar uma nova senha</h1><p>Este link é pessoal, pode ser usado apenas uma vez e expira em 30 minutos.</p>{token ? <PasswordSetupForm endpoint="/api/auth/redefinir-senha" token={token} /> : <div className="login-feedback">Link de redefinição ausente.</div>}</section></main>;
}
