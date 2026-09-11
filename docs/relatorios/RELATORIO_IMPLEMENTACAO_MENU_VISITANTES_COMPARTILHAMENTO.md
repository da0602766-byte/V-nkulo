# Relatório de implementação — Menu, Visitantes e Compartilhamento Temporário

Data: 11/08/2026

Especificação oficial: `VINKULO_PROMPT_IMPLEMENTACAO_MELHORIAS_MENU_VISITANTES_COMPARTILHAMENTO(1).docx`

## 1. Auditoria técnica realizada

Foram revisados antes da implementação:

- menu comunitário, menu da conta, navegação inferior mobile e Área do Proprietário;
- módulo Visitantes, categorias, formulários e isolamento por `comunidade_id`;
- escalas, designações, ministérios, checklists e compartilhamento legado;
- autenticação, retorno após login, cookies de sessão e comunidade ativa;
- matriz de papéis, permissões oficiais e gates de backend;
- APIs de Estacionamento e demais módulos protegidos;
- schema Drizzle, migrações, D1 e auditoria persistente;
- vídeos anexados de menu, cartões e compartilhamento em celular;
- temas claro, escuro e automático, CSS responsivo e testes existentes.

## 2. Problemas encontrados e causas

| Área | Problema | Causa identificada |
|---|---|---|
| Menu do usuário | excesso de conteúdo no celular e duas superfícies concorrentes | menu superior e perfil inferior repetiam dados e ações |
| Menu comunitário | ferramentas globais misturadas ao contexto da comunidade | IA/estatísticas estavam no catálogo comunitário |
| URL direta | rota não autorizada podia manter a aba anterior visível após navegação histórica | sincronização ignorava o valor proibido em vez de renderizar o bloqueio |
| Visitantes | categorias não tinham descrição e não possuíam uma permissão dedicada | CRUD reutilizava permissões mais amplas do módulo |
| Compartilhamento | link geral não estava vinculado a uma pessoa e recurso operacional específico | modelo persistente antigo armazenava somente token e janela na escala |
| Mobile do compartilhamento | cabeçalho e ações comprimiam o conteúdo; destinatários não formavam cartões selecionáveis | modal legado concentrava muitas ações genéricas e regras responsivas conflitantes |
| WhatsApp | identificação da pessoa era fraca | destinatários não eram a unidade principal do fluxo |
| Contagem regressiva | o fluxo legado dependia principalmente da página e recarga | faltava um grant persistente com transição confirmada pelo servidor |
| Expiração/cancelamento | página aberta poderia permanecer visualmente ativa por tempo excessivo | faltava revalidação periódica e gate do grant em cada API protegida |
| Tema escuro | texto do aviso amarelo do login tinha contraste insuficiente | seletor genérico de texto do tema sobrescrevia a cor específica do alerta |

## 3. Implementação realizada

### Menu e responsividade

- menu da conta compacto com foto/iniciais, função, e-mail, comunidade ativa, troca de comunidade, tema, conta, área do proprietário, página pública e logout;
- menu superior da conta removido no viewport mobile; o perfil inferior tornou-se a superfície principal;
- IA editorial e Estatísticas removidas do catálogo comunitário e ligadas à Área do Proprietário;
- estado explícito de acesso negado para `?view=` não autorizado, incluindo navegação por histórico;
- áreas roláveis, largura limitada, `safe-area` e tratamento de nomes longos;
- foto de perfil também na navegação inferior quando cadastrada;
- contraste do alerta do login corrigido no tema escuro.

### Categorias de Visitantes

- campo `descricao` persistente;
- CRUD isolado pela comunidade resolvida no servidor;
- permissão dedicada `visitor.categories.manage` disponível no catálogo de autorização de Líderes;
- Pastor recebe a permissão por papel; proprietário passa pelo gate explícito `isOwner`; Líder depende de autorização individual;
- usuário comum recebe `403` no backend;
- desativação preserva dados e bloqueia remoção enquanto houver visitantes ativos vinculados;
- interface trata vazio, carregamento, erro, criação, edição e desativação.

