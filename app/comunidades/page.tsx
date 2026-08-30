import PublicHeader from "../components/PublicHeader";
import PublicMobileNav from "../components/PublicMobileNav";
import CommunityDirectoryCarousel from "../components/CommunityDirectoryCarousel";
import Link from "../components/StableLink";
import { getPublicCommunities } from "../lib/pilot-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Comunidades | VÍNKULO",
  description:
    "Diretório público de comunidades no VÍNKULO. Encontre uma comunidade por cidade e conheça a página institucional antes de solicitar entrada.",
};

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cidade?: string; ordem?: string }>;
}) {
  const params = await searchParams;
  const query = String(params.q || "").trim().slice(0, 80);
  const city = String(params.cidade || "").trim().slice(0, 120);
  const order = ["nome", "cidade", "eventos"].includes(String(params.ordem))
    ? String(params.ordem)
    : "nome";
  const allCommunities = await getPublicCommunities();
  const cities = Array.from(new Set(allCommunities.map((item) => item.cidade).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const normalizedQuery = query.toLocaleLowerCase("pt-BR");
  const communities = allCommunities
    .filter((community) => {
      const matchesQuery = !normalizedQuery || [community.nome, community.cidade, community.descricao]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      return matchesQuery && (!city || community.cidade === city);
    })
    .sort((a, b) => {
      if (order === "eventos") return b.eventosPublicos - a.eventosPublicos || a.nome.localeCompare(b.nome, "pt-BR");
      if (order === "cidade") return a.cidade.localeCompare(b.cidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR");
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  const hasFilters = Boolean(query || city || order !== "nome");
  return (
    <main className="vinkulo-site public-directory social-directory">
      <PublicHeader />
      <section className="directory-intro">
        <p className="pilot-kicker">ENCONTRE SUA COMUNIDADE</p>
        <h1>Comunidades são espaços de conexão.</h1>
        <p>
          Pesquise, conheça a página pública e solicite entrada. O conteúdo
          interno só é liberado após aprovação.
        </p>
        <form action="/comunidades" method="get" className="directory-search directory-search-v81">
          <label className="directory-query-field">
            <span aria-hidden="true">⌕</span>
            <input
              name="q"
              defaultValue={query}
              aria-label="Buscar por nome, cidade ou descrição"
              placeholder="Buscar por nome, cidade ou descrição..."
            />
          </label>
          <details className="directory-filter-panel" open={Boolean(city || order !== "nome")}>
            <summary>Filtros e ordem <span aria-hidden="true">⌄</span></summary>
            <div>
              <label>Cidade
                <select name="cidade" defaultValue={city}>
                  <option value="">Todas as cidades</option>
                  {cities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Ordenar por
                <select name="ordem" defaultValue={order}>
                  <option value="nome">Nome</option>
                  <option value="cidade">Cidade</option>
                  <option value="eventos">Próximos eventos</option>
                </select>
              </label>
            </div>
          </details>
          <button>Aplicar busca</button>
        </form>
        <div className="directory-search-result" aria-live="polite">
          <span>{communities.length} comunidade{communities.length === 1 ? "" : "s"} encontrada{communities.length === 1 ? "" : "s"}</span>
          {hasFilters && <Link href="/comunidades">Limpar filtros</Link>}
        </div>
      </section>
      {communities.length ? (
        <CommunityDirectoryCarousel communities={communities} />
      ) : (
        <section className="directory-empty">
          <span aria-hidden="true">⌕</span>
          <h2>Nenhuma comunidade encontrada</h2>
          <p>Tente buscar com um termo mais amplo.</p>
          <Link href="/comunidades">Ver todas</Link>
        </section>
      )}
      <p className="directory-note">
        Solicitações são analisadas por responsáveis da comunidade. Nenhum
        acesso é concedido automaticamente.
      </p>
      <PublicMobileNav active="communities" />
    </main>
  );
}
