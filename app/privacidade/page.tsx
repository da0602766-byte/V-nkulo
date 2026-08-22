import Link from "../components/StableLink";

export default function PrivacyPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p><h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 8 de agosto de 2026</p>
        <h2>1. Finalidade</h2><p>O VÍNKULO trata dados necessários para autenticação, participação em comunidades, comunicação, eventos e organização ministerial, conforme o recurso utilizado e as permissões concedidas.</p>
        <h2>2. Dados de acesso</h2><p>Contas convidadas utilizam nome, e-mail e credencial protegida. Senhas são armazenadas como hash com salt, e cookies de sessão são protegidos.</p>
        <h2>3. Isolamento e acesso</h2><p>O servidor resolve a comunidade ativa a partir de vínculo válido. A interface não é usada como única barreira de autorização.</p>
        <h2>4. Recursos controlados</h2><p>Pagamentos não são processados. Documentos sensíveis, evidências e integrações externas exigem infraestrutura homologada e autorização específica.</p>
        <h2>5. Retenção e direitos</h2><p>Cada comunidade deve definir responsável, finalidade e retenção, além de manter canal para consulta, correção, exportação ou desativação.</p>
        <h2>6. Limitações</h2><p>Esta página não substitui revisão jurídica específica. Categorias especiais de dados exigem avaliação adicional, controles de acesso e infraestrutura apropriada.</p>
        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