### Compartilhamento temporário por escala

- novo grant persistente com pessoa, comunidade, escala, designação, recurso, início, fim, status e atores;
- token aleatório de 32 bytes; somente SHA-256 e dica final são persistidos;
- recursos suportados nesta entrega: `ESCALA_LEITURA` e `ESTACIONAMENTO`;
- Estacionamento só pode ser liberado por escala do ministério correspondente e quando o módulo está ativo;
- período precisa estar dentro da escala publicada;
- beneficiário precisa estar ativo, escalado e com vínculo ativo na mesma comunidade;
- criação e cancelamento restritos ao responsável/gestor da escala conforme a matriz existente;
- rotação cancela o grant anterior da mesma pessoa/designação/recurso;
- estados persistidos: `PENDENTE`, `AGUARDANDO_HORARIO`, `ATIVO`, `EXPIRADO`, `CANCELADO`, `NEGADO`;
- transição de horário confirmada no backend; contador não libera acesso sozinho;
- retorno seguro após login preserva o token sem aceitar URL externa;
- cookie temporário `HttpOnly`, `Secure`, `SameSite=Strict`, limitado ao fim da autorização;
- revalidação no contexto do tenant em toda API protegida;
- cancelamento, expiração, escala cancelada, designação indisponível, conta inativa ou vínculo suspenso revogam o acesso;
- watchers no painel e na escala somente leitura revalidam a cada cinco segundos e encerram a página já aberta;
- compartilhamento pessoal por WhatsApp mostra foto quando existente, usa iniciais como fallback e envia mensagem com escala, ministério, recurso e período;
- cartões das pessoas permanecem lado a lado em celulares usuais e passam para uma coluna somente abaixo de 340 px;
- seleção múltipla opcional cria um token pessoal diferente para cada integrante e prepara uma única mensagem para conversa ou grupo, sem transformar o link em autorização compartilhada;
- a faixa superior fixa do modal foi removida; o cabeçalho participa da rolagem.

## 4. Banco e migration

Migration: `drizzle/0043_temporary_access_and_visitor_categories.sql`

- adiciona `visitante_categorias.descricao` com valor padrão vazio, preservando as linhas existentes;
- cria `acessos_temporarios` com chaves estrangeiras para comunidade, escala, designação, beneficiário e atores;
- cria índice único de `token_hash`;
- cria índices de escala/status e beneficiário/comunidade/status/término;
- nenhuma tabela ou dado existente foi removido.

## 5. Rotas e APIs

| Rota | Alteração |
|---|---|
| `GET/POST /api/pilot/visitante-categorias` | descrição, gate dedicado, tenant e resposta `canManage` |
| `PATCH/DELETE /api/pilot/visitante-categorias/:id` | gate dedicado, tenant e desativação segura |
| `GET/POST /api/pilot/escalas/:id/acessos` | lista e cria autorizações pessoais |
| `PATCH /api/pilot/escalas/:id/acessos/:accessId` | cancela autorização com ator/data |
| `GET/POST/DELETE /api/acesso-temporario/:token` | consulta, ativa e encerra cookie temporário |
| `GET /api/pilot/acesso-temporario/atual` | revalidação da página aberta |
| `PATCH/DELETE /api/pilot/escalas/:id` | revoga grants ao cancelar escala, indisponibilizar ou remover designação |
| `POST /api/auth/login` | retorno seguro para o link temporário |
| `/acesso/:token` | contador, estados, login, ativação e escala somente leitura |

## 6. Auditoria persistente

Eventos cobertos:

