# Reforma Visual V5 — especificação

Documento de referência para a reforma de UI/UX do VÍNKULO. Aprovado pelo
proprietário em 30/08/2026 como direção.

- **Base:** `1c6d447` — "Exibe ações essenciais e orienta remoções".
- **Prévias navegáveis:** duas páginas publicadas fora do repositório, com as
  telas e os formulários desenhados. Os links estão com o proprietário.
- **Estado:** blocos 1 a 5 concluídos. Bloco 6 pendente. Ver seção 7 para o
  recorte por commit.

## 1. Diagnóstico

O problema não é estético, é de acúmulo: três reformas se sobrepuseram sem que
a anterior fosse retirada.

| Achado | Evidência |
| --- | --- |
| Duas paletas empilhadas | `app/globals.css:3-40` define `--ink`, `--muted` e `--line` na paleta violeta e redefine as três, vinte linhas abaixo, em navy/teal. As duas convivem no mesmo `:root`. |
| Três acentos disputando | Verde na barra lateral, roxo no botão principal, ciano no gradiente do título da recepção. |
| Ícones são caracteres de texto | `app/components/PilotDashboard.tsx:73-85` usa `◇ ▣ ✣ ♡ ◎ ⬡`, com alturas e pesos que nenhuma fonte garante. |
| Navegação com itens duplicados | `app/components/PilotDashboard.tsx:327-337`: "Início" e "Mural" apontam para a mesma view; "Ministérios" e "Escalas" também. |
| CSS sem divisão | `app/globals.css` tem 29.537 linhas e 1.634 classes num arquivo só. |

## 2. Sistema visual

**Um acento.** Cobre (`#B25A33` no claro, `#D9784C` no escuro) para ação.
Verde, âmbar e rosa passam a significar exclusivamente estado — nunca
decoração. Estrutura da barra lateral em índigo escuro.

**Neutros enviesados ao acento**, não cinza puro.

**Tipografia em três papéis:** Newsreader nos títulos, Instrument Sans na
interface, IBM Plex Mono em números, horas e placas. As duas últimas já estão
em `.vinext/fonts/`.

**Ícones em SVG** com traço de 1,6 px, substituindo os glifos tipográficos.

**Claro e escuro definidos por token**, nunca dentro de bloco de tema, para que
nenhuma cor fique presa a um só estado.

## 3. O fio

O dispositivo estrutural vem do nome do produto: vínculo → fio. Uma linha
vertical contínua que atravessa o dia da comunidade. Não é ornamento — codifica
a direção do tempo: passado sólido, futuro tracejado, marcador "agora" entre os
dois.

### Fio do dia — página nova

Primeiro item da barra de navegação, em `/painel?view=fio`. Reúne numa tela só o
que hoje está espalhado por nove: culto, presença, visitantes, pedidos,
escalas, estacionamento, células e diaconia.

Entregue: cabeçalho com troca de dia, filtro por camada (cultos, pessoas,
operação, cuidado), linha do tempo com marcador "agora", futuro tracejado,
formulário de registro manual, os quatro indicadores do topo (registros,
visitantes, pedidos e escalas confirmadas) e a coluna lateral com visitantes
por categoria e o que ainda vai acontecer.

Escala incompleta é o único indicador que muda de cor, porque é o único que
pede ação. Visitantes só entram no resumo de quem tem `visitors.view`.

Ainda não entregue: os cartões expansíveis. Presença, estacionamento, células e
diaconia seguem fora do agregador — hoje ele lê eventos, escalas, visitantes,
pedidos e mural. A ocupação do salão depende de presença, que ainda não é fonte.

**Esta é a única parte da reforma que exige migração de banco.** A tabela
`fio_registros` (`drizzle/0060_fio_registros.sql`) guarda os lançamentos
manuais — o que o sistema não capta sozinho, como uma visita pastoral ou um
imprevisto. Todo o resto do fio é agregação de dados que já existem.

