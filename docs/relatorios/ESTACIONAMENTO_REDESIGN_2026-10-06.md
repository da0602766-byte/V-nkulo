# Estacionamento — redesign de 06/10/2026

Fonte: `VINKULO_ESTACIONAMENTO_ESPECIFICACAO_IMPLEMENTACAO.md` v1.0 e imagem do ZIP, ambos lidos antes da edição. Base local `6aa3458`, branch `codex/estacionamento-redesign-20261006`. Nenhum dado de produção utilizado para QA.

Implementação e testes versionados no commit `84de2d4`. A cópia original do projeto permaneceu sem alterações rastreadas; o trabalho está no diretório `vinkulo` desta tarefa.

## Inventário anterior à alteração

| Capacidade | Situação encontrada | Evidência / encaminhamento |
|---|---|---|
| Rota e shell | Existente | `/painel?view=estacionamento`, `ParkingWorkspace.tsx`; preservar navegação e permissões. |
| Membro | Parcial | `ParkingMemberPortal.tsx`: grade ignora coordenadas reais, atividade só no formulário. Integrar seleção de contexto antes do mapa. |
| Gestão | Divergente do ZIP | `ParkingManagementConsole.tsx`: cartões de indicadores e resumo. Substituir por inventário/tabela, filtros e listas compactas. |
| Dados | Existente | D1 via `getD1`, tabelas `estacionamento_*`, isolamento por `comunidade_id`; sem trocar banco/ORM. |
| Reserva | Existente com falhas | `reservas/route.ts`: PENDENTE, aprovação pelo gestor, consulta e inserção separadas; tornar confirmação atômica e recuperável. Preservar aprovação. |
| Disponibilidade | Parcial | `disponibilidade/route.ts`: próximo evento implícito e intervalo divergente do formulário; consultar atividade/período escolhido. |
| Veículos | Local | `useParkingGarage.ts`: garagem por usuário no aparelho; não há cadastro de veículo persistido com titularidade no servidor. Preservar e identificar limite, sem inventar entidade. |
| QR/câmera | Existente | `ParkingReservationQr.tsx`, validação pelo servidor; preservar, retirar solicitação automática de câmera na montagem. |
| Entrada/saída | Parcial | Endpoints existentes, mas pré-consultas não garantem concorrência; corrigir efeitos condicionais atômicos. |
| Editor | Parcial | Coordenadas persistidas e arraste; faltam conflito concorrente e alternativa por campos. Referências espaciais (entrada/corredor/obstáculo) não existem no modelo. Não desenhar referências fictícias. |
| Escala/permissões | Existente | `tenant.ts`, `auxiliares`, `ParkingOperatorMobile.tsx`; revalidar servidor. |
| Histórico | Parcial | LIMIT 80, busca local; implementar consulta paginada no servidor, preservar ações autorizadas existentes. |
| Ocorrências/relatórios | Existente | Endpoints e UI específicos; reintegrar em listagens. |
| Exportação | Ausente no estacionamento | Nenhum exportador a reintegrar; não adicionar formato ou serviço por suposição. |
| Atualização | Parcial | Polling 12s, erros silenciosos e respostas obsoletas; acrescentar estado de sincronização, cancelamento e reconexão. |

## Decisões e limites

- Reservas permanecem pendentes até aprovação; a aprovação visual não muda essa política.
- Decisão explícita do proprietário nesta conversa: permitir que o membro cancele a própria reserva antes da entrada, preservando o registro. O servidor nega cancelamento com check-in/permanência ativa.
- Decisão explícita do proprietário nesta conversa: exigir atividade/evento publicado em toda nova reserva. Abertura de reservas é revalidada no servidor; não é exigido RSVP.
- Garagem é local e não prova titularidade do veículo. Não há ID de veículo no contrato atual.
- Não existe mapa de corredores/entradas; somente posições de vagas. Inventário sem posições será apresentado como lista, claramente identificado.
- Não há hold, tarifa, multa ou política nova de prioridade.
- Usar o fuso já adotado pelo módulo (`America/Sao_Paulo`) para apresentação; instantes enviados em ISO com fuso explícito.
- Testes físicos de câmera/APK e leitor de tela dependem de ambiente disponível; não equivalem à emulação de navegador.

## Implementado

