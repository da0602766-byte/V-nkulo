"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./member-registration-ux.css";
import type { MemberRegistrationFormData } from "../lib/member-registration";

const DAYS = [
  ["DOM", "Domingo"], ["SEG", "Segunda"], ["TER", "Terça"],
  ["QUA", "Quarta"], ["QUI", "Quinta"], ["SEX", "Sexta"], ["SAB", "Sábado"],
] as const;

type Values = {
  fullName: string;
  email: string;
  cpf: string;
  senha: string;
  cep: string;
  birthDate: string;
  communityId: string;
  anointing: string;
  ministryId: string;
  functionId: string;
  availableDays: string[];
  period: string;
  extras: Record<string, string>;
  acceptedTerms: boolean;
};

export default function MemberRegistrationForm({
  token,
  registration,
}: {
  token: string;
  registration: MemberRegistrationFormData;
}) {
  const initialCommunity = registration.communities[0];
  const [values, setValues] = useState<Values>({
    fullName: "", email: "", cpf: "", senha: "", cep: "", birthDate: "",
    communityId: initialCommunity ? String(initialCommunity.id) : "",
    anointing: initialCommunity?.anointings[0]?.id || "",
    ministryId: initialCommunity?.ministries[0] ? String(initialCommunity.ministries[0].id) : "",
    functionId: "", availableDays: [], period: "FLEXIVEL", extras: {}, acceptedTerms: false,
  });
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const sendingRef = useRef(false);
  const [clockStart] = useState(() => Date.now());
  const reloaded = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const reviewedOnce = useRef(false);
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(registration.state === "AGUARDANDO" ? registration.opensAt : registration.closesAt) - registration.serverNow));

  const community = useMemo(
    () => registration.communities.find((item) => String(item.id) === values.communityId),
    [registration.communities, values.communityId],
  );
  const ministry = useMemo(
    () => community?.ministries.find((item) => String(item.id) === values.ministryId),
    [community, values.ministryId],
  );
  useEffect(() => {
    if (registration.state !== "AGUARDANDO" && registration.state !== "ABERTO") return;
    const timer = window.setInterval(() => {
      const target = Date.parse(registration.state === "AGUARDANDO" ? registration.opensAt : registration.closesAt);
      const next = Math.max(0, target - (registration.serverNow + Date.now() - clockStart));
      setRemaining(next);
      if (!next && registration.state === "AGUARDANDO" && !reloaded.current) {
        reloaded.current = true;
        window.location.reload();
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [registration, clockStart]);
  useEffect(() => {
    if (reviewing) { reviewedOnce.current = true; reviewHeading.current?.focus(); }
    else if (reviewedOnce.current) formHeading.current?.focus();
  }, [reviewing]);
  const expired = remaining <= 0;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function chooseCommunity(id: string) {
    const next = registration.communities.find((item) => String(item.id) === id);
    setValues((current) => ({
      ...current,
      communityId: id,
      anointing: next?.anointings[0]?.id || "",
      ministryId: next?.ministries[0] ? String(next.ministries[0].id) : "",
      functionId: "",
      extras: {},
    }));
  }
  async function submit() {
    if (sendingRef.current || expired || !values.acceptedTerms) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        if (key === "availableDays" || key === "extras") return;
        body.set(key, String(value));
      });
      values.availableDays.forEach((day) => body.append("availableDays", day));
      Object.entries(values.extras).forEach(([id, value]) => body.set(`extra:${id}`, value));
      const response = await fetch(`/api/public/cadastro-membro/${token}`, { method: "POST", body });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o cadastro.");
      setSubmitted(true);
    } catch (submissionError) {
      setError((submissionError as Error).message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (registration.state !== "ABERTO") {
    return <main className="member-registration-public"><section className="member-registration-state"><span aria-hidden="true">V+</span><p>CADASTRO DE MEMBROS</p><h1>{registration.title}</h1><strong>{registration.state === "AGUARDANDO" ? "O formulário ainda não abriu" : registration.state === "ENCERRADO" ? "O período de cadastro terminou" : "Este formulário foi cancelado"}</strong>{registration.state === "AGUARDANDO" && <><time>{formatDate(registration.opensAt)}</time><em>{formatRemaining(remaining)}</em></>}<small>As opções são carregadas somente das comunidades pertencentes ao criador deste link.</small></section></main>;
  }
  if (submitted) {
    return <main className="member-registration-public"><section className="member-registration-success"><span aria-hidden="true">✓</span><h1>Seu cadastro foi concluído.</h1><p>Entre com seu CPF e a senha que você criou para acessar a comunidade.</p><a className="member-registration-login" href="/login">Entrar no Vínkulo →</a></section></main>;
  }

  return (
    <main className="member-registration-public">
      <header className="member-registration-public-head"><span aria-hidden="true">V+</span><div><p>VÍNKULO · CADASTRO TEMPORÁRIO</p><h1>{registration.title}</h1><small>Aberto até {formatDate(registration.closesAt)} · {formatRemaining(remaining)}</small></div></header>
      {expired && <p className="member-registration-feedback" role="alert">O prazo deste convite terminou. Seu preenchimento permanece nesta página, mas não pode mais ser enviado. Solicite um novo convite à comunidade.</p>}
      {!reviewing ? (
        <form method="post" className="member-registration-public-form" onSubmit={(event) => { event.preventDefault(); if (expired) return; setError(""); setReviewing(true); }}>
          <p className="member-registration-required">Os campos com * são obrigatórios. Você poderá revisar tudo antes de enviar.</p>
          <section><header><b>01</b><div><h2 ref={formHeading} tabIndex={-1}>Seus dados e sua conta</h2><p>Preencha o cadastro e crie o acesso que você usará na comunidade.</p></div></header><div className="member-registration-fields">
            <div className="member-registration-photo member-registration-photo-private"><span aria-hidden="true">☁</span><strong>Foto após o primeiro acesso <small>A imagem será salva no seu Google Drive ou somente no aparelho; nunca no Vínkulo.</small></strong></div>
            <label>Nome completo*<input required minLength={5} maxLength={120} value={values.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" /></label>
            <label>E-mail*<input required type="email" maxLength={180} value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" /></label>
            <label>CPF*<input required inputMode="numeric" maxLength={14} value={values.cpf} onChange={(event) => update("cpf", event.target.value)} /></label>
            <label>Crie sua senha*<input required type="password" minLength={8} maxLength={256} autoComplete="new-password" value={values.senha} onChange={event=>update('senha',event.target.value)}/><small>Use pelo menos 8 caracteres, incluindo letras e números.</small></label>
            <label>CEP*<input required inputMode="numeric" pattern="[0-9. -]{8,10}" maxLength={10} value={values.cep} onChange={(event) => update("cep", event.target.value)} autoComplete="postal-code" /></label>
            <label>Data de nascimento*<input required type="date" max={new Date().toISOString().slice(0, 10)} value={values.birthDate} onChange={(event) => update("birthDate", event.target.value)} /></label>
            <label className="member-registration-consent member-registration-wide"><input required type="checkbox" checked={values.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} /><span>Concordo com os <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>. Os documentos abrem em outra aba.</span></label>
          </div></section>
          <section><header><b>02</b><div><h2>Comunidade e unção</h2><p>Cadastro vinculado à comunidade que emitiu o link.</p></div></header><div className="member-registration-fields">
            <label>Comunidade*<select required value={values.communityId} onChange={(event) => chooseCommunity(event.target.value)}>{registration.communities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Unção*<select required value={values.anointing} onChange={(event) => update("anointing", event.target.value)}>{community?.anointings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div></section>
          <section><header><b>03</b><div><h2>Ministério</h2><p>Funções e disponibilidade vêm do cadastro da comunidade escolhida.</p></div></header><div className="member-registration-fields">
            <label>Ministério*<select required value={values.ministryId} onChange={(event) => { update("ministryId", event.target.value); update("functionId", ""); update("extras", {}); }}><option value="" disabled>Selecione</option>{community?.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {Boolean(ministry?.functions.length) && <label>Função de interesse<select value={values.functionId} onChange={(event) => update("functionId", event.target.value)}><option value="">A definir com a liderança</option>{ministry?.functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            <fieldset className="member-registration-days"><legend>Dias disponíveis</legend>{DAYS.map(([id, label]) => <label key={id}><input type="checkbox" checked={values.availableDays.includes(id)} onChange={(event) => update("availableDays", event.target.checked ? [...values.availableDays, id] : values.availableDays.filter((day) => day !== id))} />{label}</label>)}</fieldset>
            <label>Período preferido<select value={values.period} onChange={(event) => update("period", event.target.value)}><option value="FLEXIVEL">Flexível</option><option value="MANHA">Manhã</option><option value="TARDE">Tarde</option><option value="NOITE">Noite</option></select></label>
            {ministry?.extraFields.map((field) => <label className="member-registration-wide" key={field.id}>{field.label}{field.required ? "*" : ""}<input required={field.required} maxLength={500} value={values.extras[field.id] || ""} onChange={(event) => update("extras", { ...values.extras, [field.id]: event.target.value })} /></label>)}
            {!community?.ministries.length && <p className="member-registration-empty">Esta comunidade ainda não possui ministérios disponíveis.</p>}
          </div></section>
          {error && <p className="member-registration-feedback" role="alert">{error}</p>}
          <button className="member-registration-primary" disabled={!ministry || !values.acceptedTerms || expired}>Revisar cadastro e conta <span aria-hidden="true">→</span></button>
        </form>
      ) : (
        <section className="member-registration-review"><header><p>REVISÃO FINAL</p><h2 ref={reviewHeading} tabIndex={-1}>Confira antes de criar sua conta</h2><span>Ao confirmar, sua conta será criada nesta comunidade. Use CPF e senha para entrar.</span></header><dl><div><dt>Nome</dt><dd>{values.fullName}</dd></div><div><dt>E-mail</dt><dd>{values.email}</dd></div><div><dt>CPF</dt><dd>{`***.***.***-${values.cpf.replace(/\D/g, "").slice(-2)}`}</dd></div><div><dt>CEP</dt><dd>{values.cep}</dd></div><div><dt>Nascimento</dt><dd>{formatSimpleDate(values.birthDate)}</dd></div><div><dt>Comunidade</dt><dd>{community?.name}</dd></div><div><dt>Unção</dt><dd>{community?.anointings.find((item) => item.id === values.anointing)?.name}</dd></div><div><dt>Ministério</dt><dd>{ministry?.name}</dd></div><div><dt>Função de interesse</dt><dd>{ministry?.functions.find((item) => String(item.id) === values.functionId)?.name || "A definir com a liderança"}</dd></div><div><dt>Período preferido</dt><dd>{{ FLEXIVEL: "Flexível", MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite" }[values.period] || values.period}</dd></div>{ministry?.extraFields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{values.extras[field.id] || "Não informado"}</dd></div>)}<div><dt>Dias disponíveis</dt><dd>{values.availableDays.length ? values.availableDays.map((day) => DAYS.find(([id]) => id === day)?.[1]).join(", ") : "A combinar"}</dd></div></dl>{error && <p className="member-registration-feedback" role="alert">{error}</p>}<footer><button type="button" disabled={sending} onClick={() => setReviewing(false)}>← Editar informações</button><button type="button" disabled={sending || expired} onClick={() => void submit()}>{sending ? "Criando cadastro…" : "Concluir meu cadastro"}</button></footer></section>
      )}
      <footer className="member-registration-privacy">As informações ficam restritas à gestão autorizada da comunidade.</footer>
    </main>
  );
}

function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function formatSimpleDate(value: string) { if (!value) return "—"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function formatRemaining(milliseconds: number) { const seconds = Math.ceil(milliseconds / 1000); const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60); return `${days ? `${days}d ` : ""}${hours}h ${minutes}min`; }
