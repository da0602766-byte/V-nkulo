import Link from "./StableLink";
import { getSessionUser } from "../lib/local-auth";
import GlobalVisualEditor from "./GlobalVisualEditor";
import ThemeControl from "./ThemeControl";
import { getPlatformBranding } from "../lib/platform-branding";
import PublicIcon from "./PublicIcon";

export default async function PublicHeader({
  editorScreen = "public:geral",
}: {
  editorScreen?: string;
}) {
  const user = await getSessionUser();
  const branding = await getPlatformBranding();
  const canEdit = Boolean(user?.system_owner);
  return (
    <>
      <header
        className="vinkulo-header social-public-header reception-header"
        data-editor-key="cabecalho-publico"
        data-smart-scroll-header
      >
        <Link
          className="vinkulo-brand"
          data-editor-key="marca-publica"
          href="/"
          aria-label={`${branding.siteName} — início`}
        >
          <span className="adote-mark" aria-hidden="true">
            <img src={branding.logoUrl || "/adote-symbol.svg"} alt="" />
          </span>
          <span>
            <strong>{branding.siteName}</strong>
            <small>Gestão de comunidades</small>
          </span>
        </Link>
        <nav className="reception-primary-nav" aria-label="Navegação principal">
          <Link href="/#recursos">Recursos</Link>
          <Link href="/comunidades">Comunidades</Link>
          <Link href="/#seguranca">Como funciona</Link>
        </nav>
        <div className="public-header-actions reception-header-actions">
          <details className="public-search-menu">
            <summary className="reception-icon-button" aria-label="Buscar comunidades">
              <PublicIcon name="search" />
              <span>Buscar</span>
            </summary>
            <form
              className="public-global-search"
              action="/comunidades"
              method="get"
              role="search"
            >
              <PublicIcon name="search" size={18} />
              <input
                name="q"
                aria-label="Buscar comunidades"
                placeholder="Nome, cidade ou comunidade..."
                autoComplete="off"
              />
              <button type="submit">Buscar</button>
            </form>
          </details>
          <ThemeControl compact />
          {canEdit && (
            <span
              id="global-editor-toolbar-slot"
              className="global-editor-toolbar-slot"
              aria-label="Aparência"
            />
          )}
          {user ? (
            <details className="public-account-menu">
              <summary aria-label="Abrir menu da conta">
                <span className="public-account-avatar">
                  {user.foto_perfil ? <img src={user.foto_perfil} alt="" /> : initials(user.nome)}
                </span>
                <span className="public-account-copy">
                  <strong>{firstName(user.nome)}</strong>
                  <small>{user.system_owner ? "Proprietário" : "Minha conta"}</small>
                </span>
                <span className="public-account-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="public-account-popover">
                <header>
                  <span className="public-account-avatar">
                    {user.foto_perfil ? <img src={user.foto_perfil} alt="" /> : initials(user.nome)}
                  </span>
                  <div>
                    <strong>{user.nome}{user.system_owner ? " ✓" : ""}</strong>
                    <small>{user.email}</small>
                  </div>
                </header>
                <Link href={user.system_owner ? "/proprietario" : "/painel"}>
                  <PublicIcon name="home" size={18} />
                  {user.system_owner ? "Área do proprietário" : "Abrir meu painel"}
                </Link>
                <Link href="/painel">
                  <PublicIcon name="community" size={18} />
                  Minha comunidade
                </Link>
                <Link href="/painel">
                  <PublicIcon name="user" size={18} />
                  Meu perfil
                </Link>
                <a className="public-account-logout" href="/api/auth/logout">
                  <PublicIcon name="logout" size={18} />
                  Sair da plataforma
                </a>
              </div>
            </details>
          ) : (
            <Link className="header-login reception-login" href="/login">
              Entrar
            </Link>
          )}
        </div>
      </header>
      <GlobalVisualEditor
        canEdit={canEdit}
        communityName="Área pública da plataforma"
        screenId={editorScreen}
        surface="public"
        rootSelector=".vinkulo-site"
      />
    </>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Conta";
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "US";
}