- Membro: seleção explícita de atividade e setor, mapa com posições persistidas, zoom/arraste, alternativa acessível em lista, legenda textual, seleção local, revisão, comprovante, minhas reservas, cancelamento e garagem local. Posições ausentes, duplicadas ou sobrepostas usam a lista com aviso para revisão da gestão.
- Gestão: inventário e reservas separados, tabela com colunas corretas, filtros combinados, paginação real de reservas e movimentações, registros de entrada/saída, QR, ocorrências, relatórios, equipe e configuração. Cartões de indicadores foram retirados.
- Operador: busca de placa/pessoa/vaga, leitura de QR por ação do usuário, saída com confirmação, contagem persistida do plantão, indicação de veículos ainda presentes e estado real do relatório.
- Editor: posições por arraste ou campos numéricos; IDs preservados; validação de coordenadas, duplicidade e sobreposição; comparação da posição/nome/cor/ordem anterior impede sobrescrita silenciosa. O lote de coordenadas é aplicado integralmente ou recusado.
- Disponibilidade: uma projeção compartilhada entre membro e gestão considera a janela escolhida, reservas pendentes/confirmadas sobrepostas e situação física. As categorias de capacidade são exclusivas; tipos especiais são um recorte adicional, não uma quinta parcela da soma.
- Integridade: inserção condicional atômica, chave idempotente por solicitação, nova chave após resposta confirmada, proteção contra duas entradas simultâneas por vaga/placa, check-in concorrente e saída repetida. Reserva, cancelamento, entrada, aprovação/recusa e saída gravam a auditoria na mesma transação. Notificação é posterior; falha é diferenciada, registrada e não desfaz a reserva.
- Relatórios: totais de entradas, saídas e ocorrências são calculados pelo banco no intervalo da escala. Enviar valores adulterados pelo navegador não altera esses totais.
- Sincronização: requisições anteriores canceladas, sequência de respostas, atualização a cada 12 segundos com recuo após erros, pausa com aba oculta/offline, revalidação ao focar/reconectar, indicação de última sincronização e bloqueio de mutações com dados desatualizados. Não há serviço realtime novo.
- Isolamento: mapa do membro contém somente situação/posição/tipo e indicação de reserva própria; nenhum nome, placa, contato, nota ou token de terceiros. Dados de gestão são descartados em respostas de autorização negada. A troca de comunidade recria o workspace.

## Arquivos e contratos

Componentes em `app/components/parking/`, importação do CSS em `ParkingWorkspace.tsx` e chave de comunidade em `PilotDashboard.tsx`. Novos componentes: `ParkingSpaceMap`, `ParkingReservationTable` e `ParkingMovementHistory`. Estilos novos usam prefixo `parking-v2-` para evitar colisões com CSS legado.

| Contrato | Alteração |
|---|---|
| GET estacionamento / disponibilidade | `eventoId`, `inicioEm`, `fimEm`; contexto, eventos publicados, estado de abertura e horário do servidor; `Cache-Control: no-store`. |
| GET reservas | `q`, `status`, `setorId`, `tipo`, `eventoId`, `page`, `pageSize` (até 80), `scope=mine`; total real e dados do usuário/permissão corrente. |
| POST reservas | Evento obrigatório; `requestId` opcional para clientes anteriores e obrigatório no novo cliente; repetição do mesmo pedido retorna a reserva, payload alterado com mesma chave retorna 409. |
| PATCH reservas | `CANCELAR_PROPRIA` restrito ao titular; `CHECKIN` rejeita atividade diferente quando há contexto selecionado; estados/conflitos revalidados. |
| GET movimentacoes | Novo endpoint protegido, busca e filtro de status, 40 registros por página e total real. |
| PATCH mapa | `previousX`/`previousY` para posição; `previousNome`/`previousCor`/`previousOrdem` para setor. Clientes com versão anterior precisam atualizar antes de editar. |
| PATCH relatorios | Totais derivados do intervalo persistido da escala; o cliente informa somente a ação e o resumo. |

Utilitários novos: `parking-context.ts`, `parking-shift-stats.ts`, `parking-audit.ts`. Nenhuma dependência de execução, tabela, migração ou provedor novo. Mantidos D1, autenticação, permissões, códigos QR opacos e trilha existentes.

