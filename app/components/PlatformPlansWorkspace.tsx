"use client";

import TransientFeedback from "./TransientFeedback";

import { useCallback, useEffect, useState } from "react";
import type { LandingPlan } from "../lib/platform-plans";
import { useTransientMessage } from "../lib/use-transient-message";

export default function PlatformPlansWorkspace() {
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useTransientMessage();
  const [loadError, setLoadError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/pilot/platform-plans", { cache: "no-store" });
      const result = await response.json() as { plans?: LandingPlan[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os planos.");
      if (!Array.isArray(result.plans)) throw new Error("A fonte de planos não retornou uma configuração válida.");
      setPlans(result.plans);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function update(index: number, key: keyof LandingPlan, value: string | boolean | string[]) {
    setPlans((current) => current.map((plan, planIndex) => planIndex === index ? { ...plan, [key]: value } : plan));
  }

  function addPlan() {
    setSelectedPlan(plans.length);
    setPlans((current) => [...current, { name: "", price: "", period: "", description: "", items: [], cta: "", featured: false, contact: false }]);
  }

  async function save() {
    const invalidIndex = plans.findIndex(plan => !plan.name.trim() || !plan.price.trim() || !plan.cta.trim());
    if (invalidIndex >= 0) { setSelectedPlan(invalidIndex); setMessage(`Preencha nome, preço exibido e texto do botão do plano ${invalidIndex + 1}.`); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/platform-plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans }) });
      const result = await response.json() as { plans?: LandingPlan[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar os planos.");
      if (result.plans) setPlans(result.plans);
      setMessage("Configuração de planos salva com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar os planos.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="owner-loading">Carregando configuração real dos planos…</div>;
  if (!plans.length) return <section className="owner-plans-workspace"><header className="owner-plans-hero"><div><p className="pilot-kicker">CONFIGURAÇÃO COMERCIAL</p><p>Cadastre somente condições comerciais definidas por você.</p></div></header><div className="owner-plans-empty"><span aria-hidden="true">◇</span><strong>{loadError ? "Planos indisponíveis" : "Nenhum plano configurado"}</strong><p>{loadError || "Não há planos salvos na fonte atual. Nenhum preço ou benefício padrão foi usado para preencher esta tela."}</p>{loadError ? <button type="button" onClick={() => void load()}>Tentar novamente</button> : <button type="button" onClick={addPlan}>Cadastrar primeiro plano</button>}</div></section>;

  const plan = plans[Math.min(selectedPlan, plans.length - 1)];

  return <form className="owner-plans-workspace" aria-label="Configuração comercial de planos" onSubmit={event => { event.preventDefault(); void save(); }}>
    <header className="owner-plans-hero"><div><p className="pilot-kicker">CONFIGURAÇÃO COMERCIAL</p><p>Edite a configuração carregada da fonte oficial. As alterações só entram em vigor após salvar.</p></div><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</button></header>
    <div className="owner-plans-source"><span aria-hidden="true">i</span><p>Somente configurações salvas são carregadas. Novos planos começam em branco e só são gravados após salvar.</p></div>
    {message && <TransientFeedback className="operations-feedback" role="status">{message}</TransientFeedback>}
    <div className="owner-plans-catalog">
      <aside className="owner-plan-index" aria-label="Planos disponíveis"><header><strong>Planos disponíveis</strong><small>Selecione para editar</small></header>{plans.map((item, index) => <button type="button" key={`plan-index-${index}`} className={selectedPlan === index ? "active" : ""} onClick={() => setSelectedPlan(index)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.name || "Sem nome"}</strong><small>{item.price}{item.period || ""}</small></div><i>{item.featured ? "Destaque" : "Editar"}</i></button>)}</aside>
      <article className="owner-plan-card owner-plan-editor" key={`plan-${selectedPlan}`}>
      <header><div><small>PLANO {String(selectedPlan + 1).padStart(2, "0")}</small><h3>{plan.name || "Sem nome"}</h3></div><label className="owner-plan-toggle"><input type="checkbox" checked={Boolean(plan.featured)} onChange={(event) => update(selectedPlan, "featured", event.target.checked)} /><span />Destacar na página</label></header>
      <fieldset className="owner-plans-grid" disabled={saving}><legend className="oc-sr-only">Dados comerciais do plano {selectedPlan + 1}</legend>
        <label>Nome do plano<input type="text" required autoComplete="off" placeholder="Nome comercial definido para este plano" value={plan.name} maxLength={50} onChange={(event) => update(selectedPlan, "name", event.target.value)} /></label>
        <label>Preço exibido<input type="text" required placeholder="Valor ou condição comercial definida" value={plan.price} maxLength={50} onChange={(event) => update(selectedPlan, "price", event.target.value)} /></label>
        <label>Período<input type="text" value={plan.period || ""} maxLength={20} placeholder="Ex.: /mês" onChange={(event) => update(selectedPlan, "period", event.target.value)} /></label>
        <label className="wide">Descrição<textarea value={plan.description} maxLength={180} rows={3} onChange={(event) => update(selectedPlan, "description", event.target.value)} /></label>
        <label className="wide">Benefícios <small>Um item por linha</small><textarea value={plan.items.join("\n")} maxLength={800} rows={6} onChange={(event) => update(selectedPlan, "items", event.target.value.split("\n"))} /></label>
        <label className="wide">Texto do botão<input type="text" required placeholder="Ação disponível para este plano" value={plan.cta} maxLength={70} onChange={(event) => update(selectedPlan, "cta", event.target.value)} /></label>
      </fieldset>
      </article>
    </div>
    <div className="owner-plans-savebar"><span>{plans.length} {plans.length === 1 ? "plano em edição" : "planos em edição"}</span><button type="button" className="owner-plans-add" onClick={addPlan} disabled={saving || plans.length >= 12}>Adicionar plano</button><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</button></div>
  </form>;
}
