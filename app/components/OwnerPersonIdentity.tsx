type Row = Record<string, unknown>;
const parseRows = (value: unknown): Row[] => {
  try { const rows = JSON.parse(String(value || "[]")); return Array.isArray(rows) ? rows.filter(row => row && typeof row === "object") : []; } catch { return []; }
};
const label = (value: unknown) => String(value || "Não informado").toLowerCase().replaceAll("_", " ");
export function ownerPersonKind(person: Row) {
  const roles = parseRows(person.vinculos_detalhes).filter(row => row.status === "ATIVO");
  const subscriber = parseRows(person.assinaturas_detalhes).some(row => Number(row.vigente) === 1);
  const kinds = [person.system_owner ? "Proprietário do sistema" : "", subscriber ? "Assinante responsável" : "",
    roles.some(row => row.papel === "MEMBRO") ? "Membro" : "",
    roles.some(row => row.papel !== "MEMBRO") ? "Equipe / liderança" : ""].filter(Boolean);
  return kinds.join(" · ") || (person.comunidades_responsavel ? "Responsável por comunidade · sem assinatura vigente" : "Cadastro sem vínculo ativo");
}
export default function OwnerPersonIdentity({person}: {person: Row}) {
  const memberships = parseRows(person.vinculos_detalhes), subscriptions = parseRows(person.assinaturas_detalhes);
  return <div className="owner-person-identity">
    <strong>{ownerPersonKind(person)}</strong>
    <span>Conta #{String(person.id)} · {Number(person.ativo) === 1 ? "Ativa" : "Inativa"}</span>
    <span>{String(person.email || person.telefone || "Contato não informado")}</span>
    <dl><div><dt>Vínculos e funções</dt><dd>{memberships.length ? memberships.map((row,i) => <span key={i}>{String(row.nome)} · {label(row.papel)} · {label(row.status)}</span>) : "Sem vínculo com comunidade"}</dd></div>
      <div><dt>Assinaturas sob responsabilidade</dt><dd>{subscriptions.length ? subscriptions.map((row,i) => <span key={i}>{String(row.nome)} · {String(row.plano)} · {Number(row.vigente) ? "vigente" : label(row.status) === "ativa" ? "prazo encerrado" : label(row.status)}</span>) : "Nenhuma assinatura sob responsabilidade desta pessoa"}</dd></div>
      {person.comunidades_responsavel ? <div><dt>Responsável por</dt><dd>{String(person.comunidades_responsavel)}</dd></div> : null}
    </dl>
  </div>;
}
