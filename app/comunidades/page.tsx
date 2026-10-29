import PublicHeader from "../components/PublicHeader";
import CommunityDirectoryContent from "../components/CommunityDirectoryContent";
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
  return (
    <main className="vinkulo-site public-directory social-directory vkd-page">
      <PublicHeader />
      <CommunityDirectoryContent communities={communities} cities={cities} query={query} city={city} order={order}/>
    </main>
  );
}
