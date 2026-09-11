import FirstAccessForm from "../components/FirstAccessForm";

export const dynamic = "force-dynamic";

export default async function FirstAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; login?: string }>;
}) {
  const params = await searchParams;
  const token = String(params.token || "");
  const login = String(params.login || "");
  return (
    <main className="setup-page">
      <section className="setup-card first-access-card">
        <span className="setup-mark">V+</span>
        <p className="login-kicker">VÍNKULO · PRIMEIRO ACESSO</p>
        <h1>Proteja sua nova conta</h1>
        <p>Confirme os dados temporários recebidos e crie a senha que você usará nos próximos acessos.</p>
        {token
          ? <FirstAccessForm token={token} login={login} />
          : <div className="login-feedback">Link de primeiro acesso ausente ou incompleto.</div>}
      </section>
    </main>
  );
}