- `ACESSO_TEMPORARIO_CRIADO`;
- `ACESSO_TEMPORARIO_AUTORIZADO`;
- `ACESSO_TEMPORARIO_LINK_GERADO`;
- `ACESSO_TEMPORARIO_LINK_ABERTO`;
- `ACESSO_TEMPORARIO_INICIADO`;
- `ACESSO_TEMPORARIO_SESSAO_ATIVADA`;
- `ACESSO_TEMPORARIO_CANCELADO`;
- `ACESSO_TEMPORARIO_EXPIRADO`;
- tentativas com usuário ou comunidade incorretos.

## 7. Testes executados

| Cenário | Resultado |
|---|---|
| build Vinext e artefato Sites | aprovado |
| aplicação de todas as migrations em SQLite isolado | aprovado |
| Pastor cria categoria | aprovado |
| Líder autorizado cria categoria | aprovado |
| proprietário cria categoria | aprovado |
| Líder comum tenta criar | `403`, aprovado |
| categoria da comunidade A não aparece na B | aprovado |
| troca de comunidade e tentativa por ID de outro tenant | aprovado |
| desativação de categoria | aprovado |
| link inválido | `404`, aprovado |
| abrir antes do horário | `AGUARDANDO_HORARIO`, aprovado |
| ativar antes da hora | `409`, aprovado |
| contador consulta o servidor sem recarga manual | aprovado por teste estrutural e fluxo da API |
| abrir no horário | `ATIVO`, aprovado |
| usuário incorreto | `403`, aprovado |
| comunidade incorreta | `403`, aprovado |
| Estacionamento autorizado | `200`, aprovado |
| tentativa direta de Visitantes com grant de Estacionamento | `403`, aprovado |
| cancelamento pelo Líder | grant e operação bloqueados, aprovado |
| expiração | `EXPIRADO` e operação bloqueada, aprovado |
| escala cancelada | grant `CANCELADO`, aprovado |
| vínculo com comunidade suspenso | grant `CANCELADO`, aprovado |
| retorno após login preservando token | redirecionamento seguro, aprovado |
| cartões mobile, foto do WhatsApp e cabeçalho não fixo | teste estrutural aprovado |
| tema claro e escuro no navegador | aprovado; contraste adicional corrigido |
| lint | zero erros; permanecem avisos conhecidos de `<img>` e um hook legado fora deste escopo |
| suíte completa | 65/65 testes aprovados |

## 8. Arquivos principais alterados

- `app/components/PilotDashboard.tsx`, `OwnerWorkspace.tsx`, `SecretaryMinisterialWorkspace.tsx`, `TenantOperations.tsx`;
- `app/components/TemporaryAccessFlow.tsx`, `TemporaryAccessWatcher.tsx`, `TemporaryScheduleBoundary.tsx`;
- `app/lib/temporary-access.ts`, `visitor-category-access.ts`, `safe-return-path.ts`, `tenant.ts`, `tenant-policy.mjs`;
- `app/api/acesso-temporario/[token]/route.ts`;
- `app/api/pilot/acesso-temporario/atual/route.ts`;
- `app/api/pilot/escalas/[id]/acessos/route.ts` e `[accessId]/route.ts`;
- APIs de escalas, categorias e login;
- `app/acesso/[token]/page.tsx`, login e autenticação;
- `app/globals.css`, `app/secretary.css`;
- `db/schema.ts`, migration 0043 e jornal Drizzle;
- `tests/temporary-access.test.mjs`, `tests/mobile-sharing-property.test.mjs`.
- `app/lib/client-image.ts`, `NativeImageUpload.tsx`, login e superfícies legadas de imagem;
- `tests/image-and-community-profile.test.mjs`.

## 9. Pendências e riscos residuais

- homologação final em aparelhos Android e iPhone físicos continua recomendada; nesta execução houve validação estrutural mobile e inspeção real em navegador desktop nos temas claro/escuro;
- envio automático de WhatsApp não foi simulado nem marcado como concluído: continua dependente de provedor oficial, consentimento, templates e credenciais;
- solicitação para pessoa sem conta não foi criada porque a arquitetura atual de escala exige usuário e vínculo ativo; implementar isso exigirá uma decisão formal de identidade/verificação, sem criar conta administrativa fictícia;
- links gerais legados de escala continuam válidos somente para compatibilidade histórica e modo leitura; o novo fluxo operacional não cria nem expõe esse link na interface;
- avisos de otimização de imagens já existentes não bloqueiam build ou funcionamento.

