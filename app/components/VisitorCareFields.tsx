"use client";
import { useState } from "react";
import { type VisitorCare, visitorIntegrationGaps } from "../lib/visitor-care";
import "./visitor-care.css";

function Answer({ name, label, value, onChange }: { name: string; label: string; value?: string; onChange?: (value: string) => void }) {
  return <label>{label}<select name={name} defaultValue={value || "NAO_INFORMADO"} onChange={e => onChange?.(e.target.value)}><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>;
}

export function VisitorCareFields({ person = {} }: { person?: VisitorCare }) {
  const [discipulado, setDiscipulado] = useState(person.discipulado);
  const [oficial, setOficial] = useState(person.oficial);
  return <div className="visitor-care-fields visitor-wide-field">
    <fieldset><legend>Integração com a igreja</legend>
      <p>Registre também quem já faz parte da comunidade. A faixa etária é calculada pela data de nascimento.</p>
      <label>Vínculo<select name="tipoPessoa" defaultValue={person.tipo_pessoa || "VISITANTE"}><option value="VISITANTE">Visitante</option><option value="MEMBRO">Membro da igreja</option></select></label>
      <Answer name="certificadoBatismo" label="Recebeu o certificado de batismo?" value={person.certificado_batismo} />
      <Answer name="discipulado" label="Participa de discipulado?" value={person.discipulado} onChange={setDiscipulado} />
      <label>Discipulador ou discipuladora{discipulado === "SIM" ? " *" : ""}<input name="discipulador" maxLength={120} required={discipulado === "SIM"} disabled={discipulado === "NAO"} defaultValue={person.discipulador || ""} placeholder="Nome de quem acompanha" /></label>
      <Answer name="oficial" label="É oficial da igreja?" value={person.oficial} onChange={setOficial} />
      <label>Função na igreja{oficial === "SIM" ? " *" : ""}<input name="funcaoOficial" maxLength={120} required={oficial === "SIM"} disabled={oficial === "NAO"} defaultValue={person.funcao_oficial || ""} placeholder="Ex.: diácono, presbítera" /></label>
    </fieldset>
    <fieldset><legend>Doa a Doa · apoio e doações</legend>
      <Answer name="doaADoa" label="Participa do Doa a Doa?" value={person.doa_a_doa} />
      <Answer name="doaReceber" label="Deve receber apoio?" value={person.doa_receber} />
      <label className="visitor-wide-field">Doações realizadas<textarea name="doacoesRealizadas" rows={3} maxLength={1500} defaultValue={person.doacoes_realizadas || ""} placeholder="Registre data, itens ou valor e o destino de cada doação." /><small>Histórico descritivo de apoio; registre cada entrega em uma nova linha.</small></label>
    </fieldset>
    <fieldset><legend>Plano de acompanhamento</legend>
      <label>Responsável pelo cuidado<input name="responsavelAcompanhamento" maxLength={120} defaultValue={person.responsavel_acompanhamento || ""} placeholder="Pessoa responsável pelo próximo passo" /></label>
      <label>Prazo da próxima ação<input name="dataProximaAcao" type="date" defaultValue={person.data_proxima_acao || ""} /></label>
      <label className="visitor-wide-field">Próxima ação<textarea name="proximaAcao" rows={2} maxLength={300} defaultValue={person.proxima_acao || ""} placeholder="Ex.: apresentar à liderança da célula no próximo domingo" /></label>
    </fieldset>
  </div>;
}

export function VisitorCareSummary({ person }: { person: VisitorCare & { celula_id?: number | null; ministerio?: string | null; batizado?: string } }) {
  const gaps = visitorIntegrationGaps(person);
  const answer = (v?: string) => v === "SIM" ? "Sim" : v === "NAO" ? "Não" : "Não informado";
  return <section className="visitor-care-summary">
    <header><span>INTEGRAÇÃO E CUIDADO</span><h3>O próximo passo começa aqui</h3></header>
    {person.proxima_acao && <div className="visitor-care-next"><strong>{person.proxima_acao}</strong><small>{person.data_proxima_acao ? `Prazo: ${person.data_proxima_acao.split("-").reverse().join("/")}` : "Sem prazo definido"} · {person.responsavel_acompanhamento || "Responsável a definir"}</small></div>}
    {gaps.length > 0 && <ul>{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>}
    <dl>
      <div><dt>Certificado de batismo</dt><dd>{answer(person.certificado_batismo)}</dd></div>
      <div><dt>Discipulado</dt><dd>{answer(person.discipulado)}{person.discipulador && ` · ${person.discipulador}`}</dd></div>
      <div><dt>Doa a Doa</dt><dd>{answer(person.doa_a_doa)} · Receber apoio: {answer(person.doa_receber)}</dd></div>
      <div><dt>Oficial da igreja</dt><dd>{answer(person.oficial)}{person.funcao_oficial && ` · ${person.funcao_oficial}`}</dd></div>
    </dl>
    {person.doacoes_realizadas && <details><summary>Doações realizadas</summary><p className="visitor-preserve-lines">{person.doacoes_realizadas}</p></details>}
  </section>;
}
