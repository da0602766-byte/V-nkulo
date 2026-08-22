import Link from "../components/StableLink";

export default function TermsPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p><h1>Termos de Uso</h1>
        <p className="legal-updated">Última atualização: 8 de agosto de 2026</p>
        <h2>1. Uso responsável</h2><p>O VÍNKULO organiza comunidades e ministérios. Cada organização deve usar somente dados necessários, manter informações sensíveis fora de recursos não homologados e respeitar a legislação aplicável.</p>
        <h2>2. Acesso</h2><p>O acesso interno depende de convite individual e vínculo ativo. O usuário não deve compartilhar senha ou link de convite.</p>
        <h2>3. Perfis e permissões</h2><p>Cada perfil possui escopo próprio. Acesso a outra comunidade ou tentativa de contornar permissões pode bloquear a conta.</p>
        <h2>4. Funções controladas</h2><p>Não há processamento de pagamento. Recursos sensíveis, redes e integrações dependem de habilitação específica e validação no servidor.</p>
        <h2>5. Conteúdo editorial</h2><p>A automação editorial permanece em modo COM_REVISÃO. Nenhum rascunho será publicado automaticamente.</p>
        <h2>6. Continuidade</h2><p>Recursos podem ser pausados ou revertidos por segurança, manutenção ou exigência legal, preservando os registros sujeitos às políticas de retenção.</p>
        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
