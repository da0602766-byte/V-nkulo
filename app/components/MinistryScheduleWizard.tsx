"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

const STEPS = [
  ["Identificação", "Como vamos chamar esta escala?", "Dê um nome claro para identificar facilmente a escala."],
  ["Equipes", "Quais equipes participam?", "Selecione as equipes e defina a atuação de cada uma."],
  ["Responsabilidades", "Quem lidera e quem serve?", "Defina o responsável, os integrantes e as tarefas da escala."],
  ["Data e Duração", "Quando acontece?", "Configure o início e o término. A disponibilidade será conferida para esse período."],
  ["Local", "Onde será realizado?", "Informe o espaço e confira os pontos de encontro das equipes."],
  ["Revisão", "Tudo pronto para salvar?", "Revise a escala, o repertório e a forma de publicação."],
];

type Props = {
  sections: ReactNode[];
  teams: { nome: string; total: number; funcao: string; encontro: string }[];
  people: number;
  tasks: number;
  materials: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export default function MinistryScheduleWizard({ sections, teams, people, tasks, materials, busy, error, onClose, onSubmit }: Props) {
  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [responsible, setResponsible] = useState("Não definido");
  const [validation, setValidation] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const finalSubmit = useRef<HTMLButtonElement>(null);
  const proceed = useRef(false);
  const dirty = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  function readValues() {
    if (!form.current) return;
    setValues(Object.fromEntries([...new FormData(form.current)].map(([key, value]) => [key, String(value)])));
    setResponsible(form.current.querySelector<HTMLSelectElement>('[name="responsavelUsuarioId"]')?.selectedOptions[0]?.text || "Não definido");
  }

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    readValues();
    heading.current?.focus();
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("beforeunload", guard);
      previousFocus.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (confirm || discard) form.current?.querySelector<HTMLButtonElement>(".ministry-wizard-confirm button")?.focus();
  }, [confirm, discard]);

  function goTo(next: number) {
    readValues();
    setValidation("");
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function close() {
    if (busy) return;
    if (dirty.current || teams.length || people || tasks || materials) { setDiscard(true); return; }
    onClose();
  }

  function next() {
    const current = new FormData(form.current!);
    const start = String(current.get("iniciaEm") || "");
    const end = String(current.get("terminaEm") || "");
    readValues();
    if (step === 0 && !String(current.get("titulo") || "").trim()) {
      setValidation("Informe o título da escala para continuar.");
      form.current?.querySelector<HTMLInputElement>('[name="titulo"]')?.focus();
      return;
    }
    if (step === 3 && (!start || !end || Date.parse(end) <= Date.parse(start))) {
      setValidation("Informe um início e um término posterior ao início.");
      return;
    }
    goTo(Math.min(5, step + 1));
  }

  function invalidField() {
    const invalid = form.current?.querySelector<HTMLInputElement>("input:invalid, select:invalid, textarea:invalid");
    if (!invalid) return false;
    const section = invalid.closest<HTMLElement>("[data-wizard-step]");
    if (section) setStep(Number(section.dataset.wizardStep));
    setValidation(invalid.validationMessage || "Revise os campos obrigatórios.");
    requestAnimationFrame(() => invalid.focus());
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || invalidField()) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const draft = submitter?.value === "RASCUNHO";
    const data = new FormData(event.currentTarget);
    if (!draft && data.get("status") !== "RASCUNHO" && !proceed.current) {
      if (!people || !Number(data.get("responsavelUsuarioId"))) {
        setStep(2);
        setValidation("Escolha um responsável e pelo menos um integrante antes de publicar.");
        return;
      }
      setConfirm(true);
      return;
    }
    proceed.current = false;
    setConfirm(false);
    await onSubmit(event);
    readValues();
  }

  const completion = [Boolean(values.titulo?.trim()), teams.length > 0 || people > 0, people > 0 && Boolean(values.responsavelUsuarioId), Boolean(values.iniciaEm && values.terminaEm), Boolean(values.local?.trim())];
  const progress = Math.round(completion.filter(Boolean).length / 5 * 100);
  const date = (value?: string) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Não definido";

  return <div className="ministry-wizard" role="dialog" aria-modal="true" aria-labelledby="ministry-wizard-title" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); if (discard) setDiscard(false); else if (confirm) setConfirm(false); else close(); }
    if (event.key === "Tab") {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length > 0 && !item.closest("[inert]"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <form ref={form} noValidate onSubmit={submit} onInputCapture={() => { dirty.current = true; readValues(); }} onChange={() => { dirty.current = true; readValues(); }}>
      <header className="ministry-wizard-header" inert={confirm || discard}>
        <div className="ministry-wizard-identity"><button type="button" onClick={close} aria-label="Fechar criação da escala">‹</button><div><small>Nova escala</small><strong>{values.titulo || "Sem título"}</strong></div></div>
        <nav aria-label="Etapas da escala">{STEPS.map(([label], index) => <button type="button" key={label} className={step === index ? "active" : completion[index] ? "complete" : ""} onClick={() => goTo(index)} aria-current={step === index ? "step" : undefined}><b>{completion[index] && index < step ? "✓" : index + 1}</b>{label}</button>)}</nav>
        <div className="ministry-wizard-header-actions"><button type="submit" name="intent" value="RASCUNHO" disabled={busy}>Salvar rascunho</button><button type="button" onClick={() => setSummary(!summary)} aria-label={summary ? "Ocultar resumo" : "Mostrar resumo"} aria-pressed={summary}>▥</button></div>
      </header>
      <div className="ministry-wizard-progress"><div style={{ width: `${step / 5 * 100}%` }} /></div>
      <div className={`ministry-wizard-body ${summary ? "" : "without-summary"}`} inert={confirm || discard}>
        <main className="ministry-wizard-main">
          <div className="ministry-wizard-step-heading"><p><b>{step + 1} / 6</b><span>{STEPS[step][0]}</span></p><h2 ref={heading} tabIndex={-1} id="ministry-wizard-title">{STEPS[step][1]}</h2><p>{STEPS[step][2]}</p></div>
          {(validation || error) && <div className="secretary-message error" role="alert">{validation || error}</div>}
          {step === 5 && <section className="ministry-wizard-review"><h3>{values.titulo || "Sem título"}</h3><dl><div><dt>Equipes</dt><dd>{teams.map(team => team.nome).join(" · ") || "Integrantes livres"}</dd></div><div><dt>Responsável</dt><dd>{values.responsavelUsuarioId ? responsible : "Não definido"} · {people} integrante(s)</dd></div><div><dt>Período</dt><dd>{date(values.iniciaEm)} até {date(values.terminaEm)}</dd></div><div><dt>Local</dt><dd>{values.local || "Não definido"}</dd></div></dl></section>}
          {sections.map((content, index) => <section key={index} data-wizard-step={index} hidden={step !== index} aria-label={STEPS[index][0]}>{content}</section>)}
          <footer className="ministry-wizard-footer"><button type="button" disabled={step === 0 || busy} onClick={() => goTo(step - 1)}>‹ Voltar</button>{step < 5 ? <button key="continue" type="button" className="primary" onClick={(event) => { event.preventDefault(); next(); }}>Continuar ›</button> : <button key="submit" ref={finalSubmit} type="submit" className="primary" disabled={busy}>{busy ? "Salvando…" : values.status === "PUBLICADA" ? "Publicar escala" : values.status === "AGENDADA" ? "Agendar publicação" : "Salvar escala"}</button>}</footer>
        </main>
        {summary && <aside className="ministry-wizard-summary"><h3>Resumo</h3>{[
          ["Identificação", values.titulo || "Não preenchido", values.observacoes || ""],
          ["Equipes", teams.length ? `${teams.length} equipe(s)` : people ? "Integrantes livres" : "Nenhuma equipe", teams.map(t => `${t.nome} · ${t.total} integrantes`).join("\n")],
          ["Responsável", values.responsavelUsuarioId ? responsible : "Não definido", `${people} integrante(s) · ${tasks} responsabilidade(s)`],
          ["Data e horário", date(values.iniciaEm), values.terminaEm ? `Até ${date(values.terminaEm)}` : ""],
          ["Local", values.local || "Não definido", teams.map(t => t.encontro).filter(Boolean).join("\n")],
        ].map(([label, value, detail], index) => <button type="button" className={step === index ? "active" : ""} key={label} onClick={() => goTo(index)}><span>{label}<em>{completion[index] ? "✓" : "pendente"}</em></span><strong>{value}</strong>{detail && <small>{detail}</small>}</button>)}<div className="ministry-wizard-completion"><span>Preenchimento<b>{progress}%</b></span><progress max={100} value={progress}/><small>{materials} material(is) · {tasks} tarefa(s)</small></div><p className="ministry-wizard-draft-note">O rascunho só é salvo ao clicar em salvar. Ele não notifica a equipe.</p></aside>}
      </div>
      {confirm && <div className="ministry-wizard-confirm-backdrop"><section className="ministry-wizard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="wizard-confirm-title"><span className="ministry-wizard-confirm-icon">✓</span><h2 id="wizard-confirm-title">{values.status === "AGENDADA" ? "Agendar esta escala?" : "Publicar esta escala?"}</h2><p><strong>{values.titulo}</strong></p><p>{people} integrante(s) em {teams.length || "nenhuma"} equipe(s). {values.status === "AGENDADA" ? `A publicação acontecerá em ${date(values.publicarEm)}.` : "A escala ficará disponível e os integrantes serão notificados."}</p><div><button type="button" onClick={() => setConfirm(false)}>Revisar</button><button type="button" className="primary" disabled={busy} onClick={() => { proceed.current = true; form.current?.requestSubmit(finalSubmit.current || undefined); }}>Confirmar</button></div></section></div>}
      {discard && <div className="ministry-wizard-confirm-backdrop"><section className="ministry-wizard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="wizard-discard-title"><h2 id="wizard-discard-title">Sair sem salvar?</h2><p>As alterações desta escala ainda não foram salvas.</p><div><button type="button" onClick={() => setDiscard(false)}>Continuar editando</button><button type="button" onClick={onClose}>Sair sem salvar</button></div></section></div>}
    </form>
  </div>;
}