## 10. Recomendação

Após a publicação, realizar uma homologação curta em um Android e um iPhone reais com duas comunidades de teste, validando rotação, teclado virtual, área segura inferior e encerramento de uma página de Estacionamento mantida aberta durante cancelamento.

## 11. Complemento V8.2.3 — perfil, imagens, integrantes e grupos

- O cartão institucional da página pública foi estilizado e reorganizado para desktop e celular; banner, texto, privacidade e solicitação de entrada continuam isolados dos dados internos.
- A sobreposição clara do banner foi reduzida para preservar a imagem sem perder legibilidade.
- O limite da imagem original subiu de 30 MB para 50 MB. Todos os uploads nativos passam por conversão WebP; fundos e banners preservam até 3840 px e até 7,5 MB antes do envio ao backend, cujo limite passou para 8 MB.
- SVG permanece recusado para evitar conteúdo ativo. JPG, PNG, WebP, GIF, BMP e AVIF decodificáveis pelo navegador são convertidos para uma imagem WebP estática.
- O portal de login ganhou enquadramento `SMART`, que mostra a imagem inteira; o modo `COVER` continua disponível quando o proprietário preferir preencher toda a tela aceitando recorte.
- A tela `Ministério → Integrantes` recebeu contenção global de largura, sem regras específicas para o nome Louvor ou para a comunidade Renascer.
- O compartilhamento aceita até 30 designações válidas em uma única operação. O backend valida todas antes de criar o lote, cancela links anteriores da mesma pessoa/recurso, gera hashes distintos e registra auditoria por autorização.
- A mensagem para grupo identifica cada pessoa e seu link. Usuário, comunidade, escala, recurso, período e status continuam validados individualmente no backend.
- Build, artefato, lint sem erros e **65/65 testes** foram aprovados. Permanecem 31 avisos conhecidos, principalmente elementos de imagem legados.

## 12. Atualização V8.2.4 — confirmação, histórico e proprietário

### Acesso temporário e escalas

- A página mostra o nome da pessoa autorizada e utiliza iniciais como identificação visual quando necessário.
- O login reconhece o retorno para `/acesso/:token`, explica que deve ser usada a conta da pessoa escalada e retorna automaticamente ao link após autenticar.
- O beneficiário precisa responder `CONFIRMADA`, `INDISPONIVEL` ou `SUBSTITUICAO_SOLICITADA`. A confirmação é validada no backend, inclusive com conflito de horário; sem `CONFIRMADA`, a ativação retorna `409`.
- Respostas negativas cancelam a autorização temporária. Cancelamento e expiração revogam operações na próxima requisição, inclusive quando a página já estava aberta.
- Líderes e responsáveis recebem notificação persistente da resposta.

### Compartilhamento e ministérios

- O diálogo de compartilhamento não carrega nem renderiza mais o histórico, reduzindo altura e eliminando a atualização automática que podia desmontar o fluxo.
- O histórico foi movido para `Ministério → Histórico`, em linhas de texto com pessoa, recurso, escala, período, status e ação de cancelamento quando aplicável.
- Exclusão e arquivamento ficaram restritos à área de risco de `Ministério → Configurações`.
- `SUBSTITUICAO_SOLICITADA` passou a ser estado reconhecido pelas telas e pela geração de novos acessos.

### Proprietário, cadastro e permissões

