# ESTADO DO PROJETO — REFORMA OFICIAL DO VÍNKULO

## Identificação

- **Versão-base:** V4.7.3, com a Reforma Oficial do VÍNKULO, os ajustes operacionais V4.7.4 e a otimização global segura autorizada em 13/08/2026.
- **Data da última análise:** 28/08/2026.
- **Estado deste documento:** vigente. Decisões históricas incompatíveis foram removidas deste arquivo.
- **Publicação automática do Site:** autorizada pelo proprietário para grupos completos que tenham build, testes e evidências aprovados; uma etapa com falha não pode ser publicada.
- **Regra global:** toda evolução funcional vale para comunidades existentes e futuras, exceto quando o proprietário solicitar explicitamente uma exceção.

## Decisões oficiais vigentes

1. A raiz `/` é uma Landing Page comercial do VÍNKULO.
2. Não existe mais feed público agregado da plataforma.
3. Permanecem públicas as páginas institucionais, o diretório e publicações que a comunidade marcou expressamente para compartilhamento público.
4. Comentários em publicações públicas exigem conta ativa; o autor pode desativá-los e a privacidade do perfil é respeitada.
5. Usuários, líderes e pastores não criam comunidades diretamente.
6. A ficha de nova comunidade cria apenas uma solicitação.
7. Somente Douglas, proprietário global, analisa, ajusta, aprova, cria e ativa a comunidade.
8. O selo pastoral de criação foi aposentado e não participa mais do fluxo.
9. A Área do Proprietário é separada das comunidades.
10. O proprietário possui acesso global, integral e validado no servidor a todas as comunidades ativas, sem exceções de módulo.
11. A automação editorial publica somente no feed interno da comunidade selecionada.
12. Equipes ministeriais são administradas dentro de cada ministério.
13. Categorias de Visitantes pertencem à comunidade ativa e só podem ser gerenciadas pelo proprietário, Pastor ou Líder com permissão explícita.
14. Acesso temporário operacional é independente de cargo e obedece pessoa, comunidade, escala, recurso, horário e status persistido.
15. IA editorial e estatísticas globais permanecem fora do menu comunitário e acessíveis apenas na Área do Proprietário.
16. Imagens originais de até 50 MB são convertidas no navegador para WebP antes do envio; SVG continua bloqueado por segurança.
17. O compartilhamento pode selecionar várias pessoas, mas preserva um token pessoal e intransferível por usuário, inclusive quando a mensagem é enviada a um grupo.
18. Continuidade permanece dentro de Gestão da Comunidade, mas somente o dono cadastrado daquela comunidade recebe acesso operacional; o proprietário global conserva a supervisão protegida da plataforma. Pastor, Líder e Administrador não recebem essa permissão somente pelo cargo.
19. A Área do Proprietário possui um otimizador seguro, manual e automático, limitado a registros vencidos e às retenções oficiais. Usuários, comunidades, ministérios, conteúdos, imagens, arquivos e registros ativos nunca fazem parte da limpeza.

## Estrutura atual do Site

- Landing Page comercial responsiva em `/`, com apresentação do produto, recursos, governança de criação e chamada para o diretório.
- A recepção pública usa cabeçalho compacto, busca recolhível, temas agrupados, Editor Visual persistente e menu de conta com acesso ao painel e logout.
- Diretório institucional em `/comunidades` e página institucional em `/comunidades/[slug]`, sem publicações agregadas.
- Área autenticada da comunidade em `/painel`, mantendo isolamento lógico por `comunidade_id`.
- Área exclusiva e independente do proprietário em `/proprietario`.
- Central de Otimização exclusiva do proprietário, com diagnóstico, agendamento diário/semanal/mensal, execução manual e relatório antes/depois.
- Login, cadastro individual, recuperação de acesso, páginas legais, acesso negado e tratamento de erro.
- Painéis de membro, líder, pastoral e administração comunitária.
- Ministérios com integrantes, equipes, funções, recursos, escalas, checklists, relatórios e configurações.
- Eventos, visitantes, células, oração e solicitações, Diaconia, estacionamento e redes no contexto comunitário; Continuidade somente para o dono da comunidade; IA editorial e estatísticas exclusivamente na Área do Proprietário.
- Aparência/Editor Visual, temas claro, escuro e automático e navegação responsiva.

## Módulos da auditoria implementados

### Módulo 1 — Landing Page e superfície pública

