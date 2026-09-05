import Link from "../components/StableLink";

export default function PrivacyPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p><h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 1 de setembro de 2026</p>
        <h2>1. Finalidade</h2><p>O VÍNKULO trata dados necessários para autenticação, participação em comunidades, comunicação, eventos e organização ministerial, conforme o recurso utilizado e as permissões concedidas.</p>
        <h2>2. Dados de acesso</h2><p>Contas convidadas utilizam nome, e-mail e credencial protegida. Senhas são armazenadas como hash com salt, e cookies de sessão são protegidos.</p>
        <h2>3. Isolamento e acesso</h2><p>O servidor resolve a comunidade ativa a partir de vínculo válido. A interface não é usada como única barreira de autorização.</p>
        <h2>4. Fotos, arquivos e conversas</h2><p>O VÍNKULO não mantém cópia do conteúdo de novas fotos, arquivos ou conversas privadas. Conforme a escolha do usuário, esses conteúdos ficam no Google Drive autorizado ou somente no aparelho. A plataforma conserva apenas referências técnicas, consentimentos, permissões e registros de auditoria necessários para localizar o conteúdo e proteger o acesso.</p>
        <h2>5. Conta Google e Google Drive</h2><p>Entrar com Google e autorizar o Drive são decisões separadas. O login usa apenas identificação básica (nome, e-mail e foto pública, via os escopos <code>openid</code>, <code>email</code> e <code>profile</code>). Conectar o Drive é uma ação adicional, feita quando o usuário escolhe, e usa permissão limitada aos arquivos que o próprio VÍNKULO cria ou que o usuário autoriza especificamente (escopo <code>drive.file</code>) — não ao Google Drive inteiro. O uso e a transferência de informações recebidas das APIs do Google pelo VÍNKULO seguem a <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, incluindo os requisitos de Uso Limitado. O usuário pode negar ou revogar a autorização a qualquer momento em Minha conta; nesse caso, conteúdos locais não sincronizam e arquivos já existentes continuam sob controle exclusivo da própria Conta Google do usuário.</p>
        <h2>6. Carregamento e download</h2><p>Mensagens recentes e prévias leves podem ser carregadas automaticamente conforme a escolha do usuário. O download para o aparelho começa bloqueado e só fica disponível após autorização nas preferências.</p>
        <h2>7. Migração do histórico</h2><p>Conteúdo antigo armazenado pela plataforma somente é removido depois que a migração ao Google Drive é concluída e confirmada. Falhas interrompem a exclusão para evitar perda de dados.</p>
        <h2>8. Retenção e direitos</h2><p>Cada comunidade deve definir responsável, finalidade e retenção, além de manter canal para consulta, correção, exportação, revogação ou desativação.</p>
        <h2>9. Exclusão de conta e de dados</h2><p>O usuário pode solicitar a exclusão da conta e dos dados mantidos pelo VÍNKULO a qualquer momento, conforme descrito em <Link href="/exclusao-de-dados">Exclusão de conta e de dados</Link>. Arquivos guardados no Google Drive do próprio usuário não são apagados pelo VÍNKULO, pois nunca ficam sob posse da plataforma.</p>
        <h2>10. Contato</h2><p>Dúvidas sobre esta política ou sobre os dados tratados podem ser enviadas pela página de <Link href="/contato">Contato</Link>.</p>
        <h2>11. Limitações</h2><p>Esta página não substitui revisão jurídica específica. Categorias especiais de dados exigem avaliação adicional, controles de acesso e infraestrutura apropriada.</p>
        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