- A página do proprietário ganhou central de comando, ações rápidas, métricas reorganizáveis, gráfico de distribuição real dos dados atuais e resumo das regras de governança.
- A ficha de solicitação mostra e permite revisar as respostas institucionais e as abas solicitadas.
- O cadastro de comunidade oferece módulos de Eventos, Ministérios, Diaconia, Visitantes, Células, Estacionamento, Pessoas e Redes.
- Dependências são automáticas: Diaconia e Estacionamento incluem Ministérios; Visitantes inclui Células. Ao desativar uma dependência, os módulos dependentes também são removidos.
- Na aprovação, a seleção é gravada em `configuracoes` na chave `community_modules:<comunidadeId>`. Não houve migration nem alteração destrutiva de schema.
- O backend filtra permissões conforme os módulos habilitados; tentativa direta por rota/API continua sujeita ao gate do tenant. Comunidades existentes sem a chave preservam todos os módulos por compatibilidade.

### Responsividade e validação

- Categorias de Visitantes usam três colunas padronizadas no desktop e uma coluna no celular.
- Novos blocos do proprietário, ficha, seleção de módulos, histórico e confirmação possuem contratos responsivos e tema escuro.
- Build Vinext e artefato Sites: aprovados.
- Lint: zero erros; 31 avisos legados conhecidos, sem bloqueio.
- Suíte completa: **69/69 testes aprovados**, incluindo integração SQLite/D1 para tenant, permissões, expiração, cancelamento e confirmação de escala.
- Prévia em navegador real: login temporário renderizado com contexto de retorno, largura da página igual à viewport (1363 px), sem overflow horizontal e sem alertas.

### Arquivos principais desta atualização

- `app/components/TemporaryAccessFlow.tsx`, `LoginPortal.tsx`, `SecretaryMinisterialWorkspace.tsx`, `OwnerWorkspace.tsx`, `CreateCommunityShortcut.tsx` e `PilotDashboard.tsx`;
- `app/api/acesso-temporario/[token]/route.ts`, `app/api/pilot/escalas/[id]/acessos/route.ts`, `app/api/pilot/comunidades/route.ts` e `app/api/proprietario/route.ts`;
- `app/lib/community-modules.ts`, `app/lib/tenant.ts` e `app/lib/temporary-access.ts`;
- `app/acesso/[token]/page.tsx`, `app/globals.css`, `app/secretary.css`;
- `tests/temporary-access.test.mjs` e `tests/v97-owner-access-flow.test.mjs`.

### Risco residual

- A área autenticada do proprietário e os fluxos ministeriais dependem de dados e sessão de produção, portanto a homologação final em Android e iPhone físicos ainda é recomendada após a publicação. A suíte, o build e a prévia pública não encontraram regressões estruturais.

## 13. Atualização V8.2.5 — segurança de acesso, substituição, histórico e capa

### Evidência encontrada nos anexos

- O vídeo de 11/08/2026 mostrou uma corrida real: a página renderizava `Acesso liberado` e o botão com o nome da beneficiária usando o estado inicial; somente depois a API identificava que a sessão aberta pertencia a outra pessoa. Um toque rápido alcançava o painel antes dessa resposta.
- A imagem de configurações mostrou o seletor de capa no Android sem uma ação explícita de troca. A auditoria também encontrou o proprietário da comunidade ausente do gate global usado pelo endpoint de upload ministerial.

### Alterações realizadas