- Página comercial substituiu o antigo feed público na raiz.
- Diretório e páginas institucionais continuam disponíveis.
- Endpoints antigos de feed agregado e criação de publicações da plataforma permanecem encerrados (`410`).
- Comentários de publicações públicas foram restaurados com login obrigatório, perfil opcional e acesso básico do proprietário global.
- Publicações de texto não recebem mais imagens ou capas demonstrativas geradas pela interface.
- Nenhuma publicação interna aparece na Landing Page.
- Comunidades reais criadas antes da reforma voltaram ao diretório e ao seletor autenticado sem reativar as duas sementes demonstrativas.
- Páginas institucionais e solicitações de entrada não exigem a antiga marcação de ambiente demonstrativo.
- Publicações escolhidas pela comunidade podem aparecer em sua página pública quando o feed público estiver habilitado.
- O diretório recebeu filtros recolhíveis por cidade, ordenação e cartões com informações públicas recolhíveis.

### Módulo 2 — Solicitação e governança de comunidades

- A ficha configurável registra uma solicitação pendente no banco.
- Nenhuma comunidade é criada no envio da ficha.
- Solicitações duplicadas em análise são bloqueadas.
- Aprovação, recusa e início de análise são exclusivos do proprietário e auditados.
- A aprovação cria a comunidade, o vínculo administrativo inicial, o tema padrão e a ativação.
- O fluxo antigo de selo pastoral foi explicitamente desativado.
- A ficha em três etapas foi reorganizada em uma única janela responsiva, com cabeçalho e ações persistentes e sem sobreposição no celular.

### Módulo 3 — Área do Proprietário

- Página separada das comunidades, protegida por `system_owner`.
- Indicadores globais de comunidades, usuários, ministérios, solicitações, eventos e conversas.
- Abas de solicitações, comunidades, usuários, auditoria e configurações globais.
- Pesquisa de comunidades e usuários.
- Auditoria pesquisável, filtrável e expansível, com metadados sensíveis ocultados.
- Atalhos “Ver todas” na visão geral e explicação de escopo recolhível.
- Abertura de qualquer comunidade com acesso integral.
- Troca de comunidade validada no backend.
- O contexto global é resolvido como `SUPERADMIN` + `OWNER` em toda comunidade ativa.
- A autorização não depende de botões escondidos; é aplicada pela camada de tenant e permissões do servidor.

### Módulo 4 — Comunicação e Ministérios

- Chat privado com carregamento incremental de mensagens.
- Polling reduzido e executado somente com a página visível e conversa ativa.
- Envio atualiza a conversa sem recarregar toda a lista.
- Conversas deixaram de aparecer duplicadas entre “recentes” e “iniciar conversa”.
- Mensagens e notificações são superfícies separadas; mensagens não geram cópias no sino.
- Janela rápida não bloqueia o desktop, pode ser minimizada/maximizada e abre a central completa.
- A rota `view=mensagens` agora é preservada ao atualizar a página.
- Aba explícita `Equipes` dentro de cada ministério.
- Criação e consulta de equipes reutilizam o backend persistente e isolado já existente.
- Integrantes e equipes permanecem separados visualmente para reduzir ambiguidade.

## Funcionalidades existentes

- Autenticação por e-mail e senha, sessões persistentes e revogáveis.
- Papéis e permissões validados no backend.
- Isolamento por comunidade em consultas e mutações.
- Troca de comunidade apenas para vínculos autorizados; o proprietário global recebe vínculo sintético seguro para todas as ativas.
- Cadastro individual sem entrada automática em comunidade.
- Solicitações de entrada, convites, notificações e presença.
- Feed interno com criação, edição, ocultação, imagens e comentários conforme permissão.
- Eventos, calendário e confirmação de presença.
- Visitantes, acompanhamentos e células.
- Ministérios, equipes, integrantes, funções, recursos, escalas, designações e checklists.
- Diaconia e relatórios derivados das escalas.
- Estacionamento, operadores, vagas, movimentações, ocorrências e mapa configurável.
- Continuidade, cancelamento, desativação e reativação com ações críticas protegidas.
- Redes e afiliadas preparadas e desativadas por padrão.
- Automação editorial com revisão humana, políticas, agenda e auditoria.
- Painel pastoral com indicadores restritos à comunidade e delegação controlada.
- Editor Visual e paletas predefinidas, com suporte a celular e computador.
- Upload nativo de imagens via armazenamento configurado no ambiente hospedado.
- Comentários públicos persistentes para usuários ativos, com opção de ocultar o perfil.
- Perfil pessoal reorganizado em seções legíveis e recolhíveis, com campos complementares e controles de privacidade preservados.

