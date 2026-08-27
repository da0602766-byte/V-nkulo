"use client";

import { type ReactNode, useState } from "react";

export default function SharedScheduleAccessGate({
  opensAt,
  closesAt,
  children,
}: {
  opensAt: string;
  closesAt: string;
  children: ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);

  if (authorized) return <>{children}</>;

  return (
    <main className="shared-secretary-page shared-secretary-access-gate">
      <section>
        <span className="shared-secretary-brand" aria-hidden="true">V+</span>
        <p className="pilot-kicker">ACESSO TEMPORÁRIO AUTORIZADO</p>
        <h1>Você recebeu acesso a esta escala.</h1>
        <p>
          Este link seguro funciona como sua credencial temporária e libera
          somente a escala compartilhada. Não encaminhe o endereço para outras
          pessoas.
        </p>
        <dl>
          <div><dt>Disponível desde</dt><dd>{formatDate(opensAt)}</dd></div>
          <div><dt>Acesso até</dt><dd>{formatDate(closesAt)}</dd></div>
        </dl>
        <button type="button" onClick={() => setAuthorized(true)}>
          Acessar esta escala
        </button>
        <a className="shared-secretary-signup" href="/login?modo=cadastro">Criar uma conta no Vínkulo</a>
        <small>Nenhum dado de contato será exibido.</small>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
