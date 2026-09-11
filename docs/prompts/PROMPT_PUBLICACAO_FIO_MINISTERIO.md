# Prompt de publicação — para ChatGPT/Codex

Copie daqui para baixo.

---

Você vai publicar o **"Fio do Ministério"**, pronto no branch
`claude/dreamy-cerf-b5b9f8` do repositório `da0602766-byte/V-nkulo`
(commit `0c27774`). Não há pull request aberto — abra um a partir deste
branch, ou integre direto em `main` se for o seu fluxo de costume.

Uma prévia estática (HTML/CSS/JS reproduzindo as classes reais, com dados
fictícios) está publicada em
https://claude.ai/code/artifact/7f2949e7-1344-470e-a322-573993d9c753 —
útil para ver o fio, a animação das bolinhas e as escalas recolhidas sem
subir o ambiente, mas não substitui o QA visual no app de verdade pedido
mais abaixo.

## O que é, em uma frase

Cada escala ganha um **fio vertical de checkpoints**, da criação até o dia
do culto, que responde de um olhar à pergunta que originou o pedido:
*"está tudo pronto para o dia?"*. O caso que motivou a funcionalidade é o
louvor ("o som está testado? o repertório fechou?"), mas o fio é ligado
por ministério e serve a qualquer um deles.

## Antes de tudo: há uma migração

`drizzle/0072_fio_ministerio.sql` adiciona três colunas, todas com
`DEFAULT` (não quebra linha existente nenhuma):

```sql
ALTER TABLE `ministerios_comunidade` ADD `fio_habilitado` integer DEFAULT 0 NOT NULL;
ALTER TABLE `ministerios_comunidade` ADD `fio_etapas` text DEFAULT '[]' NOT NULL;
ALTER TABLE `escalas_ministerio` ADD `fio_etapas` text DEFAULT '[]' NOT NULL;
```

Aplique no D1 de produção como qualquer outra migração desta pasta.
**Não rode `drizzle-kit generate`** — `drizzle/README.md` explica por que
o journal está desatualizado desde a `0048` e por que as migrações
continuam sendo escritas à mão; o próximo número livre já foi atualizado
para `0073`.

## O que já existia e foi reaproveitado (leia antes de "implementar de novo")

Uma parte grande do pedido original já estava no sistema. Nada disso foi
reescrito:

- **"As escalas aparecem quando o tempo iniciar"** — já existia:
  `publicar_em` + `publishDueSchedules` (`app/lib/schedule-publication.ts`)
  viram `AGENDADA → PUBLICADA` na hora marcada, e a contagem regressiva já
  era exibida (`SchedulePublicationCountdown`). O que mudou é que essa
  contagem **agora também é um nó do fio**, em vez de um detalhe solto no
  cabeçalho do cartão.
- **Checklist por escala** — continua existindo e **não** foi substituído.
  Ele responde "quem faz o quê"; o fio responde "está pronto?". São listas
  diferentes, de propósito.
- **Designações e confirmações da equipe** — o nó "Equipe confirmada" lê
  `escala_designacoes` como ela já é; nenhum campo novo foi criado para
  isso.

## O modelo de dados, e por que ele é assim

O ministério guarda **só o modelo** (uma lista de títulos). Cada escala
guarda **as suas próprias etapas, com estado**. Isso atende ao pedido
explícito de que *"cada escala deve variar"*: mudar o modelo do ministério
não mexe em escala nenhuma já criada, e mudar as etapas de uma escala não
mexe no modelo.

- `ministerios_comunidade.fio_habilitado` (0/1) e `.fio_etapas`
  (`["Repertório fechado", ...]`).
- `escalas_ministerio.fio_etapas`
  (`[{ id, titulo, feito, feitoEm, feitoPor }, ...]`).

Ao criar uma escala, se o formulário não mandou etapas, ela **herda uma
cópia** do modelo do ministério (`seedFioSteps`, em
`app/api/pilot/escalas/route.ts`). Se mandou, a dela vale.

Validação em `app/lib/ministry-validation.ts`: `parseFioTemplate`
(títulos), `parseFioSteps` (etapas com estado, preservando `feito`/quando/
quem), `seedFioSteps`, `FIO_MAX_STEPS = 12`, `FIO_MAX_TITLE = 120`.

## Permissões — o ponto que merece revisão sua

Duas ações novas em `app/api/pilot/escalas/[id]/route.ts`:

- **`FIO_ETAPA`** (marcar/desmarcar uma etapa) — permitida a quem
  gerencia a escala **ou** a quem tem designação ativa nela. Essa
  abertura é deliberada: *o som quem testa é quem opera o som*. Se a
  política da sua comunidade for mais restrita, é essa checagem que você
  muda (está comentada no arquivo).
- **`FIO_ETAPAS_DEFINIR`** (redefinir as etapas daquela escala) — só
  `canManageSchedule`. Preserva por `id` o que já estava marcado, para
  editar o fio no meio da semana não apagar progresso.

Ambas gravam auditoria: `FIO_MINISTERIO_ETAPA_ATUALIZADA` e
`FIO_MINISTERIO_ETAPAS_DEFINIDAS`.

## O que muda na tela

Tudo em `app/components/SecretaryMinisterialWorkspace.tsx` e
`app/secretary.css` (nenhum componente novo de arquivo; nenhuma segunda
versão de tela).

