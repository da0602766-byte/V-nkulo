import PasswordSetupForm from "../components/PasswordSetupForm";
import {AccessShell} from "../components/AccessPortal";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || "";
  return <AccessShell><header className="access-heading"><p className="access-eyebrow">VÍNKULO · SEGURANÇA</p><h1>Criar uma nova senha</h1><p>Este link é pessoal, pode ser usado apenas uma vez e expira em 30 minutos.</p></header>{token ? <PasswordSetupForm endpoint="/api/auth/redefinir-senha" token={token} /> : <div className="login-feedback">Link de redefinição ausente.</div>}</AccessShell>;
}