Ao implementar, descobriu-se que o fio já existia embutido em
`CommunityHome.tsx`, com linha do tempo e marcador "agora", montado no cliente
a partir de três fontes. A página dedicada promove esse trecho e troca a
montagem no cliente por um agregador no servidor
(`app/api/pilot/fio/route.ts`), que lê cinco fontes e filtra visibilidade no
próprio SQL. Visitantes e pedidos entram agregados por contagem: quatorze
linhas iguais não são quatorze acontecimentos, e o corpo de um pedido nunca é
lido pela rota.

## 4. Navegação

Três seções fixas no lugar da lista corrida atual:

- **Dia** — Fio do dia, Mural, Agenda.
- **Comunidade** — Pessoas, Visitantes, Pedidos, Células, Ministérios,
  Estacionamento, Diaconia.
- **Gestão** — Notificações, Configurações, Área do proprietário.

Contadores no trilho apenas para pendências que exigem ação.

## 5. Módulos

| Aba | Mudança |
| --- | --- |
| Criar feed | ~~Deixa de ser aba e vira composer no topo do Mural.~~ Nunca foi aba: é o botão "Criar publicação", que já abre um composer com dois gatilhos — um no topo da Início e outro compacto ao lado do título do Mural, este último adicionado de propósito em `1c6d447`. Convertê-lo de modal para embutido é decisão em aberto, não correção. |
| Agenda | ~~Camadas ligáveis sobre a mesma grade.~~ Já existia: `AgendaCalendar.tsx:133` alterna EVENTO, ESCALA e PESSOAL, entregue no commit `15fcb80`, cujo título é literalmente "agenda com camadas". |
| Pessoas | ~~Filtros por situação.~~ Premissa errada: `app/api/pilot/pessoas/route.ts:56` só devolve vínculos `ATIVO`, então não há outras situações na lista — quem está pendente vive em Solicitações de entrada. A remoção com motivo já veio em `1c6d447`. Ações só no hover ficaram de fora de propósito: esconderiam as ações por completo em telas de toque. |
| Visitantes | O funil vira o assunto da página; a tabela vem depois dele. |
| Pedidos | ~~Pedido confidencial não mostra o corpo na listagem.~~ Já resolvido, e melhor: `app/api/pilot/solicitacoes/route.ts:53-64` filtra por destinatário, então um pedido que não é seu nem foi endereçado a você não sai do servidor. Triagem por urgência exigiria coluna nova e ficou fora. |
| Estacionamento | ~~Mapa de vagas clicável no lugar da lista.~~ Já existia: `ParkingWorkspace.tsx:571-585` desenha as vagas por setor como botões com estado livre, reservada e ocupada, e seleção. Terceiro item do diagnóstico que caiu ao ser checado contra o código. |
| Células | De lista de nomes para mapa de saúde: relatórios em dia, frequência das últimas oito semanas e prontidão para multiplicar. |
| Notificações | Agrupadas por dia, com filtro "precisa de você" e ícones em traçado — eram `P # ▣ ♡ □ ✦`. Mensagens privadas já estavam fora do sino. |
| Configurações | Navegação por assunto — Áreas, Aparência, Acessos, Módulos, Privacidade e Solicitações — no lugar da página única. O formulário de convite saiu de cima das abas e passou para Acessos, onde é assunto. |
| Área do proprietário | Faixa de escopo permanente: a nota existia, mas dentro de um `<details>` fechado. Trilho mais escuro ficou de fora. |

### Ministérios

A aba lista os ministérios em cartões que respondem à pergunta real da
liderança: tem gente suficiente e a próxima escala está fechada?

**Correção.** O diagnóstico original dizia que Equipes vivia dentro de
Participantes, citando `MinistriesWorkspace.tsx:168`. Está errado: aquele é um
componente secundário. A tela real do ministério é
`SecretaryMinisterialWorkspace.tsx:1143-1152` e **já tem oito abas, com Equipes
como aba própria** — Visão geral, Integrantes, Equipes, Escalas, Checklists,
Relatórios, Histórico e Configurações. Nada a fazer aqui; o que a reforma
propunha já existia.

