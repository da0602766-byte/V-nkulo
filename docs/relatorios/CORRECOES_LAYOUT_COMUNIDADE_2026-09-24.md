# Correções de layout da comunidade — 24/09/2026

Branch: `codex/community-responsive-fixes`. Correções baseadas nas três capturas enviadas após a versão 305.

## Alterações e lógica

- **Tema dinâmico:** `app/lib/community-theme.ts` centraliza os tokens de cada paleta e calcula texto contrastante para botões e links. `PilotDashboard.tsx` e `app/comunidades/[slug]/page.tsx` usam a mesma função. A página pública recebe somente o identificador da paleta já disponível na consulta institucional. `PublicHeader.tsx` usa a mesma preferência de tema por usuário do painel. `feed-worship.css` deixa de impor roxo fixo. A cascata final em `community-surfaces.css` corrige regras antigas que ainda pintavam barras e menus de lilás.
- **Fotos:** `ResponsiveFeedImage.tsx` contém a prévia em largura de 100% e altura máxima de `min(300px, 42dvh)` no celular ou `min(420px, 52dvh)` no desktop. `object-fit: contain` preserva a foto inteira. Clique na foto ou em Ampliar abre `FeedImageLightbox.tsx`, um diálogo nativo na camada superior, com foco preso, fechamento por botão/Escape/área externa, restauração do foco e bloqueio da rolagem de fundo. A imagem completa só é solicitada após essa ação. Economia de dados, lazy loading e download foram preservados.
- **Reações:** `CommunityPostReactions.tsx` mantém contagens, persistência, seleção múltipla e reversão em erro. O seletor agora expande dentro do card, com quatro opções; não fica fixo junto à navegação. Fecha após sucesso ou Escape, devolvendo foco ao acionador. Estados selecionados e mensagens de erro permanecem acessíveis.
- **Escalas:** removidos o limite antigo de 240/270 px e a posição fixa do seletor de substituição, responsáveis pelo recorte/sobreposição. O card cresce com seu conteúdo, com botões de 44 px em duas linhas, textos mais curtos e rótulos acessíveis completos. As operações existentes de confirmação, indisponibilidade e substituição foram mantidas.
- **Cabeçalho público:** capa contida em uma área proporcional; avatar sem margem negativa; título com quebra segura; retorno em linha própria; quatro controles do proprietário com 44 px e espaçamento sem sobreposição em 360 px. O diálogo de informações da comunidade também ganhou controle de foco e botão de fechar alinhado.

## Arquivos centrais

`app/community-surfaces.css`, `app/feed-worship.css`, `app/components/ResponsiveFeedImage.tsx`, `app/components/feed/FeedImageLightbox.tsx`, `app/components/CommunityPostReactions.tsx`, `app/components/CommunityHome.tsx`, `app/components/PilotDashboard.tsx`, `app/components/PublicHeader.tsx`, `app/components/feed/useFeedDialog.ts`, `app/lib/community-theme.ts`, `app/lib/pilot-data.ts`, `app/comunidades/[slug]/page.tsx` e `app/layout.tsx`.

## Validação

- Build Vinext e TypeScript aprovados. Artefato Worker ESM validado.
- **495/495 testes aprovados** na execução final. Dois novos testes verificam contraste AA (4,5:1) dos botões/links em todas as paletas e modos, além da resolução independente de cores ao trocar comunidade. Duas asserções antigas foram ajustadas para a preferência de tema por usuário no cabeçalho público.
- Lint dos arquivos alterados: **0 erros, 13 avisos existentes de imagens**. Nenhuma biblioteca adicionada.
- Uma execução intermediária teve falha no teste preexistente de retenção da fila push; ele passou isoladamente (12/12) e nas duas execuções completas seguintes, sem alteração no código de push.
- QA no build de produção com SQLite em memória: 360, 375, 390, 412, 768, 1024, 1280, 1440 e 1920 px sem overflow horizontal no Feed e sem recorte da escala. Card pendente em 390 px: cerca de 271 px de altura; ações com 44 px. Substituição aberta expande o card em fluxo normal.
- Página pública: 360, 390, 768, 1024 e 1440 px sem overflow; visitante e proprietário; temas claro e escuro. Em 360 px, os quatro controles do proprietário medem 44 px e mantêm 6 px entre si. Altura da imagem da capa igual à área da capa, sem vazamento.
- Testados ampliação, Escape, retorno do foco, persistência de reação, expansão/cancelamento da substituição, tema público → painel e troca efetiva de comunidade Preto & Dourado → Moderno.

## Dados e limites

As capturas enviadas e os registros de teste foram usados exclusivamente no servidor local e banco em memória; não integram o pacote de produção. Nenhum dado real, permissão ou tabela foi alterado. A publicação não exige migração. O APK/WebView e o botão Voltar físico do Android ainda dependem de homologação em aparelho; o fechamento por botão visível e Escape foi verificado no navegador.

## Publicação

- Sites **306**, commit `ef75346cadbcd9aaa476482435ca8dfa53760d82`, publicado em 24/09/2026 às 11h12 (Brasília).
- Deploy `appgdep_6ab52fbb79e081919bd037d39dbe014c`, estado `succeeded`.
- URL: https://adote-gestao.da0602766.chatgpt.site
- Home, login e perfil comunitário público HTTP 200; API de publicações sem sessão HTTP 401. JS do painel e CSS publicado com SHA-256 idêntico ao artefato validado. Perfil público confirmado com paleta e navegação de retorno.
- O primeiro push recebeu erro 500 temporário do servidor; o remoto foi conferido antes da repetição, que concluiu por fast-forward. Sem merge no GitHub, alteração de público, migração ou escrita de dados reais.