## Funcionalidades somente visuais ou preparatórias

- Valores comerciais de redes/afiliadas são apenas preparação; não processam cobrança.
- Geração livre de conteúdo por IA não é simulada no frontend.
- Algumas ações críticas de continuidade permanecem bloqueadas até MFA homologado.
- Indicadores demonstrativos dependem da qualidade e quantidade dos dados inseridos.

## Funcionalidades pendentes ou dependências externas

- Provedor de IA executado no backend para gerar conteúdo novo.
- MFA homologado para operações críticas.
- E-mail, WhatsApp, push e outras notificações externas automáticas.
- Criação segura de credencial temporária e validação automática do número de WhatsApp para convidados sem conta; a versão atual usa link temporário individual, somente leitura e com prazo configurável.
- Gateway de pagamento e cobrança real.
- WebSocket para presença, digitação e entrega de mensagens em tempo real.
- Agendador externo para garantir despacho editorial sem qualquer tráfego no sistema.
- Relatórios físicos avançados, leitura automática de placas e integração com cancelas.

## Limitações do ambiente

- O runtime do Sites hospeda o frontend e as APIs, mas integrações externas exigem serviços e credenciais configurados no backend.
- Segredos não podem ser colocados no frontend.
- Uploads dependem do bucket configurado no ambiente hospedado.
- A interface não deve ser tratada como segurança; autorização continua sendo responsabilidade do servidor.

## Riscos e controles

- **Risco de mistura entre comunidades:** mitigado pelo tenant resolvido no servidor e testes de isolamento.
- **Risco de privilégio apenas visual:** mitigado por permissões em APIs e pelo contexto global explícito do proprietário.
- **Risco de criação indevida de comunidade:** mitigado por solicitação persistente e aprovação exclusiva do proprietário.
- **Risco de reaparecimento do feed público:** endpoints antigos estão encerrados e a raiz não consulta publicações.
- **Risco de dados demonstrativos em produção:** comunidades, posts, rascunhos editoriais e movimentações fictícias foram arquivados, sem exclusão, com evento de auditoria por comunidade.
- **Risco editorial:** toda programação exige autorização humana e é convertida para visibilidade `COMUNIDADE`.
- **Risco de chat lento:** mitigado por busca incremental, polling condicional e atualização local após envio.
- **Risco de arquivamento indevido:** mitigado por migração corretiva auditada, que restaura apenas comunidades reais gerenciadas e mantém as sementes piloto arquivadas.
- **Risco de regressão:** coberto pela suíte automatizada de 103 testes.
- **Risco de exclusão indevida pelo otimizador:** mitigado por lista fechada de seis tarefas, bloqueio de concorrência, auditoria e testes que preservam sessão ativa e solicitação pendente.

## Último bloco concluído

- Reforma móvel do estacionamento de 28/08/2026: a seleção de um setor passou a revelar imediatamente o posicionamento persistido das vagas; o mesmo mapa real é reutilizado na escolha da vaga, com estados livre, reservada, ocupada e selecionada.
- A tela “Onde você quer parar?” permanece consultável mesmo antes da abertura da reserva ou na ausência de evento publicado. A confirmação continua bloqueada até a janela autorizada, e falhas de carregamento oferecem nova tentativa sem deixar a superfície inacessível.
- O editor do mapa passou de arraste dependente de mouse para Pointer Events com captura de toque, atualização visual imediata e persistência sem recarregar todo o módulo após cada movimento. Foram acrescentadas sugestões de vagas diagonais e ao redor do setor.
- A remoção de pessoas recebeu folha móvel legível, confirmação controlada por `REMOVER`, botão destrutivo explícito, prioridade visual acima da Ajuda e atualização local da lista após sucesso, preservando auditoria e históricos.
- Validação estrutural deste bloco: lint dos arquivos alterados sem erros, `git diff --check` aprovado e **11/11 regressões direcionadas aprovadas**, incluindo estacionamento móvel, posições por toque, acesso à seleção e remoção protegida.