## 6. Formulários

Cinco regras, válidas para todo diálogo de criação:

1. **O rodapé diz a consequência.** Nenhum diálogo termina só com "Salvar".
   Cada um informa quem será notificado, quantas pessoas passam a ver e o que
   fica registrado.
2. **Obrigatório é exceção.** Um visitante se cadastra em pé, na porta, com fila
   atrás: só o nome é obrigatório, e o diálogo diz isso em vez de bloquear.
3. **Público e interno nunca se misturam.** Em Nova célula, `enderecoPublico` e
   `descricaoPublica` ficam em seção separada e avisada — hoje aparecem no meio
   dos campos internos, e é assim que endereço residencial acaba publicado.
4. **Rascunho antes de notificar.** Escalas nascem em `RASCUNHO`; publicar é um
   segundo ato deliberado. A diferença entre montar uma escala e convocar doze
   pessoas precisa ser um clique consciente.
5. **Destrutivo mostra o que sobrevive.** Desvincular alguém lista o que se
   perde e o que fica: histórico, publicações e a conta pessoal. Motivo
   obrigatório, autor registrado, reversível por 30 dias.

Os campos desenhados saíram de `db/schema.ts` e das rotas em `app/api/pilot/`.
Com a exceção do Fio do dia, **a reforma não exige migração de banco** — o que
muda é ordem, agrupamento e texto.

**O que foi conferido e o que foi feito.** As regras 4 e 5 já estavam
atendidas: escalas nascem com `defaultValue="RASCUNHO"`, e a remoção com motivo
e lista de blocos veio em `1c6d447`. Sobraram as regras 1, 2 e 3, aplicadas ao
diálogo de célula e ao cadastro de visitante.

Dois defeitos apareceram no caminho, ambos anteriores a esta reforma:

- **A data de entrada do visitante usava `toISOString()`, que é UTC.** No Brasil
  isso significa que, das 21h em diante, a data já virou: um visitante recebido
  no culto de domingo à noite era gravado como segunda-feira. Passou a usar as
  partes locais da data.
- **O botão "Criar célula" era invisível.** O diálogo é montado com
  `createPortal` direto no `body`, fora de `.cells-workspace-v2`, que é onde os
  tokens `--v2-*` são declarados. Sem eles, `background: var(--v2-accent)` não
  resolve e o botão ficava branco sobre branco — a ação principal do diálogo não
  existia visualmente. Os tokens passaram a ser declarados no próprio overlay.

## 7. Ordem sugerida

A reforma é grande demais para um commit. Sugestão de recorte, cada bloco com
build, testes e evidências próprios:

1. **Fundação** — feito em `095fbdf`. Paletas colapsadas num acento de cobre,
   três declarações mortas removidas de `:root`, preset Cobre como padrão da
   plataforma. A quebra do `globals.css` em arquivos ficou de fora: o arquivo
   segue com ~29,6 mil linhas e é dívida aberta.
2. **Ícones e navegação** — feito em `79c8fbc`. O trilho e a barra móvel já
   usavam SVG; o que restava eram as ações rápidas e o campo `symbol` morto no
   `MENU`. "Mural" e "Escalas" deixaram de repetir a view de "Início" e
   "Ministérios" e passaram a ter destino próprio. Seção "Principal" virou
   "Dia".
3. **Fio do dia** — migração, rota agregadora e página com filtro por camada,
   troca de dia e registro manual.
