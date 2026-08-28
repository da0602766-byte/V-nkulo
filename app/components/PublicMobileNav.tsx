import Link from "./StableLink";
import { getSessionUser } from "../lib/local-auth";
import CreateCommunityShortcut from "./CreateCommunityShortcut";
import PublicIcon from "./PublicIcon";

export default async function PublicMobileNav({
  active = "home",
}: {
  active?: "home" | "communities";
}) {
  const user = await getSessionUser();
  const initials = user ? getInitials(user.nome) : "○";

  return (
    <nav className="public-mobile-nav" aria-label="Navegação móvel">
      <Link className={active === "home" ? "active" : ""} href="/">
        <span aria-hidden="true"><PublicIcon name="home" size={20} /></span>
        Início
      </Link>
      <Link className={active === "communities" ? "active" : ""} href="/comunidades">
        <span aria-hidden="true"><PublicIcon name="community" size={20} /></span>
        Comunidades
      </Link>
      <CreateCommunityShortcut signedIn={Boolean(user)} compact />
      <Link
        className="public-mobile-profile-link"
        href={user?.system_owner ? "/proprietario" : user ? "/painel" : "/login"}
        showLoading={Boolean(user)}
        loadingLabel={user?.system_owner ? "Abrindo a Área do proprietário…" : "Abrindo seu painel…"}
      >
        <span className="public-mobile-profile-avatar" aria-hidden="true">
          {user?.foto_perfil ? <img src={user.foto_perfil} alt="" /> : user ? initials : <PublicIcon name="user" size={18} />}
        </span>
        {user?.system_owner ? "Proprietário ✓" : user ? "Meu perfil" : "Entrar"}
      </Link>
    </nav>
  );
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "US";
}