- Auditoria-base de 13/08/2026: build e artefato aprovados, 100 testes automatizados sem falhas e lint sem erros. Foi identificada como divergência crítica a permissão de Continuidade herdada por Pastor e Administrador, além de ferramentas globais ainda acessíveis por endereço do painel comunitário.
- A política de Continuidade passou a derivar do vínculo real `comunidades.proprietario_usuario_id`, preservando supervisão do proprietário global e removendo a autorização automática por cargo.
- IA Editorial e Estatísticas foram transferidas integralmente para a Área do Proprietário; os endereços antigos do painel comunitário deixam de ser destinos válidos.
- O carregamento da automação editorial recebeu dependências estáveis para impedir execução obsoleta e eliminar o aviso real de hook identificado pelo lint.
- Notificações e o contador de mensagens deixam de consultar o servidor quando a aba está oculta, cancelam requisições obsoletas e sincronizam imediatamente quando o usuário retorna.
- Validação final deste bloco: build e artefato Sites aprovados, lint com 0 erros e **101/101 testes automatizados aprovados**, incluindo bloqueio direto de Pastor na Continuidade, isolamento entre donos e polling condicionado à visibilidade.
- Otimizador V117: manutenção manual e automática adicionada à Área do Proprietário. A execução trata sessões e redefinições vencidas, solicitações concluídas acima de sete dias, auditoria acima de 14 dias e convites vencidos; acessos temporários encerrados são marcados como expirados sem apagar o histórico. A configuração usa `configuracoes` e a auditoria existente, sem migration.
- Validação V117: build e artefato Sites aprovados, lint sem erros e **103/103 testes automatizados aprovados**, incluindo autorização exclusiva do proprietário, diagnóstico antes da execução, resultado depois da execução, bloqueio contra concorrência e preservação de dados ativos.
- Visitantes V118: a lista de cadastros deixou de usar cartões aninhados e painel lateral. Cada pessoa agora abre uma linha única, recolhível, com contato, ações, edição, novo acompanhamento e histórico no próprio cadastro.
- Categorias V118: responsáveis autorizados podem configurar faixa mínima/máxima de idade e migração automática. O backend impede sobreposição de faixas, dá prioridade à regra etária quando existe data de nascimento, reconcilia aniversários ao carregar a lista e audita alterações automáticas.
- Banco V118: migration `0047_quick_ego.sql` acrescenta `idade_minima`, `idade_maxima` e `migracao_automatica` sem remover categorias ou visitantes existentes.
- Validação V118: build e artefato aprovados, lint com 0 erros e **105/105 testes automatizados aprovados**, incluindo TEEN → O2, rejeição de intervalos sobrepostos, isolamento entre comunidades e regressão responsiva do acompanhamento embutido.