1. **Na criação do ministério** (`MinistryForm`) e nas **Configurações**
   dele (`MinistrySettingsForm`, seção 4 nova): uma caixa
   `FioTemplateFields` com o interruptor "Ativar o Fio do Ministério" e o
   editor das etapas-modelo. Ao ligar, ele já sugere etapas conforme a
   categoria (louvor, mídia, recepção, e um padrão para o resto) — são
   sugestões editáveis, não uma lista fixa.
2. **Dentro de cada escala**, abaixo do repertório: o `FioThread` — a
   linha vertical com as bolinhas. Os nós são, nesta ordem: *Escala
   criada* → *Publicação para a equipe* (com a contagem regressiva quando
   está agendada) → as etapas do ministério/escala (clicáveis) → *Equipe
   confirmada* (`n/N confirmaram presença`) → *Dia do culto*.
3. **O veredito**, no topo do fio e também na linha de cada escala
   recolhida: "Tudo pronto", "Falta 1 item" / "Faltam N itens",
   "Aguardando liberação" (agendada), "Rascunho", "Concluída sem
   pendências" ou "Encerrada com pendências".
4. **Escalas encerradas recolhem sozinhas.** O que já passou (ou foi
   encerrado/cancelado/arquivado) sai da lista cheia e vira uma linha —
   data, título, veredito — sob um cabeçalho "N escalas encerradas
   recolhidas automaticamente", com "Expandir tudo". Clicar numa linha
   reabre aquele cartão inteiro. Nada é dado como passado antes de o
   relógio do cliente acertar (`agora > 0`), senão a primeira renderização
   recolheria escalas de hoje.
5. O fio só aparece nas escalas de ministérios que ligaram a opção — e
   continua aparecendo numa escala que já tem etapas, para nada marcado se
   perder se alguém desligar a opção depois.

## A animação (pedido explícito do dono: "as bolinhas emitindo luz")

`@keyframes fio-glow` em `app/secretary.css`: um halo que respira
(`box-shadow` em duas camadas, com `color-mix`), verde nas etapas feitas e
roxo no nó que está aguardando. O atraso é em cascata —
`animation-delay: calc(var(--i,0) * .16s)`, onde `--i` é o índice do nó,
vindo do JSX — para a luz parecer percorrer o fio de cima para baixo. O
trecho já percorrido do fio também acende (gradiente no `::after`).

Em `prefers-reduced-motion: reduce` a luz **continua**, só para de pulsar:
vira um `box-shadow` fixo. Não remova esse bloco.

## Dois defeitos já corrigidos no retorno do dono (não reintroduza)

1. **Texto das escalas recolhidas quebrando letra a letra no celular** —
   o selo do veredito disputava a largura com o título. A regra
   `@media(max-width:640px)` reescreve `.fio-encerrada-linha` como grade
   com `grid-template-areas:"data titulo" "selo selo"`, jogando o selo
   para a linha de baixo. Se você mexer nesse bloco, teste em ~390px.
2. **Bolinhas sem luz** — era a versão anterior da prévia; ver a seção
   acima.

## Validação já feita aqui

- `npx tsc --noEmit` — limpo.
- `npx eslint` nos arquivos tocados — 0 erros (só os 4 avisos
  `@next/next/no-img-element` que já existiam no arquivo).
- `node --test tests/*.test.mjs` — 309 passes, 54 falhas **idênticas às do
  baseline** sem `dist/` (conferido com `git stash`: a lista de falhas
  antes e depois da mudança é a mesma).
- `tests/v237-fio-ministerio.test.mjs` (novo, 7 testes) cobre migração,
  schema, validação, as duas ações da rota, os nós e o veredito do fio, a
  animação com cascata e `prefers-reduced-motion`, o recolhimento
  automático e o recorte móvel, e o fato de o fio só aparecer onde a opção
  foi ligada.

**O que não deu para validar aqui**: o app não sobe neste ambiente (o
toolchain de hospedagem exige D1, autenticação e banco semeado). A prévia
é estática. Então o QA visual abaixo é com você.

## QA visual pedido, no app de verdade

1. Criar um ministério de louvor com o Fio ligado; conferir que as etapas
   sugeridas aparecem e são editáveis antes de salvar.
2. Criar uma escala nesse ministério **sem** mexer em etapas; conferir que
   ela nasceu com a cópia do modelo.
3. Numa escala, "Ajustar etapas desta escala": tirar uma, acrescentar
   outra, salvar — e conferir que o que estava marcado continua marcado, e
   que o **modelo do ministério não mudou**.
4. Marcar etapas como uma pessoa que está escalada (não líder): deve
   funcionar. Como alguém de fora da escala: deve dar 403.
5. Agendar uma escala para dali a alguns minutos e conferir o nó
   "Publicação para a equipe" com a contagem, e a virada para publicada.
6. Deixar uma escala terminar e conferir que ela recolhe sozinha, com o
   veredito correto na linha.
7. Celular real, ~390px: a linha recolhida com o selo embaixo, sem quebra
   de texto estranha. Tema claro e escuro.

## Registro depois de publicar

Atualize a linha correspondente em `docs/coordenacao/COORDENACAO_IA.md`
(está em "Trabalho em andamento", marcada como *concluído e validado,
aguardando publicação*) com a versão/URL do Sites, como as publicações
anteriores fazem.