## Validação

| Verificação executada | Resultado |
|---|---|
| Build do repositório e validação do Worker ESM/manifesto | Aprovados. |
| `tsc --noEmit` | Aprovado. |
| ESLint com os mesmos filtros do script do repositório (`dist`/`.next`) | 0 erros; 1 aviso preexistente em `PeopleWorkspace.tsx` (`TITLES` sem uso). |
| ESLint dos componentes/APIs/utilitários de estacionamento e scripts de QA | 0 erros e 0 avisos. |
| Suíte completa `node --test tests/*.test.mjs` | **601 testes: 597 aprovados, 4 falhas preexistentes**, nenhuma exclusão/skip. |
| Integração nova do estacionamento | **8 grupos aprovados**, incluindo rollback de auditoria. |
| Matriz visual Edge/Playwright | Membro e gestão em 320, 390, 430, 768, 1024 e 1440 px, temas claro/escuro: **24 cenários**, zero overflow lateral de página e zero erro JavaScript. |
| Fluxos no navegador | Reserva pendente → aprovação → entrada → saída; vazio filtrado, offline; teclado/lista, arraste sem seleção acidental, reconexão, zoom CSS 200%/movimento reduzido, cancelamento próprio e nova solicitação com os mesmos dados: aprovados. |
| Desempenho local | 600 vagas/5.000 reservas históricas: **29–56 ms** após agrupar a consulta, contra cerca de 490 ms antes. Medição SQLite local, sem extrapolação para produção. |
| `git diff --check` | Aprovado. |

As quatro falhas foram reproduzidas sem alterações no checkout original `6aa3458`: um caso em `feed-interactions-access.test.mjs` e três em `p1-theme-accessibility.test.mjs`. Os harnesses rejeitam a dependência `./SafeImage`; a falha antecede os fluxos que pretendem exercitar.

Evidências locais: [resultado da matriz](../../outputs/parking/visual-results.json), [interações](../../outputs/parking/extra-results.json), [suíte completa](../../outputs/parking/tests-final.log), [falhas na base original](../../outputs/parking/baseline-failures.log), [build](../../outputs/parking/build.log) e [lint](../../outputs/parking/lint.log).

Capturas inspecionadas: [membro 390 px claro](../../outputs/parking/member-390-claro.png), [membro 320 px escuro](../../outputs/parking/member-320-escuro.png), [gestão desktop escuro](../../outputs/parking/manager-1440-escuro.png), [gestão 390 px](../../outputs/parking/manager-390-claro.png), [filtro vazio](../../outputs/parking/manager-empty.png), [offline](../../outputs/parking/member-offline.png) e [ampliação 200%](../../outputs/parking/member-zoom-200.png). Arquivos em `outputs/` são evidências locais ignoradas pelo Git; os scripts versionados permitem recriá-los.

Os testes de integração usam o Worker compilado, login real do sistema e SQLite em memória com as migrações existentes. O adaptador serializa os lotes transacionais para representar o comportamento de D1; isso não equivale a ensaio de carga na hospedagem.

O erro `QA audit failure` no log é induzido por um teste: confirma rollback e recuperação posterior, e esse caso está aprovado. A matriz visual também verifica recorte interno das tabelas móveis, além da largura total da página.

Cobertura nova em `tests/parking-redesign-runtime.test.mjs`: reserva concorrente, replay e payload divergente, atividade obrigatória/abertura, intervalos sobrepostos entre eventos e adjacentes, acesso anônimo, membro sem permissão administrativa, comunidade diferente, privacidade do mapa, cancelamento antes/depois da entrada, check-in simultâneo, saída repetida/inexistente, entrada manual simultânea, ocupação além do horário previsto, revogação de vínculo, editor obsoleto/sobreposto e lote integral, paginação além de 80 registros, totais de relatório, falha de notificação, falha de auditoria e consulta de 600 vagas com 5.000 reservas históricas.

Testes existentes foram adaptados ao novo contrato/estrutura, mantendo a finalidade de cada verificação. Nenhum teste foi removido ou marcado como ignorado.

## Prévia reproduzível

Na raiz deste checkout, depois de instalar as dependências e compilar:

```sh
node scripts/qa/parking-preview.mjs
```

