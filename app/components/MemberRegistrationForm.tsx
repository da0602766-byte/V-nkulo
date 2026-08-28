"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemberRegistrationFormData } from "../lib/member-registration";

const DAYS = [
  ["DOM", "Domingo"], ["SEG", "Segunda"], ["TER", "Terça"],
  ["QUA", "Quarta"], ["QUI", "Quinta"], ["SEX", "Sexta"], ["SAB", "Sábado"],
] as const;

type Values = {
  fullName: string;
  email: string;
  cpf: string;
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

type FirstAccess = {
  path: string;
  login: string;
  temporaryPassword: string;
  expiresAt: string;
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
    fullName: "", email: "", cpf: "", cep: "", birthDate: "",
    communityId: initialCommunity ? String(initialCommunity.id) : "",
    anointing: initialCommunity?.anointings[0]?.id || "",
    ministryId: initialCommunity?.ministries[0] ? String(initialCommunity.ministries[0].id) : "",
    functionId: "", availableDays: [], period: "FLEXIVEL", extras: {}, acceptedTerms: false,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [firstAccess, setFirstAccess] = useState<FirstAccess | null>(null);
  const [accessCopied, setAccessCopied] = useState(false);
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(registration.state === "AGUARDANDO" ? registration.opensAt : registration.closesAt) - registration.serverNow));

  const community = useMemo(
    () => registration.communities.find((item) => String(item.id) === values.communityId),
    [registration.communities, values.communityId],
  );
  const ministry = useMemo(
    () => community?.ministries.find((item) => String(item.id) === values.ministryId),
    [community, values.ministryId],
  );
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  useEffect(() => {
    if (registration.state !== "AGUARDANDO" && registration.state !== "ABERTO") return;
    const timer = window.setInterval(() => {
      const target = Date.parse(registration.state === "AGUARDANDO" ? registration.opensAt : registration.closesAt);
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (!next) window.location.reload();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [registration]);

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function choosePhoto(file: File | null) {
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
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
      if (photo) body.set("photo", photo);
      const response = await fetch(`/api/public/cadastro-membro/${token}`, { method: "POST", body });
      const result = await response.json() as { error?: string; firstAccess?: FirstAccess };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o cadastro.");
      if (!result.firstAccess) throw new Error("A conta foi criada, mas os dados do primeiro acesso não foram recebidos.");
      setFirstAccess(result.firstAccess);
      setSubmitted(true);
    } catch (submissionError) {
      setError((submissionError as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function copyFirstAccess() {
    if (!firstAccess) return;
    const url = new URL(firstAccess.path, window.location.origin).toString();
    await navigator.clipboard.writeText(
      `VÍNKULO — primeiro acesso\nLink: ${url}\nLogin: ${firstAccess.login}\nSenha temporária: ${firstAccess.temporaryPassword}`,
    );
    setAccessCopied(true);
  }

  if (registration.state !== "ABERTO") {
    return <main className="member-registration-public"><section className="member-registration-state"><span aria-hidden="true">V+</span><p>CADASTRO DE MEMBROS</p><h1>{registration.title}</h1><strong>{registration.state === "AGUARDANDO" ? "O formulário ainda não abriu" : registration.state === "ENCERRADO" ? "O período de cadastro terminou" : "Este formulário foi cancelado"}</strong>{registration.state === "AGUARDANDO" && <><time>{formatDate(registration.opensAt)}</time><em>{formatRemaining(remaining)}</em></>}<small>As opções são carregadas somente das comunidades pertencentes ao criador deste link.</small></section></main>;
  }
  if (submitted && firstAccess) {
    return <main className="member-registration-public"><section className="member-registration-success member-first-access-success"><span aria-hidden="true">✓</span><p>CONTA CRIADA</p><h1>Bem-vindo, {values.fullName.split(" ")[0]}.</h1><strong>Seu primeiro acesso à comunidade {community?.name} está pronto.</strong><small>Guarde estes dados agora. A senha temporária é exibida somente nesta tela e deverá ser substituída ao entrar.</small><dl className="member-first-access-credentials"><div><dt>Login</dt><dd>{firstAccess.login}</dd></div><div><dt>Senha temporária</dt><dd><code>{firstAccess.temporaryPassword}</code></dd></div><div><dt>Validade do link</dt><dd>{formatDate(firstAccess.expiresAt)}</dd></div></dl><div className="member-first-access-actions"><button type="button" onClick={() => void copyFirstAccess()}>{accessCopied ? "Dados copiados" : "Copiar dados de acesso"}</button><a className="member-registration-login" href={firstAccess.path} target="_blank" rel="noreferrer">Criar minha senha e entrar →</a></div></section></main>;
  }

  return (
    <main className="member-registration-public">
      <header className="member-registration-public-head"><span aria-hidden="true">V+</span><div><p>VÍNKULO · CADASTRO TEMPORÁRIO</p><h1>{registration.title}</h1><small>Aberto até {formatDate(registration.closesAt)} · {formatRemaining(remaining)}</small></div></header>
      {!reviewing ? (
        <form className="member-registration-public-form" onSubmit={(event) => { event.preventDefault(); setError(""); setReviewing(true); }}>
          <section><header><b>01</b><div><h2>Seus dados e sua conta</h2><p>Preencha o cadastro e crie o acesso que você usará na comunidade.</p></div></header><div className="member-registration-fields">
            <label className="member-registration-photo"><span>{photoPreview ? <img src={photoPreview} alt="Prévia da foto escolhida" /> : "+"}</span><strong>Foto <small>Opcional</small></strong><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0] || null)} /></label>
            <label>Nome completo*<input required minLength={5} maxLength={120} value={values.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" /></label>
            <label>E-mail*<input required type="email" maxLength={180} value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" /></label>
            <label>CPF <small>Opcional</small><input inputMode="numeric" maxLength={14} value={values.cpf} onChange={(event) => update("cpf", event.target.value)} /></label>
            <label>CEP*<input required inputMode="numeric" pattern="[0-9. -]{8,10}" maxLength={10} value={values.cep} onChange={(event) => update("cep", event.target.value)} autoComplete="postal-code" /></label>
            <label>Data de nascimento*<input required type="date" max={new Date().toISOString().slice(0, 10)} value={values.birthDate} onChange={(event) => update("birthDate", event.target.value)} /></label>
            <label className="member-registration-consent member-registration-wide"><input required type="checkbox" checked={values.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} /><span>Concordo com os Termos de Uso e a Política de Privacidade.</span></label>
          </div></section>
          <section><header><b>02</b><div><h2>Comunidade e unção</h2><p>Somente opções do proprietário deste link.</p></div></header><div className="member-registration-fields">
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
          <button className="member-registration-primary" disabled={!ministry || !values.acceptedTerms}>Revisar cadastro e conta <span aria-hidden="true">→</span></button>
        </form>
      ) : (
        <section className="member-registration-review"><header><p>REVISÃO FINAL</p><h2>Confira antes de criar sua conta</h2><span>Ao confirmar, sua conta será criada e você receberá um link com login e senha temporária para o primeiro acesso.</span></header>{photoPreview && <img src={photoPreview} alt="Foto escolhida" />}<dl><div><dt>Nome</dt><dd>{values.fullName}</dd></div><div><dt>E-mail</dt><dd>{values.email}</dd></div><div><dt>CPF</dt><dd>{values.cpf || "Não informado"}</dd></div><div><dt>CEP</dt><dd>{values.cep}</dd></div><div><dt>Nascimento</dt><dd>{formatSimpleDate(values.birthDate)}</dd></div><div><dt>Comunidade</dt><dd>{community?.name}</dd></div><div><dt>Unção</dt><dd>{community?.anointings.find((item) => item.id === values.anointing)?.name}</dd></div><div><dt>Ministério</dt><dd>{ministry?.name}</dd></div><div><dt>Dias disponíveis</dt><dd>{values.availableDays.length ? values.availableDays.map((day) => DAYS.find(([id]) => id === day)?.[1]).join(", ") : "A combinar"}</dd></div></dl>{error && <p className="member-registration-feedback" role="alert">{error}</p>}<footer><button type="button" onClick={() => setReviewing(false)}>← Editar informações</button><button type="button" disabled={sending} onClick={() => void submit()}>{sending ? "Criando primeiro acesso…" : "Criar conta e gerar primeiro acesso"}</button></footer></section>
      )}
      <footer className="member-registration-privacy">As informações ficam restritas ao proprietário das comunidades exibidas neste formulário.</footer>
    </main>
  );
}

function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function formatSimpleDate(value: string) { if (!value) return "—"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function formatRemaining(milliseconds: number) { const seconds = Math.ceil(milliseconds / 1000); const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60); return `${days ? `${days}d ` : ""}${hours}h ${minutes}min`; }
