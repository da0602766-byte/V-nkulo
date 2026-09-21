"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LANDING_PLANS, type LandingPlan } from "../lib/platform-plans";

export default function PlatformPlansWorkspace() {
  const [plans, setPlans] = useState<LandingPlan[]>(DEFAULT_LANDING_PLANS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/pilot/platform-plans", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { plans?: LandingPlan[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os planos.");
      setPlans(result.plans || DEFAULT_LANDING_PLANS);
    }).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);
  function update(index: number, key: keyof LandingPlan, value: string | boolean | string[]) {
    setPlans((current) => current.map((plan, planIndex) => planIndex === index ? { ...plan, [key]: value } : plan));
  }
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/pilot/platform-plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans }) });
      const result = await response.json() as { plans?: LandingPlan[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar os planos.");
      setPlans(result.plans || plans); setMessage("Planos publicados na prévia exclusiva do proprietário.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar os planos."); }
    finally { setSaving(false); }
  }
  if (loading) return <div className="owner-loading">Carregando configuração dos planos…</div>;
  return <section className="owner-plans-workspace"><header><div><p className="pilot-kicker">CONFIGURAÇÃO EXCLUSIVA</p><h2>Planos da plataforma</h2><p>Esta área e a prévia dos planos são visíveis somente para você, proprietário do sistema.</p></div><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : "Salvar planos"}</button></header>{message && <p className="operations-feedback" role="status">{message}</p>}<div>{plans.map((plan, index) => <article key={`${plan.name}-${index}`}><header><strong>Plano {index + 1}</strong><label><input type="checkbox" checked={Boolean(plan.featured)} onChange={(event) => update(index, "featured", event.target.checked)} /> Destacar como popular</label></header><div className="owner-plans-grid"><label>Nome<input value={plan.name} maxLength={50} onChange={(event) => update(index, "name", event.target.value)} /></label><label>Preço<input value={plan.price} maxLength={50} onChange={(event) => update(index, "price", event.target.value)} /></label><label>Período<input value={plan.period || ""} maxLength={20} placeholder="/mês" onChange={(event) => update(index, "period", event.target.value)} /></label><label className="wide">Descrição<textarea value={plan.description} maxLength={180} rows={2} onChange={(event) => update(index, "description", event.target.value)} /></label><label className="wide">Itens (um por linha)<textarea value={plan.items.join("\n")} maxLength={800} rows={5} onChange={(event) => update(index, "items", event.target.value.split("\n").filter(Boolean))} /></label><label className="wide">Chamada do botão<input value={plan.cta} maxLength={70} onChange={(event) => update(index, "cta", event.target.value)} /></label></div></article>)}</div></section>;
}