A prévia escuta somente `127.0.0.1:4178`. Abrir `http://localhost:4178/qa-login/member` ou `http://localhost:4178/qa-login/manager`. Os atalhos e usuários sintéticos existem somente nesse servidor de QA; não são rotas incluídas na aplicação. O banco vive em memória e é descartado ao encerrar o processo. Nenhuma credencial ou dado de produção é usado.

Os scripts `scripts/qa/parking-visual-qa.mjs` e `parking-interaction-qa.mjs` usam Playwright com Edge e geram evidências em `outputs/parking`. Playwright é ferramenta opcional de QA, sem alteração do `package.json`; `PARKING_QA_PLAYWRIGHT_MODULE` permite apontar para o módulo instalado no ambiente. Execute os scripts nessa ordem sobre uma prévia recém-iniciada.

## Limites herdados e não testado

- A garagem é local por usuário/aparelho. Não existe cadastro de veículo do servidor com ID/titularidade para validar um suposto veículo de terceiro. Evoluir isso requer contrato de dados próprio; não foi simulada uma proteção inexistente.
- Não existem referências espaciais para entradas/corredores/obstáculos, orientação/dimensões de vaga, hold de seleção, exportador ou integração com cancelas. A imagem não foi usada para fabricar esses dados.
- O editor existente permite criar setores/vagas, alterar setor e mover posições. Não foram inventados endpoints de exclusão/inativação/bloqueio nem uma política para resolver uso futuro. Reserva administrativa continua disponível pela visão pessoal do gestor; não foi criado cadastro em nome de terceiros.
- Situação física OCUPADA continua bloqueando novas reservas, inclusive futuras, até uma saída autorizada. É a proteção conservadora do modelo vigente; não foi inventada previsão de liberação.
- Ocorrências e relatórios preservam os recortes existentes de 20 e 60 registros. A paginação nova contempla reservas e movimentações. Uma consulta integral/exportação de ocorrências e relatórios permanece como extensão separada.
- O envio automático de relatório é o mecanismo existente acionado pela tela; não é um agendador garantido com a aplicação fechada. Não há encerramento automático de veículos.
- Não executados: câmera física/decodificação óptica, PWA instalado, APK/WebView real, teclado virtual real, leitor de tela, carga e concorrência no D1 remoto. Zoom CSS a 200%, viewport reduzido e teclado do navegador não substituem esses ensaios.
- A primeira entrega local tinha quatro falhas preexistentes de mocks SafeImage. Na preparação autorizada para publicação, os mocks foram corrigidos e a suíte integrada passou integralmente.

Os itens de homologação física e as lacunas acima permanecem explícitos. Não se declara aprovação integral dos ensaios físicos P1 da seção 22 do ZIP. O proprietário autorizou a publicação em mensagem posterior.

## Publicação

Publicação autorizada pelo usuário em 06/10/2026 (“Pode publicar”). Candidato integrado sobre a fonte Sites 357 (`c8030f226ed825f784782c5f3323236f4d117758`), preservando as alterações de mural, imagens, arquivos e ficha de pessoas. O CPF vinculado à conta foi mantido nas rotas de disponibilidade/reserva.

Pré-publicação completa aprovada após a integração: 618 testes passaram, zero falhas; TypeScript limpo; lint zero erros e um aviso; build e Worker/manifesto válidos. Repetidos 24 cenários visuais e seis cenários extras de interação com o Worker compilado e dados sintéticos. Corrigidos bloqueios herdados de lint em três componentes, mocks e asserções antigas de imagem/feed e o próximo número livre do README de migrações (0085). Nenhuma migração nova ou alteração direta em dados de produção foi necessária.

Publicado Sites 358 em 06/10/2026 às 13h38 (Brasília), confirmado como succeeded pelo serviço. Fonte 61fa3bf212e05bab5dc3b7716fa51d3566600a00; deployment appgdep_6ac523d06018819189b25b97ee588fd0; URL https://adote-gestao.da0602766.chatgpt.site. Pré-publicação: 618/618 testes, TypeScript limpo, lint 0 erros/1 aviso, build válido; 24 cenários visuais e seis interações extras aprovados. Sem nova migração. Câmera/APK físicos permanecem pendentes.