4. **Módulos** — parcial. Feito: **Células**, que era o item mais fundo, com
   mapa de saúde (relatórios em dia, frequência das oito últimas semanas,
   prontidão para multiplicar) calculado dos relatórios que a rota já devolvia,
   sem consulta nova; e **Visitantes**, com o funil na frente da tabela.
   Também feitos: **Notificações**, agrupadas por dia com filtro "precisa de
   você" e ícones em traçado; e **Área do proprietário**, com a faixa de escopo
   permanente no lugar da nota escondida — a regra CSS órfã que sobrou foi
   removida junto, e com ela um verde que estava fora da paleta.
   E **Configurações**, que era o balde previsto: virou navegação por assunto,
   com o convite realocado para a seção Acessos.
   Verificados e já resolvidos no código, ou com premissa errada no diagnóstico:
   Pedidos, Ministérios, Estacionamento, Agenda, Pessoas e Criar feed — o
   composer já existe como modal, e "Criar feed" nunca foi uma aba. Ver seção 5.
   Este bloco está encerrado.
5. **Formulários** — feito. Regras 4 e 5 já estavam atendidas. As regras 1, 2 e
   3 foram aplicadas ao diálogo de célula (bloco público separado e avisado,
   rodapé com a consequência) e ao cadastro de visitante (rodapé dizendo que só
   o nome é obrigatório). Dois defeitos anteriores foram corrigidos junto: a
   data em UTC e o botão de confirmar invisível. Ver seção 6.
6. **Superfície pública** — feito. Recepção, login e perfil da comunidade. O
   trabalho não foi o previsto: a cor do bloco 1 não chegava a nenhuma dessas
   telas, e a causa está na seção 7.2. Além disso, cada página passou a ter
   título próprio na aba, e a coluna do login trocou três elogios por três
   informações. Ver seção 7.2.

## 7.1 O que só apareceu ao rodar

Os blocos 1 a 4 foram validados por build, testes e lint, mas nenhuma tela
tinha sido aberta com dados reais. Ao semear um banco local e entrar no painel,
quatro defeitos apareceram de uma vez — três deles invisíveis para qualquer
teste de conteúdo:

1. **`?view=fio` caía no Início.** `app/painel/page.tsx` mantém uma lista branca
   própria de views, e o bloco 3 não a atualizou. A aba abria no clique e se
   perdia ao recarregar, porque `openView` grava `?view=` na URL.
2. **`diaconia` tinha o mesmo problema, desde antes desta reforma.** Apareceu
   pelo teste escrito para o caso do fio.
3. **A coluna de saúde da célula não cabia na linha.** Foi movida para dentro da
   coluna do nome em vez de alargar a grade.
4. **A regra do badge "Ativa" vazava.** `.cell-row-copy-v4 i`, como descendente
   solto e com `color: #23b88a !important`, pintava de verde e dava forma de
   pílula a qualquer `<i>` da coluna — inclusive as barras de frequência e a
   pílula de saúde. Foi restringida ao elemento que deveria estilizar.

A lição fica registrada: teste de conteúdo prova que o código diz o que se
espera, não que a tela funciona. Os quatro casos acima passavam em 226 testes.

## 7.2 A segunda marca

O bloco 1 trocou a paleta e os testes confirmaram a troca. Mesmo assim, ao
abrir o perfil público de uma comunidade, o avatar da barra móvel continuava
azul-e-verde. A busca por texto no CSS não achava nada: a única regra que
citava aquela classe já estava em cobre.

A regra que vencia não cita a classe. É `.public-mobile-profile-link > span`,
com especificidade maior, pintando com `var(--pilot-gradient)`. E o valor
daquele token vinha de:

```css
:is(.pilot-dashboard,.owner-area,.social-public-community)[data-ui-version="v2"] {
  --pilot-primary: var(--v2-blue) !important;
  --pilot-accent: var(--v2-teal) !important;
  --pilot-gradient: linear-gradient(135deg,var(--v2-blue),var(--v2-teal)) !important;
}
```

A camada v2 tinha a **própria marca** — azul `#2554b8` e verde `#168778` — e a
impunha com `!important` sobre os tokens da plataforma. Existiam duas marcas
no produto, e a de baixo vencia em tudo que estivesse marcado como v2: o
painel inteiro, o login, a área do proprietário e o perfil público. O acento
cobre do bloco 1 só aparecia onde a v2 não chegava.