- V8.2.5 bloqueia os botões do acesso temporário até uma validação atual do servidor; uma sessão já autenticada com a pessoa errada não recebe mais o atalho que aparecia durante a corrida inicial.
- O conteúdo em modo leitura exige `CONFIRMADA` no backend e no carregamento direto de `/acesso/:token?conteudo=1`; expiração, cancelamento e falhas de revalidação ocultam imediatamente as ações sensíveis.
- `Não posso` e `Solicitar substituição` exigem a escolha de outra pessoa ativa do mesmo ministério, sem designação duplicada e sem conflito de horário; a nova designação é persistida como pendente e a pessoa indicada é notificada.
- A aba `Ministério → Histórico` permite excluir registros para líderes e gestores reais da comunidade; um grant ainda ativo é invalidado com a exclusão, e a operação fica preservada na auditoria técnica.
- A troca de capa do ministério reconhece também o proprietário da comunidade no backend. O seletor móvel ganhou botões explícitos `Escolher imagem`/`Trocar imagem` e permite reenviar o mesmo arquivo após uma tentativa.
- Correção V8.2.6: a capa ministerial deixou de ficar atrás do título e da ficha do líder; agora ocupa uma faixa própria, usa `object-fit: contain` para preservar a imagem inteira e mantém título, descrição e responsável em uma área de leitura independente. A prévia de Configurações também exibe o banner completo, sem o antigo recorte quadrado.
- Correção V8.2.7: o upload e a leitura agora compartilham a mesma política de chaves. Pastas `ministry-<id>` são aceitas pela rota de entrega, fazendo as capas ministeriais já armazenadas voltarem a abrir sem novo envio e mantendo bloqueio de caminhos incompatíveis ou malformados.
- Correção global de 11/08/2026: página pública da comunidade recebeu cartão institucional completo, contraste do banner e composição responsiva; o problema não foi tratado apenas na Renascer.
- Uploads nativos agora aceitam originais de até 50 MB, convertem sempre para WebP e preservam resolução maior para banners e fundos; o login ganhou enquadramento `SMART` para mostrar a imagem inteira sem recorte obrigatório.
- `Louvor → Integrantes` recebeu contenção de largura em toda comunidade, incluindo cards, cabeçalhos, abas e formulário de limite, eliminando a rolagem lateral da página.
- Compartilhamento de escala permite seleção múltipla e envio para conversa ou grupo do WhatsApp; o backend cria e audita um link pessoal diferente para cada selecionado.
- Revisão complementar do compartilhamento móvel em 10/08/2026: o cabeçalho deixou de ficar preso e sobrepor campos durante a rolagem; a lista individual do WhatsApp separa corretamente avatar, nome e ação, exibindo a foto de perfil quando cadastrada e iniciais como alternativa.
- Revisão dos vídeos móveis de 10/08/2026: o compartilhamento deixou de manter as ações presas sobre o conteúdo no celular; a correção está no componente compartilhado e vale para Renascer e todas as demais comunidades.
- A regra visual temporária e obsoleta que citava especificamente a Igreja Renascer foi removida; o catálogo ministerial agora segue exclusivamente o contrato visual comum a todas as comunidades.
- A organização dos cartões do proprietário agora respeita a seleção também no celular: `2x2` e `2x4` usam duas colunas; `4x2` e `4x4` usam quatro colunas compactas sem ultrapassar a tela.
- Hotfix móvel de 10/08/2026: o diálogo de compartilhamento de escalas passou a ocupar a tela do celular sem estouro horizontal, bloquear a rolagem do conteúdo ao fundo, preservar ações acessíveis e confirmar a cópia do link.
- A página de link temporário agora acompanha o horário de abertura, exibe contagem regressiva e atualiza automaticamente quando a permissão é liberada; a janela salva também volta corretamente ao reabrir o compartilhamento.
- Os cartões da Área do Proprietário preservam a densidade escolhida no celular, compactando conteúdo e controles para caber lado a lado sem estouro horizontal.
- Hotfix visual V8.2.1: o diretório público recebeu contrato explícito de cores para o modo claro, incluindo busca, filtros, cartões e menu da conta; o rótulo redundante “Visão geral da comunidade” foi removido da recepção autenticada.
- Redesenho integral da recepção pública de 09/08/2026: cabeçalho reorganizado sem links duplicados, busca de comunidades recolhível, ações de tema/Editor/conta agrupadas e menu de usuário com acesso direto ao painel, perfil e logout.
- O primeiro bloco foi reduzido e recebeu hierarquia mais profissional, demonstração visual explicitamente fictícia, chamadas principais objetivas e diferenciais em ícones vetoriais consistentes.
- Recursos, governança, comunidades e chamada final foram harmonizados com a nova linguagem visual; o tema escuro/automático e a barra móvel receberam contratos responsivos próprios.
- A navegação móvel passou a usar ícones SVG consistentes, foto ou iniciais do usuário e quatro destinos sem duplicidade.
- Refinamento da Visão Geral e das escalas de 09/08/2026: painel comunitário redesenhado com identidade do usuário, perfil, logout, indicadores e próximas escalas; participante confirma ou recusa uma designação persistida, e o estado confirmado substitui imediatamente as ações pendentes.
- A confirmação de escala notifica criador, responsável e lideranças autorizadas, informando também a quantidade de itens pendentes no checklist.
- Links temporários de escala passaram a exibir uma autorização explícita com o botão `Acessar esta escala`; o conteúdo continua somente leitura e protegido pela janela configurada.
- O compartilhamento de escalas passou a limitar e contar o texto, preservar o diálogo em telas menores e codificar corretamente mensagens extensas para WhatsApp, Telegram e e-mail.
- O proprietário global recebeu selo verificado nas superfícies pessoais, publicações, comentários, presença, pessoas e escalas, sem adicionar uma coluna incompatível aos bancos existentes.
- A faixa dourada institucional foi removida do cabeçalho público e privado; o menu autenticado ganhou perfil recolhível e saída direta, mantendo adaptação para celular.
- Hotfix responsivo de 09/08/2026: criação de escala com equipe corrigida pela validação da coluna real `ministerio_equipes.ativa`; login claro, escuro e automático harmonizado também no celular; cartões do proprietário receberam controles móveis de reordenação com persistência no layout salvo.
- Ajustes operacionais V4.7.4: setores do estacionamento editáveis por gestores autorizados; validação detalhada da criação de escalas; resposta, ausência e substituição de designações; janela temporária para links de escala; destino funcional nas notificações; célula real no perfil do membro; busca nominal na Central de Pedidos; inscritos de eventos visíveis apenas ao criador e responsáveis.
- O login escuro recebeu um contrato final de contraste; a identidade global, o painel do proprietário e os layouts de cartões aprovados anteriormente foram preservados.
- Refinamento visual V8.4: correções compartilhadas em todas as comunidades para equipes ministeriais no celular, diretório global de comunidades, criação de equipes, comentários, temas claro/escuro/automático, cabeçalho público, listas do proprietário, categorias de acompanhamento e configurações da comunidade.
- O proprietário agora escolhe e persiste organizações de cartões `2x2`, `2x4`, `4x2` ou `4x4`, configura somente o tema da página principal na área global e acessa listas mais compactas.
- O compartilhamento de escalas permite editar a mensagem e preparar conversas individuais do WhatsApp para integrantes com telefone cadastrado, sem expor contatos em links públicos.

