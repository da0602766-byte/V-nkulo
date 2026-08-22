"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  COMMUNITY_PALETTES,
  getCommunityPalette,
  type CommunityPaletteId,
  type CommunityTheme,
} from "../lib/community-theme";
import NativeImageUpload from "./NativeImageUpload";

type ThemeResponse = {
  theme?: CommunityTheme;
  canEdit?: boolean;
  canEditWallpaper?: boolean;
  communityName?: string;
  error?: string;
};

type CommunityResponse = {
  community?: {
    nome: string;
    descricao: string;
    cidade: string;
  };
  canEdit?: boolean;
  error?: string;
};

export default function CommunityThemeEditor() {
  const [data, setData] = useState<ThemeResponse>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [paletteId, setPaletteId] = useState<CommunityPaletteId>("MODERNO");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [canEditProfile, setCanEditProfile] = useState(false);
  const [community, setCommunity] =
    useState<CommunityResponse["community"]>();

  useEffect(() => {
    Promise.all([
      fetch("/api/pilot/community-theme", { cache: "no-store" }),
      fetch("/api/pilot/comunidades", { cache: "no-store" }),
    ])
      .then(async ([themeResponse, communityResponse]) => {
        const result = (await themeResponse.json()) as ThemeResponse;
        const communityResult =
          (await communityResponse.json()) as CommunityResponse;
        if (!themeResponse.ok) {
          throw new Error(result.error || "Falha ao carregar tema.");
        }
        if (!communityResponse.ok) {
          throw new Error(
            communityResult.error || "Falha ao carregar a comunidade.",
          );
        }
        setData(result);
        setCommunity(communityResult.community);
        setCanEditProfile(Boolean(communityResult.canEdit));
        if (result.theme) {
          setPaletteId(result.theme.paletteId);
          setLogoUrl(result.theme.logoUrl);
          setBannerUrl(result.theme.bannerUrl);
          setWallpaperUrl(result.theme.wallpaperUrl);
        }
      })
      .catch((error) => setMessage(error.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const themeResponse = await fetch("/api/pilot/community-theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paletteId, logoUrl, bannerUrl, wallpaperUrl }),
      });
      const result = (await themeResponse.json()) as ThemeResponse;
      if (!themeResponse.ok) {
        throw new Error(result.error || "Falha ao salvar o tema.");
      }
      if (canEditProfile) {
        const communityResponse = await fetch("/api/pilot/comunidades", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.get("nome"),
            cidade: form.get("cidade"),
            descricao: form.get("descricao"),
          }),
        });
        const profileResult =
          (await communityResponse.json()) as CommunityResponse;
        if (!communityResponse.ok) {
          throw new Error(
            profileResult.error || "Falha ao salvar a comunidade.",
          );
        }
      }
      setMessage("Tema salvo. Atualizando a prévia…");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setMessage((error as Error).message);
      setSaving(false);
    }
  }

  if (!data.theme || !data.canEdit || !community) return null;
  const palette = getCommunityPalette(paletteId);
  return (
    <section className="community-theme-editor">
      <header>
        <div>
          <p className="pilot-kicker">TEMA DA COMUNIDADE</p>
          <h2>{data.communityName}</h2>
          <p>
            Edite informações, avatar, banner, papel de parede e uma paleta
            testada para os modos claro e escuro.
          </p>
        </div>
        <span
          className="community-theme-preview"
          style={{ background: `linear-gradient(135deg, ${palette.dark.primary}, ${palette.dark.accent})` }}
        />
      </header>
      <form onSubmit={save}>
        {canEditProfile && (
          <div className="community-theme-block community-theme-identity">
            <header><span aria-hidden="true">⌂</span><div><strong>Identidade</strong><small>Informações exibidas no perfil público.</small></div></header>
            <div className="community-profile-fields">
              <label>
                Nome da comunidade
                <input name="nome" required minLength={3} maxLength={120} defaultValue={community.nome} />
              </label>
              <label>
                Cidade ou região
                <input name="cidade" required minLength={2} maxLength={120} defaultValue={community.cidade} />
              </label>
              <label className="composer-wide">
                Apresentação pública
                <textarea name="descricao" required minLength={20} maxLength={600} rows={3} defaultValue={community.descricao} />
              </label>
            </div>
          </div>
        )}
        <div className="community-theme-block">
          <header><span aria-hidden="true">◐</span><div><strong>Paleta</strong><small>Cores testadas nos modos claro, escuro e automático.</small></div></header>
          <div className="community-palette-grid">
            {COMMUNITY_PALETTES.map((item) => (
              <button type="button" className={paletteId === item.id ? "active" : ""} key={item.id} onClick={() => setPaletteId(item.id)}>
                <span style={{ background: `linear-gradient(135deg,${item.light.background} 0 49%,${item.dark.background} 51%)` }}><i style={{ background: item.light.primary }} /><i style={{ background: item.dark.accent }} /></span>
                <strong>{item.name}</strong><small>{item.description}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="community-theme-block community-theme-media">
          <header><span aria-hidden="true">▧</span><div><strong>Imagens</strong><small>Avatar, banner e papel de parede otimizados para computador e celular.</small></div></header>
          <NativeImageUpload label="Foto ou avatar da comunidade" value={logoUrl} purpose="community-logo" onChange={setLogoUrl} />
          <NativeImageUpload label="Imagem de fundo ou banner (opcional)" value={bannerUrl} purpose="community-banner" onChange={setBannerUrl} />
          {data.canEditWallpaper && (
            <NativeImageUpload
              label="Papel de parede da página inicial (opcional)"
              value={wallpaperUrl}
              purpose="community-banner"
              previewMode="banner"
              help="Disponível para líderes, pastores, responsáveis, donos da comunidade e o proprietário. A imagem aparece forte no topo e desaparece em degradê até o conteúdo."
              onChange={setWallpaperUrl}
            />
          )}
        </div>
        <footer className="community-theme-footer">
          {message && <p className="operations-feedback" role="status">{message}</p>}
          <button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar configurações"}</button>
        </footer>
      </form>
    </section>
  );
}
