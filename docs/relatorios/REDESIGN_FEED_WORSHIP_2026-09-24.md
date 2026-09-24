# Redesign do Feed — 24/09/2026

Implementado na branch `codex/feed-worship-redesign`, a partir da imagem fornecida e do protótipo `vinkulo-feed-worship` do ZIP. Sem merge, push, deploy ou migração.

## Implementação

O Feed recebeu uma composição própria: título editorial serifado, violeta/lilás, superfícies claras, destaques circulares, compositor compacto com ações reais, publicações com fotografia, busca local e coluna contextual. A estrutura visual anterior de cabeçalho, feed, compositor e lateral foi substituída; a lógica operacional permanece nos componentes existentes.

### Arquivos principais

| Arquivo | Alteração |
| --- | --- |
| `app/components/CommunityHome.tsx` | Nova estrutura; destaques derivados de posts publicados; busca nas publicações carregadas; compositor no centro; estados vazios/erro; lateral móvel expansível. |
| `app/components/feed/FeedHighlights.tsx` | Destaques sem categorias ou fotos inventadas; navegação ao post e respeito à economia de dados. |
| `app/components/feed/FeedComposerBar.tsx` | Texto, foto, evento próprio disponível e acesso ao fluxo real de pedidos. |
| `app/components/feed/FeedIcon.tsx` | Ícones SVG locais, sem nova dependência. |
| `app/components/feed/useFeedDialog.ts` | Foco inicial, Tab/Shift+Tab, Escape, restauração de foco e bloqueio de rolagem. |
| `app/feed-worship.css` e `app/layout.tsx` | Estilos isolados do Feed, adaptação desktop/tablet/celular e diálogos limitados ao viewport. |
| `app/components/PilotDashboard.tsx` | Shell contextual; nova publicação nas ações rápidas; preservação dos atalhos pessoais e Menu; remount por comunidade. |
| `app/components/ResponsiveFeedImage.tsx` | Modo fotográfico progressivo, proporção reservada, abertura e download; modo de anexos preservado para outros usos. |
| `app/components/CommunityPostReactions.tsx` | Erro visível com reversão da reação otimista. |
| `app/components/CommunityPostShare.tsx` | Texto de compartilhamento e acessibilidade do diálogo. |
| `app/lib/pilot-data.ts`, `app/painel/page.tsx`, `app/api/pilot/publicacoes/route.ts` | Audiência e canal filtrados também no SSR; vínculo do ministério à comunidade conferido nas consultas. |
| `tests/feed-worship.test.mjs` e testes existentes | Regressão de segurança, acesso somente leitura, mídia e integração; atualização das asserções da estrutura visual substituída. |

### Funcionalidades mantidas

Criação, rascunho, aprovação, edição, ocultação, exclusão autorizada, denúncias, upload existente, links e vinculação de eventos próprios; audiência por ministério, canais Feed/Lateral, configuração de comentários; quatro reações persistentes e sua remoção; comentários sob demanda; compartilhamento nativo/WhatsApp/Telegram/Facebook/cópia; download de imagem; escalas com confirmação, indisponibilidade e substituição; presença, privacidade, perfil e conversa; notificações, troca de comunidade, configurações de aparência e navegação por permissão.

Não foram inventadas funcionalidades de vídeo, Stories temporários ou publicações salvas. O destaque abre um post existente. O bloco de pedidos direciona ao módulo real, sem expor pedidos privados na lateral. Não foi acrescentado versículo ou ministério demonstrativo para preencher a tela.

### Desktop e mobile

No desktop, navegação lateral persistente, centro dominante e coluna de eventos, pedidos, escalas e presença. A largura máxima mantém a leitura em monitores grandes. Menus permanecem condicionados ao perfil.

No celular, compositor compacto, destaques com rolagem própria e barra inferior fixa com os três atalhos configuráveis, ação central e Menu. Perfil e demais áreas continuam no Menu. A ação central inclui Nova publicação somente com `feed.publish`. O botão Comunidade expande o conteúdo contextual acima do feed. A faixa de tablet até 820 px também mantém navegação inferior acessível.