## Próximo bloco autorizado

- Acompanhar a primeira execução automática em produção e continuar as melhorias funcionais solicitadas pelo proprietário, sempre com evidências antes da publicação.

## Principais arquivos alterados

- `app/page.tsx` e `app/globals.css`.
- `app/components/PublicHeader.tsx`, `app/components/PublicMobileNav.tsx` e `app/components/PublicIcon.tsx`.
- `tests/public-reception-redesign.test.mjs`.
- `app/comunidades/page.tsx` e `app/comunidades/[slug]/page.tsx`.
- `app/proprietario/page.tsx`, `app/components/OwnerWorkspace.tsx` e `app/api/proprietario/route.ts`.
- `app/lib/tenant.ts` e `app/lib/pilot-data.ts`.
- `app/api/pilot/comunidades/route.ts` e componentes da ficha de criação.
- APIs encerradas de feed público, publicações da plataforma, comentários públicos e selo pastoral.
- `app/components/CommunityHome.tsx` e APIs do feed interno.
- `app/components/PrivateChatWorkspace.tsx`, `PrivateChatDialog.tsx` e API de chat.
- `app/components/PublicFeedCard.tsx`, `CommunityHome.tsx` e API de comentários públicos.
- API de notificações e rota persistente da central de mensagens.
- `drizzle/0040_archive_demo_records.sql`, `drizzle/0041_restore_managed_communities.sql` e jornal de migrações.
- `app/components/AccountProfileWorkspace.tsx` e `app/components/CreateCommunityShortcut.tsx`.
- `app/api/pilot/comunidades/[id]/solicitacao/route.ts`.
- `app/components/SecretaryMinisterialWorkspace.tsx`.
- `app/lib/tenant.ts`, `app/lib/tenant-policy.mjs`, `app/components/PilotDashboard.tsx`, `app/components/PilotNotificationCenter.tsx`, `app/components/OwnerWorkspace.tsx`, `app/components/EditorialAutomationWorkspace.tsx` e `app/painel/page.tsx`.
- `tests/pilot-integration.test.mjs`, `tests/pilot-security.test.mjs`, `tests/v97-owner-access-flow.test.mjs` e `tests/v109-community-management.test.mjs`.
- `RELATORIO_OTIMIZACAO_GLOBAL_SEGURA_2026-08-13.md`.
- `app/lib/platform-optimizer.ts`, `app/api/proprietario/otimizacao/route.ts`, `app/components/PlatformOptimizerWorkspace.tsx`, `worker/index.ts` e `tests/v117-platform-optimizer.test.mjs`.
- `app/components/TenantOperations.tsx`, `app/globals.css`, APIs de visitantes/categorias, `app/lib/visitor-category-rules.ts`, `db/schema.ts`, `drizzle/0047_quick_ego.sql` e `tests/v118-visitors-inline-age-migration.test.mjs`.
- `app/components/NativeImageUpload.tsx` (modo de prévia específico para banners ministeriais).
- `app/escala/[token]/page.tsx`, `app/components/SharedScheduleAccessGate.tsx` e `app/api/pilot/escalas/[id]/route.ts`.
- `app/components/VerifiedOwnerName.tsx`, `CommunityHome.tsx`, `PilotDashboard.tsx`, `CommunityPresencePanel.tsx`, `PeopleWorkspace.tsx` e `OwnerWorkspace.tsx`.
- APIs de publicações, comentários, pessoas, presença e escalas, com identificação retrocompatível do proprietário.
- `app/components/ParkingWorkspace.tsx` e `app/api/pilot/estacionamento/mapa/route.ts`.
- `app/api/pilot/estacionamento/disponibilidade/route.ts` e `tests/v179-parking-touch-and-removal.test.mjs`.
- `app/components/PeopleWorkspace.tsx`, `EventsWorkspace.tsx`, `RequestsWorkspace.tsx` e `PilotNotificationCenter.tsx`.
- `app/api/pilot/escalas/route.ts` (telefone disponível exclusivamente para gestores da escala).
- `app/api/pilot/escalas/route.ts` (validação de equipe alinhada à coluna persistida `ativa`).
- `app/components/OwnerWorkspace.tsx` e `app/globals.css` (reordenação móvel e contrato responsivo dos temas do login).
- `app/components/CommunityPostInteractions.tsx` e API de comentários do feed interno.
- `app/components/CommunityThemeEditor.tsx`, `PlatformBrandingWorkspace.tsx`, `PlatformControlsWorkspace.tsx` e `PublicHeader.tsx`.
- `app/api/pilot/platform-branding/route.ts`, `app/lib/platform-branding.ts`, `app/components/OwnerWorkspace.tsx` e `app/api/proprietario/route.ts`.
- `app/secretary.css` e os ajustes finais compartilhados de `app/globals.css`.
- `app/components/SharedSchedulePendingState.tsx`, `app/escala/[token]/page.tsx` e `tests/mobile-sharing-property.test.mjs`.
- `app/components/PeopleWorkspace.tsx`, `RequestsWorkspace.tsx`, `LeadershipWorkspace.tsx` e `TenantOperations.tsx`.
- APIs de células, escalas, ministérios, liderança e publicações internas.
- `drizzle/0042_ministry_schedule_capacity.sql` e jornal de migrações.
- Componentes e APIs da automação editorial.
- `db/schema.ts`, migração `drizzle/0039_unknown_sentinels.sql` e metadados Drizzle.
- `README.md`, testes de integração, segurança e HTML renderizado.

