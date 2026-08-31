import Link from "../components/StableLink";

export default function PrivacyPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p><h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 30 de agosto de 2026</p>
        <h2>1. Finalidade</h2><p>O VÍNKULO trata dados necessários para autenticação, participação em comunidades, comunicação, eventos e organização ministerial, conforme o recurso utilizado e as permissões concedidas.</p>
        <h2>2. Dados de acesso</h2><p>Contas convidadas utilizam nome, e-mail e credencial protegida. Senhas são armazenadas como hash com salt, e cookies de sessão são protegidos.</p>
        <h2>3. Isolamento e acesso</h2><p>O servidor resolve a comunidade ativa a partir de vínculo válido. A interface não é usada como única barreira de autorização.</p>
        <h2>4. Fotos, arquivos e conversas</h2><p>O VÍNKULO não mantém cópia do conteúdo de novas fotos, arquivos ou conversas privadas. Conforme a escolha do usuário, esses conteúdos ficam no Google Drive autorizado ou somente no aparelho. A plataforma conserva apenas referências técnicas, consentimentos, permissões e registros de auditoria necessários para localizar o conteúdo e proteger o acesso.</p>
        <h2>5. Conta Google e Google Drive</h2><p>Entrar com Google e autorizar o Drive são decisões separadas. O acesso ao Drive usa permissão limitada aos arquivos criados ou escolhidos para o VÍNKULO. O usuário pode negar ou revogar a autorização; nesse caso, conteúdos locais não sincronizam e arquivos existentes continuam sob controle da própria Conta Google.</p>
        <h2>6. Carregamento e download</h2><p>Mensagens recentes e prévias leves podem ser carregadas automaticamente conforme a escolha do usuário. O download para o aparelho começa bloqueado e só fica disponível após autorização nas preferências.</p>
        <h2>7. Migração do histórico</h2><p>Conteúdo antigo armazenado pela plataforma somente é removido depois que a migração ao Google Drive é concluída e confirmada. Falhas interrompem a exclusão para evitar perda de dados.</p>
        <h2>8. Retenção e direitos</h2><p>Cada comunidade deve definir responsável, finalidade e retenção, além de manter canal para consulta, correção, exportação, revogação ou desativação.</p>
        <h2>9. Limitações</h2><p>Esta página não substitui revisão jurídica específica. Categorias especiais de dados exigem avaliação adicional, controles de acesso e infraestrutura apropriada.</p>
        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
