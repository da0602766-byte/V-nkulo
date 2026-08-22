"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PlatformThemePreset } from "../lib/platform-branding";
import NativeImageUpload from "./NativeImageUpload";

const PLATFORM_THEMES: {
  id: PlatformThemePreset;
  name: string;
  description: string;
  colors: [string, string, string];
}[] = [
  { id: "VIOLETA", name: "Violeta", description: "Tecnologia e conexão", colors: ["#0b1740", "#7551f4", "#36cbd0"] },
  { id: "ESMERALDA", name: "Esmeralda", description: "Gestão e crescimento", colors: ["#062c28", "#139b70", "#8ce7c2"] },
  { id: "AURORA", name: "Aurora", description: "Acolhimento e energia", colors: ["#39200d", "#d59026", "#ef7b75"] },
  { id: "GRAFITE", name: "Grafite", description: "Sóbrio e institucional", colors: ["#111827", "#475569", "#d7a94a"] },
];

export default function PlatformBrandingWorkspace() {
  const [siteName, setSiteName] = useState("VÍNKULO");
  const [logoUrl, setLogoUrl] = useState("");
  const [feedBannerUrl, setFeedBannerUrl] = useState("");
  const [themePreset, setThemePreset] =
    useState<PlatformThemePreset>("VIOLETA");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/pilot/platform-branding", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Falha ao carregar identidade.");
        }
        setSiteName(result.branding?.siteName || "VÍNKULO");
        setLogoUrl(result.branding?.logoUrl || "");
        setFeedBannerUrl(result.branding?.feedBannerUrl || "");
        setThemePreset(result.branding?.themePreset || "VIOLETA");
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/platform-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName, logoUrl, feedBannerUrl, themePreset }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Falha ao salvar identidade.");
      }
      setMessage("Identidade e tema da página principal atualizados.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="platform-post-empty">Carregando identidade…</p>;
  return (
    <section className="platform-branding-workspace">
      <header>
        <div>
          <p className="pilot-kicker">IDENTIDADE DA PÁGINA PRINCIPAL</p>
          <h2>Tema público da plataforma</h2>
          <p>
            Defina nome, logo, paleta e banner da plataforma. A leitura é
            preservada nos modos claro, escuro e automático.
          </p>
        </div>
      </header>
      <form onSubmit={save}>
        <div className="platform-branding-identity">
          <label>
            Nome público da plataforma
            <input
              value={siteName}
              maxLength={60}
              required
              onChange={(event) => setSiteName(event.target.value)}
            />
          </label>
          <NativeImageUpload
            label="Logo global da plataforma"
            value={logoUrl}
            purpose="platform-logo"
            onChange={setLogoUrl}
          />
        </div>
        <fieldset className="platform-theme-presets">
          <legend>Paleta da página principal</legend>
          <div>
            {PLATFORM_THEMES.map((theme) => (
              <button
                type="button"
                key={theme.id}
                className={themePreset === theme.id ? "active" : ""}
                aria-pressed={themePreset === theme.id}
                onClick={() => setThemePreset(theme.id)}
              >
                <span aria-hidden="true">
                  {theme.colors.map((color) => <i key={color} style={{ background: color }} />)}
                </span>
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <NativeImageUpload
          label="Banner da página principal"
          value={feedBannerUrl}
          purpose="platform-feed-banner"
          onChange={setFeedBannerUrl}
        />
        {message && <p className="operations-feedback" role="status">{message}</p>}
        <button disabled={saving}>
          {saving ? "Salvando…" : "Salvar página principal"}
        </button>
      </form>
    </section>
  );
}
