# Auditoria Vínkulo — etapa P0

Data: 23/09/2026. Base: versão 296, commit `d72e99f1a5e65d138e6946dce2f4f6d697d67608` do repositório do Sites.

## Entrega

Esta etapa trata da privacidade e do diagnóstico das notificações. O console do proprietário e as integrações Supabase da versão publicada foram preservados.

- Cada assinatura Web Push fica vinculada à sessão e ao aparelho que a autorizou. Logout remove apenas o vínculo da sessão encerrada; outros aparelhos continuam conectados.
- Troca direta de conta revoga a sessão substituída. A nova conta precisa ativar suas notificações. Redefinir a senha revoga todas as sessões e assinaturas anteriores daquele usuário.
- O envio verifica sessão persistida, usuário ativo e validade da assinatura. O service worker consulta novamente o servidor antes de exibir ou abrir um aviso, rejeitando eventos atrasados de outra sessão/conta.
- Os avisos externos usam texto genérico. Título, conteúdo e destino da mensagem não integram o payload enviado ao provedor; o destino só é recuperado por consulta autenticada.
- A central distingue assinatura ativa neste aparelho, dificuldade de envio e aceite pelo serviço de notificações. Aceite não comprova que o sistema operacional exibiu o aviso.
- Tentativas, último aceite, status e falhas consecutivas ficam registrados sem conteúdo da mensagem. Respostas 404/410 removem somente o vínculo correspondente, protegendo uma ativação posterior contra respostas atrasadas.
- O sincronizador da ponte Android não consulta enquanto a página está oculta e cancela requisições em andamento ao ocultar/sair. Navegadores com Web Push não exibem também um segundo aviso pelo polling.
- O service worker passa a usar os caches v6. O teste de ativação agora verifica caches atuais, obsoletos e de outros aplicativos, sem depender de uma versão fixa.

## Migração e compatibilidade

`0077_push_session_privacy.sql` acrescenta campos de sessão, vínculo e diagnóstico à tabela de dispositivos; a referência à sessão usa exclusão em cascata. A migração está incluída no artefato de publicação.

Assinaturas anteriores sem sessão deixam de participar dos envios. Ao carregar a central, uma assinatura já autorizada é reconciliada apenas para a mesma conta e o mesmo endpoint. A reconciliação não cria autorização para outra conta. Após logout/revogação, é necessário ativar novamente naquele aparelho.

Notificações já exibidas pelo sistema operacional não são apagadas por esta entrega. A nova verificação pode descartar um aviso se a rede ou a sessão não estiver disponível; a central persistida continua sendo a fonte dos avisos.

## Validação

`scripts/pre-publicacao.sh` aprovado:

- TypeScript sem erros.
- Lint sem erros; 43 avisos preexistentes.
- Build de produção e verificação do Worker ESM e do manifesto aprovados.
- 440 testes aprovados, nenhuma falha.

Os novos testes exercitam o Worker compilado com banco SQLite migrado: dois aparelhos, logout, troca de conta, reconciliação de assinatura antiga, redefinição de senha, autorização de aviso atrasado e dados de diagnóstico. Os testes de envio e service worker usam provedor simulado; incluem a corrida entre resposta 410 e nova ativação. O sincronizador nativo foi testado com ocultação da página e cancelamento de resposta em andamento.

## Limites desta etapa

O APK não foi recompilado. As mudanças no sincronizador se aplicam à camada web carregada pela ponte existente. FCM nativo com aplicativo fechado, filas duráveis/repetição de envios, SSE/WebSockets, revisão visual dos quatro fluxos e novos conectores permanecem nas próximas etapas. Esta entrega não mede ganho de bateria nem confirma entrega em aparelhos físicos.

## Publicação

Versão **297**, publicada em `https://adote-gestao.da0602766.chatgpt.site` em 23/09/2026, às 12:30 (Brasília).

- Commit de código: `142467f8b32dc39e1eabe9f6e72c6508d4c3b6c5`.
- Versão salva: `appgprj_6a5af9301a888191b2abefddaa299618~appgver_0471d10859688191965d92abc4a2ca67`.
- Implantação: `appgdep_6ab3f07cb91c8191bfbefb81da99fa85`, estado `succeeded`.
- SHA-256 do pacote local aceito: `295a5a4722b39ff11d2bb688710c876c3254cf3b53fc101d7ed1de4dec4250c2`.

Conferência HTTP após a publicação: `/`, `/login` e `/comunidades` retornaram 200; ambas as rotas de push retornaram 401 sem sessão; `/sw.js` contém os caches v6 e a consulta autenticada antes de exibir/abrir avisos. Os eventos de log dessas duas recusas de autenticação tiveram execução normal (`outcome: ok`). O teste autenticado de múltiplos aparelhos foi feito no Worker local com banco migrado, sem disparos para usuários reais em produção.