## Testes realizados

- **Resultado vigente do bloco de 13/08/2026:** build e artefato aprovados; **101/101 testes automatizados aprovados**, sem falhas; lint com 0 erros e 38 avisos conhecidos de imagens dinâmicas/R2.

- Build de produção do Vinext aprovado.
- Artefato do Sites validado.
- Migrações aplicadas em banco SQLite de teste.
- Testes de autenticação, sessão, tenant, permissões e proprietário global.
- Testes de isolamento entre comunidades.
- Testes de Landing Page, diretório e encerramento do feed público.
- Testes de solicitações e criação controlada de comunidades.
- Testes de ministérios, equipes, escalas, Diaconia e estacionamento.
- Testes de chat, notificações, editorial, segurança e responsividade estrutural.
- Testes de comentários públicos, privacidade de perfil e bloqueio pelo autor.
- Testes de arquivamento reversível dos dados demonstrativos e respectiva auditoria.
- Teste de restauração seletiva das comunidades reais legadas, mantendo as sementes piloto arquivadas.
- Auditoria visual da prévia em temas claro e escuro, Landing Page e diretório público, sem erros de aplicação no console.
- Lint aprovado sem erros; permanecem somente avisos conhecidos de otimização de imagens e hooks legados fora deste hotfix.
- Verificação de atualização parcial das listas de pessoas, células, solicitações, escalas e feed, sem recarga integral da página após mutações.
- **Resultado atual:** 58 testes automatizados aprovados, sem falhas.
- **Resultado após o redesenho da recepção:** 59 verificações automatizadas aprovadas, sem falhas (58 da suíte geral e 1 regressão visual/estrutural específica).
- Compilação de produção e validação do artefato aprovadas; lint sem erros, apenas avisos conhecidos de otimização de imagens e hook legado fora deste bloco.
- O servidor da prévia privada permaneceu saudável, mas a inspeção no navegador remoto foi bloqueada pelo ambiente antes do carregamento; por isso, a homologação visual no navegador do proprietário continua necessária antes da publicação.
- Build e artefato Sites aprovados após o refinamento; lint sem erros (26 avisos conhecidos de imagem/hook, sem bloqueio).
- Regressão automatizada específica aprovada para criação de escala vinculada a uma equipe ativa e persistência da ordem dos cartões do proprietário.
- Regressão específica aprovada para confirmação de escalas, notificações às lideranças, selo do proprietário, compartilhamento compacto, acesso temporário e remoção da faixa institucional.
- Hotfix móvel de 10/08/2026 aprovado no build e na suíte completa: **61 testes automatizados aprovados, sem falhas**, incluindo atualização automática do acesso temporário e densidade móvel dos cartões conforme o layout selecionado.
- Prévia candidata carregada sem erro da aplicação; os estilos entregues confirmam as ações de compartilhamento fora da sobreposição, duas/quatro colunas conforme a seleção e ausência da antiga exceção visual da Renascer.
- Validação complementar aprovada: cabeçalho móvel participa da rolagem, avatar e nome do destinatário usam estruturas independentes e a foto de perfil é entregue pela API de escalas quando cadastrada.
- Correção V8.2.3 aprovada no build e na suíte completa: **65 testes automatizados aprovados, sem falhas**, incluindo criação em lote de tokens pessoais, conversão de imagens, perfil público e contenção mobile dos integrantes.
- Atualização V8.2.4: o acesso temporário identifica nominalmente a pessoa, exige confirmação `Sim`, `Não` ou `Solicitar substituição` no backend e retorna ao link automaticamente após o login.
- O histórico de autorizações saiu do diálogo de compartilhamento e passou para a aba `Histórico` do ministério em formato textual, mantendo cancelamento real dos acessos ativos.
- Exclusão e arquivamento de ministérios aparecem somente na área de risco de `Configurações`; categorias de Visitantes receberam grade padronizada de três colunas no desktop e uma coluna no celular.
- A área do proprietário foi redesenhada como central de comando, com indicadores, distribuição operacional, governança de permissões, ações rápidas e ficha de solicitação mais completa.
- O cadastro de comunidade permite escolher módulos; dependências são incluídas automaticamente, a seleção acompanha a solicitação e pode ser revisada pelo proprietário antes da aprovação.
- Módulos desativados removem permissões no contexto do tenant no backend e também deixam de aparecer na navegação; comunidades antigas sem configuração explícita preservam todos os módulos.
- Build, artefato e lint sem erros aprovados; **69/69 testes automatizados** aprovados. Prévia do login temporário validada em navegador real com largura de 1363 px, sem estouro horizontal e sem alertas renderizados.
- Atualização V8.2.5: integração D1 comprova substituição obrigatória, criação da designação pendente, bloqueio de exclusão por usuário comum, exclusão por líder, remoção real do grant e invalidação do token; quatro regressões estruturais cobrem corrida de validação, permissões de histórico, substituição e upload de capa.
- Hotfix V8.2.6 aprovado: capa e prévia ministerial preservam a imagem inteira, o texto não recebe mais contraste herdado da fotografia e a suíte integral chegou a **74/74 testes aprovados, sem falhas**.
- Hotfix V8.2.7 aprovado: a chave ministerial produzida pelo `POST` é aceita pelo `GET`, chaves de perfil e comunidade continuam válidas e caminhos inválidos permanecem recusados; **75/75 testes aprovados, sem falhas**.

## Problemas conhecidos

- Mensagens não possuem WebSocket; usam atualização periódica otimizada.
- IA não gera conteúdo sem provedor externo, mas revisão e programação do conteúdo preparado funcionam.
- Notificações externas, MFA homologado e pagamentos continuam dependentes de integrações.
- O envio totalmente automático de WhatsApp em segundo plano continua dependente de provedor oficial, consentimento, modelos aprovados e credenciais no backend. O sistema oferece compartilhamento assistido por número cadastrado e escolha explícita do líder.
- Convidados sem conta recebem acesso por link temporário somente leitura; login e senha aleatórios não são criados no frontend. Esse fluxo completo exige serviço de identidade, entrega de WhatsApp e verificação do número no backend.
- Homologação visual final em aparelhos físicos continua recomendada após cada publicação relevante.
- V8.2.2: corrigido o modo claro da página pública individual de comunidade, incluindo banner, cartões, textos e menu da conta.
- V8.2.3: corrigidas as cores do cabeçalho e do menu da conta nos temas claro, escuro e automático; removido o cartão pessoal da abertura da comunidade.