## Dados e segurança

Nenhum usuário, publicação, comentário, evento, foto, pedido ou estatística fictícia foi inserido no banco real. Os arquivos de exemplo do ZIP não foram importados para o produto.

A validação funcional utilizou o helper de testes já existente, que cria SQLite **em memória**, com suas fixtures. As publicações e comentários de QA foram limitados a esse processo descartável. Para verificar proporção/carregamento, a imagem de referência fornecida foi servida apenas pelo servidor local de testes. Nada disso integra o build ou os dados reais.

Foram preservadas sessão, `requireTenantPermission`, propriedade, moderação, `communityId`, acesso `FEED_ONLY`, upload e isolamento no servidor. A auditoria identificou que a primeira consulta SSR filtrava comunidade/status, mas não audiência/canal. Ela agora respeita usuário e moderação, ministérios autorizados e `canal_feed`; a API também confere que o ministério pertence à comunidade da publicação. Não houve alteração de tabelas ou permissões concedidas.

## Performance

Os destaques usam a lista já carregada: nenhuma consulta adicional por destaque. Busca e categorias são locais e explicitamente limitadas às publicações carregadas. Preservados cursor de 10 itens, carregamento gradual e teto de 60 posts no DOM. Comentários continuam sob demanda. Imagens usam lazy loading, decodificação assíncrona, dimensões/proporção, `srcSet` e thumbnails disponíveis, sem a antiga duplicação como fundo CSS do post. Economia de dados também alcança os destaques.

Nenhuma biblioteca, fonte ou asset fotográfico foi adicionado. Medição do build: chunk `PilotDashboard` aproximadamente 109 KB / 29 KB gzip; CSS novo aproximadamente 27 KB / 5,3 KB gzip. São tamanhos finais, não uma comparação de velocidade com produção.

## Validação

| Verificação | Resultado |
| --- | --- |
| Build | Aprovado com `vinext build`; Worker ESM `default.fetch` e manifesto Sites validados. |
| Lint | 0 erros; 88 avisos no projeto (86 anteriores, 2 novos de `<img>` com fontes dinâmicas existentes). Arquivos da alteração: 0 erros. |
| Typecheck | `tsc --noEmit` aprovado. |
| Testes | 493/493 aprovados, incluindo testes de integração e os quatro novos testes do Feed. |
| QA desktop | Navegador local, build de produção e banco em memória; layout, busca, filtros, destaques, compartilhamento e foco. |
| QA mobile | 360, 375, 390 e 412 px; tablet 768 px; barra inferior e menu, ação central, diálogo, publicação/edição, reações e comentários. |

Medição de overflow de página: **nenhuma rolagem horizontal** em 360, 375, 390, 412, 768, 1024, 1280, 1366, 1440 e 1920 px. Verificados tema claro/escuro e fonte ampliada a 125%. Modal de criação em 360×800: contido no viewport, com rolagem interna e foco no título. Verificados Escape e retorno de foco, busca sem resultado e destaque limpando os filtros antes de abrir o post.

O comando wrapper `npm run build` encontrou limitação de caminhos/permissões do Bash no Windows. Foi executado o mesmo compilador pelo binário Windows e feita a validação do artefato diretamente, sem modificar scripts de publicação.

## Limites da homologação

- Upload externo Google Drive, seletores/compartilhamento nativos e teclado virtual em aparelho físico/APK precisam de homologação com as integrações e dispositivos reais. Os fluxos existentes foram preservados; não foi feito envio a terceiros durante QA.
- O banco local persistente está incompleto para a sessão operacional; por isso a conferência funcional ocorreu com a infraestrutura isolada de testes. Não se afirma homologação em produção.
- Fidelidade de fotografias e densidade de conteúdo no ambiente real dependem das publicações existentes. Estados vazios não recebem imagens, categorias ou contagens ilustrativas.

Entrega local pronta para revisão. Publicação e merge continuam pendentes de autorização explícita.
