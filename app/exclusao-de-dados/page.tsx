import Link from "../components/StableLink";

export default function DataDeletionPage() {
  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/"><span>V+</span><strong>Vínkulo</strong></Link>
      <article className="pilot-legal-card">
        <p className="pilot-kicker">DOCUMENTO DA PLATAFORMA</p>
        <h1>Exclusão de conta e de dados</h1>
        <p className="legal-updated">Última atualização: 1 de setembro de 2026</p>

        <h2>1. Desconectar o Google Drive (você mesmo, agora)</h2>
        <p>
          Se você só quer parar de usar o Google Drive com o VÍNKULO, não é
          preciso excluir a conta. Entre em <strong>Minha conta → Privacidade e
          armazenamento</strong> e escolha “Desconectar Drive”. Isso revoga a
          autorização do VÍNKULO junto ao Google e apaga o token guardado na
          plataforma. Os arquivos que já estavam no seu Google Drive
          permanecem lá, na sua própria Conta Google — o VÍNKULO não os
          apaga, porque nunca teve posse deles.
        </p>

        <h2>2. Excluir a conta e os dados do VÍNKULO</h2>
        <p>
          A exclusão completa da conta hoje é feita mediante solicitação,
          e não por um botão automático — isso evita remover por engano
          vínculos com escalas, células ou comunidades que outras pessoas
          também usam.
        </p>
        <p>
          Para solicitar, escreva para{" "}
          <strong>[e-mail de suporte a definir]</strong> a partir do
          endereço de e-mail cadastrado na sua conta, informando o nome
          completo e a comunidade a que você pertence. Pedimos a
          confirmação pelo mesmo e-mail para impedir que outra pessoa peça
          a exclusão em seu nome.
        </p>

        <h2>3. O que é apagado</h2>
        <p>
          Ao confirmar a exclusão: seu cadastro, permissões, vínculos com
          comunidades, e o registro de conexão com sua Conta Google
          (incluindo o token de acesso ao Drive, que é apagado e revogado
          junto ao Google) deixam de existir no VÍNKULO.
        </p>
        <p>
          Arquivos, fotos e conversas que você optou por guardar no seu
          próprio Google Drive <strong>não são apagados por nós</strong> —
          eles são seus, ficam na sua Conta Google, e continuam lá depois
          da exclusão. Para removê-los, use o próprio Google Drive.
        </p>
        <p>
          Registros de auditoria que a lei ou a governança da comunidade
          exigem manter (por exemplo, para investigação de abuso ou
          cumprimento de obrigação legal) podem ser preservados pelo prazo
          necessário, sem dados de contato ativos.
        </p>

        <h2>4. Prazo</h2>
        <p>
          [Prazo de atendimento a definir — por exemplo, “em até 15 dias
          corridos após a confirmação”.]
        </p>

        <h2>5. Dúvidas</h2>
        <p>
          Para qualquer dúvida sobre esse processo, use a página de{" "}
          <Link href="/contato">Contato</Link>.
        </p>

        <Link className="legal-back" href="/">Voltar ao início</Link>
      </article>
    </main>
  );
}