Empacotamento no Windows exigiu Git Bash no PATH e TAR_OPTIONS=--force-local. O helper oficial enviou a fonte e validou o arquivo; nenhuma adaptação de código foi necessária. Registro documental posterior ao deploy.

Reversão: o trabalho está em branch isolada baseada em `6aa3458`; não há reversão de banco a executar. Caso os commits sejam integrados posteriormente, revertê-los restaura a implementação anterior, observando que reservas/cancelamentos já realizados são dados de negócio e devem manter seu histórico.


## Revisão de usabilidade local — 06/10/2026, após Sites 358

Pedido: percorrer o estacionamento como usuário, identificar dificuldades e falhas de layout, melhorar as telas e apresentar capturas antes de uma nova publicação. A revisão foi feita com os componentes reais, Worker compilado e dados sintéticos no servidor local. Nenhuma alteração desta revisão foi publicada.

| Dificuldade encontrada | Melhoria aplicada |
|---|---|
| Mapa aparentemente disponível antes de escolher uma atividade | Orientação inicial e seleção de atividade antes do mapa; sequência Atividade → Vaga → Solicitação. |
| Botão de confirmação e QR sugeriam que a solicitação já estava aprovada | Botão Solicitar vaga, recibo de solicitação com instrução de aguardar aprovação, sem QR de entrada enquanto pendente. QR das reservas aprovadas preservado. |
| Dados de conta repetidos e regras de horário pouco claras | CPF vinculado apresentado como informação, e-mail opcional nesse caso e explicação da janela de chegada/saída com validação do intervalo. |
| Estados técnicos e persistência da garagem pouco claros | Rótulos legíveis para tipos/status e explicação de que os veículos são salvos neste navegador/aparelho. |
| Oito botões ocupavam grande parte do celular | Seletor Área de trabalho no celular e navegação por abas no computador; título e orientação por área. |
| Filtro de atividade aparecia em áreas que não utilizavam esse contexto | Contexto restrito às áreas de vagas, reservas e entradas/saídas; explicação da diferença entre reserva da atividade e ocupação física. |
| Filtros e textos cortados em telas pequenas | Filtros recolhíveis, duas colunas no celular e uma coluna até 360 px; controles e textos maiores. |
| Dificuldade para localizar veículos na saída | Busca por veículo/pessoa/vaga e mensagem útil quando não há correspondência. |
| Editor não explicava quando salvava e códigos de vagas quebravam linha | Instrução sobre salvar ao soltar, alternativa por campos e largura fixa para exibir os códigos inteiros. |
| Ações de manutenção misturadas à configuração comum | Limpeza do histórico agrupada em uma seção própria com explicação; rótulo Salvar configuração. |
| Limites das listas não apareciam | Ocorrências e relatórios indicam os recortes existentes de 20 e 60 registros. |

Validação: pré-publicação completa aprovada com 618 testes, zero falhas; TypeScript limpo; ESLint zero erros e um aviso preexistente; build/Worker/manifesto aprovados. Após os últimos ajustes exclusivos de CSS, build e verificações visuais repetidos. Script novo de captura aprovado no ESLint. Matriz com 24 cenários (membro/gestão, seis larguras e dois temas) e oito interações adicionais; zero erro JavaScript e zero transbordamento lateral de página nos cenários executados. A galeria percorre as oito áreas da gestão em computador/celular, formulário/mapa/reservas/garagem do membro e filtros de 320 px.

Evidências locais: [galeria com 26 capturas](../../outputs/parking-review/avaliacao.html), [resultado da galeria](../../outputs/parking-review/resultados.json), [matriz visual](../../outputs/parking/visual-results.json), [interações](../../outputs/parking/extra-results.json), [pré-publicação](../../.task-tools/parking-ux-complete.log) e [build final](../../.task-tools/parking-ux-build-final.log). O script reproduzível da galeria é scripts/qa/parking-usability-qa.mjs e deve rodar depois dos outros dois scripts sobre uma prévia local recém-iniciada. Os artefatos são ignorados pelo Git e usam somente dados fictícios.

Limites: inspeção do fluxo de operador em plantão restrita ao código nesta revisão; câmera, leitor de tela, teclado virtual, PWA e APK físicos não foram ensaiados. Navegação e testes automatizados não substituem pesquisa com usuários reais. Banco, APIs, permissões e regras de aprovação/cancelamento permanecem como publicados.