A correção é de cinco linhas, no lugar certo: `--v2-blue` e `--v2-teal` passam
a apontar para `var(--violet)`, e os blocos escuros deixam de redeclará-los,
porque o acento já troca sozinho por tema. `--v2-danger` e `--v2-warning`
continuam com valor próprio: ali a cor é estado.

Como encontrar isso: não por busca de texto — o culpado não cita a classe. Foi
`CSS.getMatchedStylesForNode`, via CDP, no elemento errado, que devolveu a
lista de regras que de fato o atingem, em ordem de cascata.

Depois disso, uma varredura por cor computada nas quatro páginas públicas e nas
nove views do painel, em tema claro e escuro, a 1440px e 390px, encontrou mais
quatro pontos fora da paleta, todos decorativos: os dois pontinhos da recepção
(o de "Gestão, conexão e cuidado" parecia dizer "no ar" sem indicar nada), a
bolinha do botão de ajuda, a capa das comunidades sem foto e a marca do login.
O único verde que ficou é o do aviso "Escala confirmada": ali a cor é
informação, e a regra da seção 2 manda deixar.

Dois defeitos apareceram de brinde, nenhum deles de cor:

1. **A tela de login não existe em `/entrar`.** A rota é `/login`, e sob host
   local ela redireciona para o autologin de prévia. As primeiras varreduras
   "do login" mediram, sem avisar, uma página 404 — e voltaram limpas. Só o
   acesso pelo endereço de rede alcançou a tela de verdade.
2. **A saudação do painel colava duas palavras**: "…em Comunidade Nova
   Aliançae resolva…". A quebra de linha depois de uma expressão não vira
   espaço no JSX.

## 8. Validação

Base `1c6d447`, em 30/08/2026: build aprovado, 206 de 206 testes, lint com
0 erros e 47 avisos.

Depois dos blocos 1 a 5: build e artefato do Sites aprovados, **235 de 235
testes** (29 novos em `tests/v190-reforma-visual-v5.test.mjs`), lint com
0 erros e os mesmos 47 avisos de `@next/next/no-img-element`.

Depois do bloco 6: build e artefato aprovados, **242 de 242 testes** (36 no
arquivo da reforma), lint com 0 erros e os mesmos 47 avisos. A varredura por
cor computada — quatro páginas públicas e nove views do painel, dois temas,
1440px e 390px — devolve zero pontos fora da paleta, com a única exceção
declarada do aviso "Escala confirmada".

**Seis dos dez itens do bloco 4 caíram ao serem conferidos contra o código**:
Ministérios, Pedidos, Estacionamento, Agenda, Pessoas e Criar feed já estavam
resolvidos ou partiam de premissa errada no diagnóstico. O que sobrou e foi
construído: Células, Visitantes, Notificações, Área do proprietário e
Configurações.

As telas do Fio do dia, Células e Visitantes foram abertas autenticadas num
banco local semeado, o que produziu as correções da seção 7.1.

Duas afirmações do diagnóstico original caíram ao serem checadas contra o
código: Equipes já era aba própria no ministério, e pedidos já eram filtrados
por destinatário no servidor. Ambas estão corrigidas nas seções 5 e 7 em vez de
apagadas — o erro faz parte do registro.

A rota `/api/pilot/fio` foi exercitada autenticada: agrega eventos, escalas,
visitantes, pedidos, mural e registros manuais, com o marcador "agora" no lugar
certo e o futuro tracejado.

O que segue **sem** verificação com dados de verdade: os limiares da saúde da
célula (70% de queda, 3 semanas de atraso, média ≥ 15 para multiplicar) foram
calibrados contra dados semeados por quem os escreveu, o que não prova nada
sobre uma comunidade real. A heurística do "precisa de você" nas notificações
classifica por palavra no texto e tem o mesmo problema.

Observação para quem for validar: 39 testes de integração dependem de
`dist/server/index.js`. Rodar a suíte sem o build antes produz 39 falsas
falhas. O `npm test` do projeto já encadeia build e testes na ordem correta.