- `TemporaryAccessFlow` inicia em `checking` e não apresenta login, confirmação nem acesso ao conteúdo até o GET sem cache validar token, sessão, pessoa e comunidade. Falha de rede/revalidação muda para estado bloqueado.
- O backend e a página direta de conteúdo exigem designação `CONFIRMADA`; o cookie temporário sozinho não libera leitura.
- Respostas negativas exigem `substitutoVoluntarioId`. O servidor limita a escolha ao mesmo ministério e comunidade, vínculo ativo, usuário ativo, ausência na escala e ausência de conflito de horário.
- A designação original passa para `INDISPONIVEL` ou `SUBSTITUICAO_SOLICITADA`; a substituta nasce `PENDENTE`, recebe notificação e precisa confirmar sua própria participação.
- O fluxo foi aplicado na página de acesso temporário, visão geral da comunidade e nas duas superfícies ministeriais preservadas.
- A aba `Histórico` ganhou `Excluir histórico`. O endpoint `DELETE` reutiliza `canManageSchedule`, portanto só líderes/responsáveis, donos da comunidade e proprietário autorizado passam pelo backend. Excluir um grant ativo invalida o token imediatamente; a exclusão permanece registrada em `auditoria_piloto`.
- A permissão global de ministérios passou a reconhecer `communityAccess === "OWNER"`, corrigindo o upload da capa para quem criou/possui a comunidade.
- O upload ganhou botões explícitos `Escolher imagem` e `Trocar imagem`, estado de erro/sucesso e limpeza do input para permitir selecionar o mesmo arquivo novamente. A conversão WebP e os limites existentes foram preservados.
- Datas SQLite sem sufixo de fuso passaram a ser interpretadas como UTC na expiração, eliminando variação de ambiente sem alterar dados.

### Banco, migrations e APIs

- Nenhuma migration e nenhuma coluna nova: a substituição usa `escala_designacoes`; a exclusão remove a linha de `acessos_temporarios` depois de auditar.
- APIs alteradas: `GET/POST /api/acesso-temporario/:token`, `GET/PATCH /api/pilot/escalas`, `DELETE /api/pilot/escalas/:id/acessos/:accessId` e o gate já utilizado por `/api/pilot/uploads`.
- O isolamento continua obrigatório em todas as consultas por `comunidade_id`, `escala_id`, `ministerio_id` e usuário autenticado.

### Validação desta atualização

- Build Vinext e artefato Sites: aprovados.
- Lint: zero erros; apenas avisos legados de otimização de imagens/hook fora deste escopo.
- Suíte integral: 73 testes, incluindo integração SQLite/D1 para pessoa errada, confirmação, expiração, substituição obrigatória, conflito, permissão de exclusão, remoção do grant e token inválido após a exclusão.
- Testes específicos V8.2.5: corrida de validação bloqueada, conteúdo condicionado a `CONFIRMADA`, substituto real obrigatório, histórico protegido e troca de capa disponível ao dono da comunidade.

### Arquivos principais

- `app/components/TemporaryAccessFlow.tsx`, `CommunityHome.tsx`, `SecretaryMinisterialWorkspace.tsx`, `MinistriesWorkspace.tsx` e `NativeImageUpload.tsx`;
- `app/api/acesso-temporario/[token]/route.ts`, `app/api/pilot/escalas/route.ts`, `app/api/pilot/escalas/[id]/route.ts` e `app/api/pilot/escalas/[id]/acessos/[accessId]/route.ts`;
- `app/lib/schedule-substitution.ts`, `app/lib/ministry-access.ts` e `app/lib/temporary-access.ts`;
- `app/acesso/[token]/page.tsx`, `app/globals.css`, `app/secretary.css`;
- `tests/temporary-access.test.mjs` e `tests/v98-security-substitution-history.test.mjs`.

### Risco residual

- A seleção de imagem e os fluxos autenticados foram cobertos por build, contratos responsivos e testes de backend; uma rodada curta em Android e iPhone físicos continua recomendada para validar o seletor nativo de arquivos de cada fabricante.

## 14. Atualização V8.2.6 — exibição integral da capa ministerial

### Evidência e causa

- As imagens de 11/08/2026 mostraram que o arquivo era salvo, mas continuava visualmente incorreto: a capa recebia uma camada escura de até 94%, o título permanecia sobre a fotografia com cor inadequada e a ficha do líder herdava contraste pensado para o fundo escuro.
- Em Configurações, o componente reutilizava a prévia quadrada de avatar (`58 × 58 px`) com `object-fit: cover`; por isso o usuário via apenas um fragmento do banner e não conseguia avaliar a imagem escolhida.

### Correção realizada

