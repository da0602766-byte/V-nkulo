import CommunityDirectoryCarousel from './CommunityDirectoryCarousel';
import Link from './StableLink';
import PublicIcon from './PublicIcon';
import type { PublicCommunity } from '../lib/pilot-data';
import './community-directory.css';

export default function CommunityDirectoryContent({communities,cities,query,city,order}:{communities:PublicCommunity[];cities:string[];query:string;city:string;order:string}) {
  const hasFilters=Boolean(query||city||order!=='nome');
  return <div className="vkd-content">
    <header className="vkd-intro">
      <div><span className="vkd-eyebrow"><PublicIcon name="users" size={16}/> Encontre seu lugar</span><h1>Conexões que viram comunidade.</h1><p>Conheça pessoas, histórias e espaços para caminhar junto.</p></div>
      <span className="vkd-intro-mark" aria-hidden="true"><PublicIcon name="community" size={32}/></span>
    </header>
    <form action="/comunidades" method="get" role="search" className="vkd-search">
      <div className="vkd-search-row"><label><PublicIcon name="search"/><input name="q" defaultValue={query} aria-label="Buscar por nome, cidade ou descrição" placeholder="Busque uma comunidade, cidade ou história…" maxLength={80}/></label><button type="submit">Buscar <PublicIcon name="arrow" size={17}/></button></div>
      <details className="vkd-filters" open={Boolean(city||order!=='nome')}><summary>Filtros e ordem <span aria-hidden="true">⌄</span></summary><div><label>Cidade<select name="cidade" defaultValue={city}><option value="">Todas as cidades</option>{cities.map(item=><option key={item} value={item}>{item}</option>)}</select></label><label>Ordenar por<select name="ordem" defaultValue={order}><option value="nome">Nome</option><option value="cidade">Cidade</option><option value="eventos">Próximos eventos</option></select></label><button type="submit">Aplicar filtros</button></div></details>
    </form>
    <div className="vkd-results" aria-live="polite"><h2>Explore as comunidades <span>{communities.length}</span></h2>{hasFilters?<Link href="/comunidades">Limpar filtros</Link>:<p>Um novo vínculo começa por aqui</p>}</div>
    {communities.length?<CommunityDirectoryCarousel key={`${query}:${city}:${order}`} communities={communities}/>:<section className="vkd-empty"><span><PublicIcon name="search" size={28}/></span><h2>Nenhuma comunidade encontrada</h2><p>Experimente outro nome ou ajuste os filtros da busca.</p><Link href="/comunidades">Ver todas as comunidades <PublicIcon name="arrow" size={16}/></Link></section>}
    <aside className="vkd-guide" aria-label="Como participar"><div><span><PublicIcon name="search"/></span><p><strong>Encontre seu espaço</strong><small>Pesquise por nome ou cidade.</small></p></div><div><span><PublicIcon name="community"/></span><p><strong>Conheça a comunidade</strong><small>Explore a página pública.</small></p></div><div><span><PublicIcon name="shield"/></span><p><strong>Entre com acolhimento</strong><small>Solicite entrada e aguarde a aprovação.</small></p></div></aside>
    <p className="vkd-footnote"><PublicIcon name="shield" size={14}/> O conteúdo interno é protegido e liberado após aprovação da comunidade.</p>
  </div>;
}
