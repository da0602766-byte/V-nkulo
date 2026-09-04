import Link from "../components/StableLink";

export default function PrivacyPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p><h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 4 de setembro de 2026</p>
        <h2>1. Finalidade</h2><p>O VÍNKULO trata dados necessários para autenticação, participação em comunidades, comunicação, eventos e organização ministerial, conforme o recurso utilizado e as permissões concedidas.</p>
        <h2>2. Dados de acesso</h2><p>Contas convidadas utilizam nome, e-mail e credencial protegida. Senhas são armazenadas como hash com salt, e cookies de sessão são protegidos.</p>
        <h2>3. Isolamento e acesso</h2><p>O servidor resolve a comunidade ativa a partir de vínculo válido. A interface não é usada como única barreira de autorização.</p>
        <h2>4. Fotos, arquivos e conversas</h2><p>O VÍNKULO não mantém cópia do conteúdo de novas fotos, arquivos ou conversas privadas. Arquivos pessoais podem ficar no Google Drive autorizado ou somente no aparelho. Publicações, banners e conversas compartilhadas exigem o Google Drive autorizado da comunidade; sem ele, o envio fica indisponível e não é desviado silenciosamente para a plataforma. A plataforma conserva apenas referências técnicas, consentimentos, permissões e registros de auditoria necessários para localizar o conteúdo e proteger o acesso.</p>
        <h2>5. Conta Google e Google Drive</h2><p>Entrar com Google e autorizar o Drive são decisões separadas. O acesso ao Drive usa permissão limitada aos arquivos criados ou escolhidos para o VÍNKULO. O usuário pode negar ou revogar a autorização; nesse caso, conteúdos locais não sincronizam e arquivos existentes continuam sob controle da própria Conta Google.</p>
        <h2>6. Carregamento e download</h2><p>Mensagens recentes e prévias leves podem ser carregadas automaticamente conforme a escolha do usuário. O download para o aparelho começa bloqueado e só fica disponível após autorização nas preferências.</p>
        <h2>7. Migração do histórico</h2><p>A migração copia o conteúdo antigo, relê a cópia e verifica sua integridade antes de atualizar referências. Os originais permanecem preservados para recuperação; sua remoção exige uma operação posterior revisada. Uma falha não apaga o original.</p>
        <h2>8. Retenção e direitos</h2><p>Cada comunidade deve definir responsável, finalidade e retenção, além de manter canal para consulta, correção, exportação, revogação ou desativação.</p>
        <h2>9. Proteção e acesso aos conteúdos</h2><p>As mensagens no Drive usam criptografia aplicada pelo servidor. Não é criptografia de ponta a ponta: o serviço possui as chaves necessárias à leitura autorizada. O responsável pela conta Google e pessoas com permissões concedidas diretamente no Drive podem acessar os arquivos sob seu controle. Arquivos privados exigem sessão e permissões vigentes; tornar uma publicação privada ou revogar um vínculo impede novos acessos pela plataforma, mas não recolhe cópias já baixadas.</p><p>Pré-visualizar transfere conteúdo à memória para exibição. Baixar ou salvar localmente cria uma cópia no aparelho, sem sincronização automática com outros aparelhos. Limpar dados do navegador, desinstalar o aplicativo ou perder o aparelho pode apagar os arquivos locais.</p><h2>10. Limitações</h2><p>Esta página não substitui revisão jurídica específica. Categorias especiais de dados exigem avaliação adicional, controles de acesso e infraestrutura apropriada.</p>
        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