- A capa passou a ser um bloco de mídia independente no topo do cabeçalho ministerial. Título, descrição e líder ficam abaixo, sobre a superfície normal do tema, sem sobreposição ou filtro que apague a imagem.
- A imagem usa `object-fit: contain`, enquadramento central e proporção responsiva `16:7` no desktop e `16:9` no celular. Assim, nenhuma parte da imagem é cortada; imagens com proporção diferente podem apresentar faixas discretas de preenchimento, por decisão explícita de preservar o arquivo completo.
- O upload nativo ganhou `previewMode="banner"`. A prévia ministerial ocupa toda a largura disponível e também usa `contain`, substituindo o recorte quadrado sem alterar as prévias de avatar, logotipo ou outros usos.
- O texto alternativo identifica nominalmente o ministério e a correção está no componente compartilhado, portanto vale para Louvor, Renascer e todas as comunidades.

### Arquivos, dados e validação

- Arquivos: `app/components/SecretaryMinisterialWorkspace.tsx`, `app/components/NativeImageUpload.tsx`, `app/secretary.css`, `app/globals.css` e `tests/v98-security-substitution-history.test.mjs`.
- Banco/migrations/APIs: nenhuma alteração; o fluxo de upload, conversão WebP, limites, autorização e isolamento por comunidade permanecem os mesmos.
- Build Vinext e artefato Sites: aprovados.
- Lint: zero erros; permanecem apenas avisos conhecidos de otimização de imagens e hooks legados.
- Suíte integral: **74/74 testes aprovados, sem falhas**, incluindo a nova regressão que bloqueia a volta do filtro escuro, da sobreposição e da prévia recortada.
- Prévia pública: carregada sem erro de aplicação ou erro de console. A área ministerial autenticada permanece recomendada para uma homologação final no Android físico após a publicação.

## 15. Atualização V8.2.7 — correção real da imagem quebrada

### Evidência e causa confirmada

- As fotos de 11/08/2026 exibem o ícone de imagem quebrada e os textos alternativos `Prévia da imagem selecionada` e `Capa do ministério Louvor`. Portanto, o problema já não era enquadramento: o navegador não conseguia obter o arquivo.
- O `POST /api/pilot/uploads` armazenava corretamente a capa em `images/ministry-banner/ministry-<id>/<uuid>.webp`, mas o `GET /api/pilot/uploads/:key+` recusava qualquer pasta `ministry-<id>` antes de consultar o R2. O frontend recebia sucesso no envio e salvava uma URL que a própria rota de leitura classificava como inválida.

### Correção e compatibilidade

- Foi criada uma única política compartilhada para finalidades, segmento proprietário e validação de chaves. O gerador do upload e a rota que entrega o arquivo agora usam a mesma regra, evitando nova divergência.
- Capas já enviadas continuam no R2 e seus endereços persistidos passam a funcionar após a publicação; não é necessário escolher a imagem novamente.
- A validação continua estrita: `ministry-banner` aceita somente `ministry-<número>`, foto de perfil somente `user-<número>`, demais finalidades mantêm escopo numérico e tentativas de travessia permanecem recusadas.
- Não houve alteração visual adicional, perda de arquivo, alteração de banco ou migration.

### Arquivos e testes

- Arquivos: `app/lib/upload-key-policy.mjs`, `app/api/pilot/uploads/route.ts`, `app/api/pilot/uploads/[...key]/route.ts` e `tests/image-and-community-profile.test.mjs`.
- API corrigida: `GET /api/pilot/uploads/:key+`; o formato produzido pelo `POST /api/pilot/uploads` foi preservado.
- Build Vinext e artefato Sites: aprovados.
- Lint: zero erros; 34 avisos conhecidos e não bloqueantes.
- Suíte integral: **75/75 testes aprovados, sem falhas**. A nova regressão executa a política real e comprova aceitação da chave ministerial, preservação das chaves válidas e bloqueio de formato incompatível/travessia.
- Prévia pública: largura do documento igual à viewport e nenhum erro da aplicação no console.
