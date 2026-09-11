import Link from "./components/StableLink";

export default function NotFound() {
  return <main className="pilot-state-page"><span aria-hidden="true">404</span><p className="pilot-kicker">PÁGINA NÃO ENCONTRADA</p><h1>Este endereço não existe ou não está disponível.</h1><p>Links privados e módulos desativados não revelam informações internas.</p><Link href="/">Voltar ao início</Link></main>;
}
