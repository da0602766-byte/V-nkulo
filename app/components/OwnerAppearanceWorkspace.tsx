"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMMUNITY_PALETTES,
  getCommunityPalette,
  type CommunityPaletteId,
  type CommunityTheme,
} from "../lib/community-theme";
import NativeImageUpload from "./NativeImageUpload";
import { useTransientMessage } from "../lib/use-transient-message";

type CommunitySummary = {
  id: number;
  nome: string;
  cidadePublica: string;
  status: string;
  tema: CommunityTheme;
};

type AparenciaResponse = {
  communities?: CommunitySummary[];
  error?: string;
};

type Scope = "TODAS" | "UNICA";

export default function OwnerAppearanceWorkspace() {
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useTransientMessage();
  const [loadError, setLoadError] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [scope, setScope] = useState<Scope>("UNICA");
  const [communityId, setCommunityId] = useState<number | "">("");
  const [paletteId, setPaletteId] = useState<CommunityPaletteId>("MODERNO");
  const [bulkPaletteId, setBulkPaletteId] = useState<CommunityPaletteId>("MODERNO");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [wallpaperUrl, setWallpaperUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/proprietario/aparencia", { cache: "no-store" });
      const result = (await response.json()) as AparenciaResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar a Central de Aparência.");
      const list = result.communities || [];
      setCommunities(list);
      if (list.length && communityId === "") {
        setCommunityId(list[0].id);
        setPaletteId(list[0].tema.paletteId);
        setLogoUrl(list[0].tema.logoUrl);
        setBannerUrl(list[0].tema.bannerUrl);
        setWallpaperUrl(list[0].tema.wallpaperUrl);
      }
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
    // communityId propositalmente fora das dependências: só usamos o valor
    // inicial para selecionar a primeira comunidade após o primeiro carregamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedCommunity = useMemo(
    () => communities.find((item) => item.id === communityId) || null,
    [communities, communityId],
  );

  function selectCommunity(id: number) {
    setCommunityId(id);
    const community = communities.find((item) => item.id === id);
    if (community) {
      setPaletteId(community.tema.paletteId);
      setLogoUrl(community.tema.logoUrl);
      setBannerUrl(community.tema.bannerUrl);
      setWallpaperUrl(community.tema.wallpaperUrl);
    }
  }

  async function saveUnica() {
    if (!communityId) {
      setMessageTone("error");
      setMessage("Selecione uma comunidade.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "UNICA",
          communityId,
          theme: { paletteId, logoUrl, bannerUrl, wallpaperUrl },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a aparência.");
      setMessageTone("success");
      setMessage(`Aparência de "${selectedCommunity?.nome}" atualizada.`);
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveTodas() {
    const palette = getCommunityPalette(bulkPaletteId);
    const confirmed = window.confirm(
      `Aplicar a paleta "${palette.name}" a todas as ${communities.length} comunidades? ` +
        "Logotipo, banner e papel de parede de cada comunidade não serão alterados.",
    );
    if (!confirmed) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "TODAS", theme: { paletteId: bulkPaletteId } }),
      });
      const result = (await response.json()) as { error?: string; comunidades?: number };
      if (!response.ok) throw new Error(result.error || "Não foi possível aplicar a paleta a todas as comunidades.");
      setMessageTone("success");
      setMessage(`Paleta "${palette.name}" aplicada a ${result.comunidades ?? communities.length} comunidades.`);
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="community-theme-editor owner-appearance-workspace">
        <p>Carregando a Central de Aparência…</p>
      </section>
    );
  }

  if (loadError && !communities.length) {
    return <section className="community-theme-editor owner-appearance-workspace"><p className="operations-feedback error" role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></section>;
  }

  return (
    <section className="community-theme-editor owner-appearance-workspace">
      {loadError && <p className="operations-feedback error" role="alert">{loadError}</p>}
      <header>
        <div>
          <p className="pilot-kicker">CENTRAL DE APARÊNCIA</p>
          <h2>Controle visual de todas as comunidades</h2>
          <p>
            Escolha se a mudança vale para todas as comunidades de uma vez ou
            apenas para uma comunidade específica — sem precisar trocar de
            comunidade ativa.
          </p>
        </div>
      </header>

      <div className="community-theme-block owner-appearance-scope">
        <header>
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Alcance da alteração</strong>
            <small>Toda mudança de aparência começa escolhendo o alcance abaixo.</small>
          </div>
        </header>
        <div className="owner-appearance-scope-options" role="radiogroup" aria-label="Alcance da alteração">
          <button
            type="button"
            className={scope === "UNICA" ? "active" : ""}
            aria-pressed={scope === "UNICA"}
            onClick={() => setScope("UNICA")}
          >
            <strong>Apenas uma comunidade</strong>
            <small>Paleta, logotipo, banner e papel de parede de uma comunidade escolhida.</small>
          </button>
          <button
            type="button"
            className={scope === "TODAS" ? "active" : ""}
            aria-pressed={scope === "TODAS"}
            onClick={() => setScope("TODAS")}
          >
            <strong>Todas as comunidades</strong>
            <small>Aplica a mesma paleta de cores a todas as {communities.length} comunidades de uma vez.</small>
          </button>
        </div>
      </div>

      {scope === "UNICA" && (
        <>
          <div className="community-theme-block">
            <header>
              <span aria-hidden="true">⌂</span>
              <div>
                <strong>Comunidade</strong>
                <small>A alteração é salva somente para a comunidade escolhida.</small>
              </div>
            </header>
            <label>
              Comunidade
              <select
                value={communityId}
                onChange={(event) => selectCommunity(Number(event.target.value))}
              >
                {communities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                    {item.cidadePublica ? ` · ${item.cidadePublica}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="community-theme-block">
            <header>
              <span aria-hidden="true">◐</span>
              <div>
                <strong>Paleta</strong>
                <small>Cores testadas nos modos claro, escuro e automático.</small>
              </div>
            </header>
            <div className="community-palette-grid">
              {COMMUNITY_PALETTES.map((item) => (
                <button
                  type="button"
                  className={paletteId === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => setPaletteId(item.id)}
                >
                  <span
                    style={{
                      background: `linear-gradient(135deg,${item.light.background} 0 49%,${item.dark.background} 51%)`,
                    }}
                  >
                    <i style={{ background: item.light.primary }} />
                    <i style={{ background: item.dark.accent }} />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="community-theme-block community-theme-media">
            <header>
              <span aria-hidden="true">▧</span>
              <div>
                <strong>Imagens</strong>
                <small>Avatar, banner e papel de parede desta comunidade.</small>
              </div>
            </header>
            <NativeImageUpload
              label="Foto ou avatar da comunidade"
              value={logoUrl}
              purpose="community-logo"
              resourceId={typeof communityId === "number" ? communityId : undefined}
              onChange={setLogoUrl}
            />
            <NativeImageUpload
              label="Imagem de fundo ou banner (opcional)"
              value={bannerUrl}
              purpose="community-banner"
              resourceId={typeof communityId === "number" ? communityId : undefined}
              onChange={setBannerUrl}
            />
            <NativeImageUpload
              label="Papel de parede da página inicial (opcional)"
              value={wallpaperUrl}
              purpose="community-banner"
              previewMode="banner"
              resourceId={typeof communityId === "number" ? communityId : undefined}
              help="A imagem aparece forte no topo e desaparece em degradê até o conteúdo."
              onChange={setWallpaperUrl}
            />
          </div>

          <footer className="community-theme-footer">
            {message && (
              <p className={`operations-feedback ${messageTone === "error" ? "error" : ""}`} role="status">
                {message}
              </p>
            )}
            <button type="button" disabled={saving || !communityId} onClick={() => void saveUnica()}>
              {saving ? "Salvando…" : `Salvar aparência de "${selectedCommunity?.nome || "comunidade"}"`}
            </button>
          </footer>
        </>
      )}

      {scope === "TODAS" && (
        <>
          <div className="community-theme-block">
            <header>
              <span aria-hidden="true">◐</span>
              <div>
                <strong>Paleta para todas as comunidades</strong>
                <small>
                  O logotipo, o banner e o papel de parede de cada comunidade
                  continuam sendo os mesmos — apenas a paleta de cores muda.
                </small>
              </div>
            </header>
            <div className="community-palette-grid">
              {COMMUNITY_PALETTES.map((item) => (
                <button
                  type="button"
                  className={bulkPaletteId === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => setBulkPaletteId(item.id)}
                >
                  <span
                    style={{
                      background: `linear-gradient(135deg,${item.light.background} 0 49%,${item.dark.background} 51%)`,
                    }}
                  >
                    <i style={{ background: item.light.primary }} />
                    <i style={{ background: item.dark.accent }} />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </div>

          <footer className="community-theme-footer">
            {message && (
              <p className={`operations-feedback ${messageTone === "error" ? "error" : ""}`} role="status">
                {message}
              </p>
            )}
            <button type="button" disabled={saving || !communities.length} onClick={() => void saveTodas()}>
              {saving ? "Aplicando…" : `Aplicar a todas as ${communities.length} comunidades`}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