Estado da entrega: **aguardando a confirmação do usuário após avaliar as telas. Não publicar automaticamente. A versão pública permanece Sites 358.**


## Segunda revisão — entendimento do membro e prioridades da gestão

Pedido posterior do usuário: propor e aplicar melhorias sob as duas perspectivas e apresentar novas screenshots. Implementada localmente sobre 4a9de83, ainda sem publicação.

- Membro: guia recolhível de solicitação, aprovação e entrada; resumo de atividade, vaga, veículo e período antes do envio; próximo passo em cada reserva; comprovante aprovado com ação principal destacada. Cancelamento preservado como ação secundária.
- Consultas pessoais: a escolha da atividade continua filtrando a disponibilidade, mas não filtra a lista pessoal de reservas. O escopo mine e a paginação permanecem. Na gestão, o filtro de atividade continua aplicado às reservas. Nenhuma ampliação de acesso.
- Gestão: atalhos para analisar solicitações, consultar aprovadas e controlar entradas/saídas. O atalho de solicitações limpa buscas antigas e abre a fila pendente. Filtros rápidos de etapa consultam o servidor e preservam o contexto da atividade.
- Listagem: atividade de cada reserva visível, rótulo Período reservado, aprovação destacada e instrução específica de cada fila. Entradas registradas explica que também inclui reservas encerradas.

Validação concluída: 618/618 testes, TypeScript limpo, build/Worker/manifesto válidos, lint zero erros e um aviso preexistente. Scripts novos/alterados aprovados no lint. Matriz visual de 24 combinações de tela/tema e quatro fluxos principais; nove interações adicionais, incluindo verificação da consulta pessoal sem eventoId ao escolher atividade. A galeria valida ainda a limpeza da busca anterior pelo atalho de pendências e as consultas das filas PENDENTE/CONFIRMADA em computador e celular. Zero erro JavaScript e zero transbordamento lateral de página nos cenários executados.

Evidências: [galeria com 34 capturas](../../outputs/parking-review-v2/avaliacao.html), [resultado](../../outputs/parking-review-v2/resultados.json), [resumo antes do envio](../../outputs/parking-review-v2/membro-resumo-desktop.png), [próximos passos no celular](../../outputs/parking-review-v2/membro-reservas-celular.png), [fila de solicitações](../../outputs/parking-review-v2/gestao-pendentes-desktop.png) e [pré-publicação](../../.task-tools/parking-ux2-check.log). Screenshots são da aplicação compilada com dados fictícios. A galeria anterior permanece disponível em outputs/parking-review.

Limites mantidos: esta é uma avaliação de interface e fluxos em navegador; câmera, APK físico, leitor de tela e entrevistas com usuários reais não foram realizados. Regras de aprovação, acesso e cancelamento mantidas.

**Aguardando avaliação e confirmação do usuário. Não houve deploy; versão pública permanece Sites 358.**


## Publicação das revisões aprovadas — Sites 359

O usuário confirmou a publicação após avaliar as telas da segunda revisão. Publicado Sites 359 em 06/10/2026 às 21h25 (Brasília), confirmado como succeeded pelo serviço. Fonte 34c878a7de39fa701b1e58d2d53c213b25063e2f; deployment appgdep_6ac59175acc08191948844b552e9fefc; URL https://adote-gestao.da0602766.chatgpt.site. Inclui as duas revisões de usabilidade aprovadas: orientação do membro, resumo de envio, próximo passo por reserva, navegação móvel, filtros e filas de gestão. Validação: 618/618 testes, TypeScript/build aprovados, lint 0 erros/1 aviso preexistente, matriz visual e nove interações adicionais aprovadas. Sem nova migração. Câmera/APK físicos permanecem pendentes.

A abertura pelo helper oficial preservou a fonte aprovada 201a6d6, sem novas mudanças de aplicação ou integração. O único complemento anterior ao empacotamento foi o registro da autorização. Fonte enviada e pacote validados pelo helper oficial; versão salva e deploy confirmados pelo Sites. O envio exigiu renovação da credencial temporária, sem alteração de código. Registro documental posterior ao deploy. Os estados de espera citados nas seções históricas anteriores estão encerrados por esta confirmação.
