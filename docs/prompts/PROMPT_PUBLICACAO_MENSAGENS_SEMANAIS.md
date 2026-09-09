# Prompt de publicação — Mensagens no sistema, exclusão semanal e chat em tela cheia

Copie daqui para baixo.

---

Você vai publicar a **reconstrução da aba Mensagens**: o conteúdo das conversas
sai do Google Drive e passa a viver no banco do próprio sistema, com exclusão
semanal automática e sem exceção; os estados de enviado/entregue/lido passam a
funcionar de verdade; e a interface foi refeita para desktop e celular. Está
pronta e validada no branch `claude/great-curie-9v7hff` do repositório
`da0602766-byte/V-nkulo`.

## O branch, em uma conferida

São **6 commits**, 18 arquivos, 1.424 linhas somadas e 642 removidas. O branch
descende de `origin/main` em `b0390dd` ("merge: sincroniza histórico do Sites
antes da versão 235") e **não está atrás dele** — todo o trabalho anterior que
o branch carregava já entrou no `main`. Confirme antes de qualquer coisa:

```
git fetch origin claude/great-curie-9v7hff main
git log --oneline origin/main..origin/claude/great-curie-9v7hff
git diff --shortstat origin/main..origin/claude/great-curie-9v7hff
```

Os commits, do mais antigo para o mais novo:

| Commit | O que faz |
| --- | --- |
| `43bf531` | Armazenamento no sistema, ciclo semanal, tiques, redesenho da aba |
| `f05d6b7` | Três defeitos vistos na prévia real (corte da lista, fuso do aviso, campo atrás da barra) |
| `80eeb9d` | Celular: chat em tela cheia, abertura só com os contatos |
| `7d305e1` | Conversa sem barras e lista de contatos no formato de app de mensagem |
| `b64b34a` | Animações de envio/recebimento e aviso de quem mandou |
| `4c0e1da` | Quatro correções encontradas na revisão do próprio código |

## Migração obrigatória — banco antes do código

Este trabalho **tem migração**, e a ordem importa: o código novo consulta
colunas que só existem depois dela.

`drizzle/0070_chat_system_retention.sql` faz três coisas em
`conversas_privadas` (reconstruindo a tabela, no mesmo padrão das migrações
`0006` e `0019`) e uma em `mensagens_privadas`:

1. `ciclo_mes` vira `ciclo_semana` — o agrupamento deixa de ser mensal e passa
   a ser semanal.
2. Saem `drive_file_id` e `storage_provider`, que só existiam para apontar a
   pasta da conversa no Drive.
3. `mensagens_privadas` ganha `entregue_em`, para o segundo tique.

**Consequências reais, para você saber antes e não se assustar:**

- As conversas existentes ficam com o valor antigo (`2026-09`) na coluna
  `ciclo_semana`, que nunca vai bater com o formato novo (`2026-36`). Elas
  somem da tela na hora e são apagadas na primeira manutenção. Isso é o
  comportamento desejado: o ciclo semanal começa limpo.
- Mensagens que já estavam no Google Drive continuam lá, intactas na conta do
  responsável — o app simplesmente para de lê-las. Nada é apagado do Drive por
  esta publicação.
- A migração não tem volta automática. Se precisar reverter o código, o banco
  continua no formato novo; o código antigo procuraria `ciclo_mes` e falharia.

## O que este trabalho entrega

**1. Conversa gravada no sistema, sem Drive** (`app/api/pilot/chat/route.ts`,
`app/api/storage/migrate/route.ts`)

A rota do chat perdeu toda a dependência de `google-integration`: grava com
`INSERT ... RETURNING` em `mensagens_privadas` e lê direto do banco. Sumiu o
ida-e-volta com a API do Drive a cada mensagem, que era o que deixava o envio
lento. A migração de conteúdo para o Drive (`/api/storage/migrate`) não trata
mais de conversas — mensagem não "falta migrar", ela é apagada toda semana.

**2. Exclusão semanal, sem exceção, com aviso prévio**
(`app/lib/chat-retention.ts`, `worker/index.ts`)

Cada semana abre uma conversa nova (`ciclo_semana = strftime('%Y-%W','now')`).
A rotina `purgeExpiredPrivateMessagesIfDue` apaga toda conversa que não é da
semana corrente — a mensagem cai junto pela FK em cascata. Ela roda a partir do
`fetch` do worker, no máximo uma vez a cada 10 minutos.

Repare que ela **não passa pelo Otimizador da Plataforma** de propósito: o
otimizador é configurável (o proprietário pode desligar ou espaçar para 720h),
e uma promessa de "apagar toda semana, sem exceção" não pode depender de um
botão. Se for mexer nisso, mantenha essa separação.

A troca de semana já bloqueia o acesso na hora (as consultas filtram pelo ciclo
corrente), então a limpeza física não é a única barreira.

O aviso prévio fica fixo na própria aba: no desktop, a frase completa mais a
data e a hora da próxima limpeza; no celular, uma tarja de uma linha ("Tudo é
apagado domingo, 13/09 às 21:00 — salve o que precisar"). A política também
está na Política de Privacidade (`app/privacidade/page.tsx`, item 4.1) e na
tela de armazenamento (`app/components/StoragePrivacyWorkspace.tsx`).

**Cuidado com o fuso**: `%W` vira na segunda-feira 00h **UTC**, que no horário
de Brasília é **domingo às 21h**. Por isso o texto fixo fala em "virada da
semana" e quem mostra dia e hora exatos é a interface, já no fuso de quem lê.
Se alguém "corrigir" o texto para citar um dia da semana, volta a mentir para
metade do mundo.

**3. Enviado, entregue e lido — e contagem real de não lidas**

`entregue_em` é marcado quando o destinatário busca as mensagens; `lida_em`,
quando ele abre a conversa (PATCH). Antes, `lida_em` não era escrito em lugar
nenhum: o rótulo "Visualizada" existia no código e nunca aparecia. A contagem
de não lidas por conversa também era literalmente `0 AS nao_lidas` na consulta
— agora é contada de verdade, e o atalho de mensagens no topo do painel passou
a mostrar número certo.

**4. Interface refeita** (`app/components/PrivateChatWorkspace.tsx` reescrito,
`app/globals.css`)

Bolhas agrupadas por remetente e por dia (separadores "Hoje"/"Ontem"), avatar
compacto na última mensagem do bloco, "visto por último" respeitando a mesma
privacidade do painel de presença, envio otimista com reenvio em caso de falha,
sondagem de 3s na conversa aberta e 8s na lista.

No celular a aba abre **só com os contatos** (linha de 76px, foto de 56px) e,
com a conversa aberta, **a barra do topo e a navegação do rodapé somem**: a
tela inteira é o chat, com o cabeçalho da conversa fazendo as vezes de topo.
Voltar traz as duas de volta.

**5. Animações** (`app/components/IncomingMessageToast.tsx` novo,
`app/components/PilotDashboard.tsx`)

Bolha nova entra pelo lado de quem escreveu; o tique reage quando o estado
muda; e, quando chega mensagem com a pessoa fora da aba Mensagens, desce um
aviso com a foto de quem escreveu (crescendo, com anéis pulsando), nome, prévia
e contador — clicar abre a conversa. Tudo desligado em
`prefers-reduced-motion`.

Para saber *quem* escreveu, a sincronização do painel compara as não lidas
conversa a conversa (antes só somava o total) e o intervalo caiu de 30s para
15s.

**6. Ajuste de rótulo** (`app/api/proprietario/route.ts`,
`app/components/OwnerWorkspace.tsx`)

A métrica do proprietário "Conversas no mês" virou "Conversas na semana" e a
consulta acompanhou o ciclo novo. Sem isso a consulta quebraria: ela ainda
citava `ciclo_mes`.

## Testes

`npm run build && node --test tests/*.test.mjs` — **341 passando**. O build
antes é obrigatório: `tests/pilot-integration.test.mjs` importa
`dist/server/index.js`.

Três arquivos de teste foram atualizados porque **travavam o comportamento
antigo**, não porque quebraram por acidente:

- `tests/v189-google-drive-privacy.test.mjs` — o teste exigia que o chat
  cifrasse no Drive e **não** escrevesse em `mensagens_privadas`. Virou o
  oposto, mais a exigência de que a limpeza semanal exista.
- `tests/pilot-integration.test.mjs` — o teste protegia a migração em lotes do
  chat para o Drive, código que deixou de existir. No lugar entrou uma trava
  para a limpeza semanal: o `DELETE` precisa continuar filtrando por
  `ciclo_semana <> strftime('%Y-%W','now')`, nunca virar um `DELETE` sem
  filtro (isso apagaria a semana corrente junto).
- `tests/pilot-security.test.mjs` — a asserção do ciclo passou de
  `ciclo_mes = strftime('%Y-%m','now')` para a versão semanal. As travas de
  isolamento por comunidade e da regra membro/oficial continuam iguais.

## Como validar de verdade antes de publicar

Os testes leem código e banco, mas não abrem a tela. Se quiser conferir
visualmente, dá para subir o worker buildado localmente com um D1 em memória —
foi assim que esta entrega foi verificada:

1. `npm ci && npm run build`.
2. Um script Node que importa `createPilotD1`/`createPilotUser` de
   `tests/helpers/sqlite-d1.mjs`, importa `dist/server/index.js` e serve num
   `http.createServer`, traduzindo req/res do Node para `Request`/`Response`.
3. `env = { DB: d1, AUTH_SECRET: "...", ASSETS: { fetch } }`, com `ASSETS`
   lendo de `dist/client`. **Sirva `dist/client` antes de chamar o worker**: na
   Cloudflare os estáticos são servidos pela plataforma, e se caírem no worker
   o roteador responde 404 em HTML e a página fica sem JS.
4. Semeie usuários com `createPilotUser` (todos como `MEMBRO`: membro só
   conversa com membro) e mande mensagens pela própria API, com o cookie de
   sessão do login.
5. Abra `http://localhost:PORT/api/auth/preview?returnTo=/painel?view=mensagens`
   — em loopback o app entra sozinho com o primeiro usuário elegível.

Três armadilhas que custaram tempo e vão custar de novo:

- **A raiz do painel roda com `zoom` (escala da interface)**, hoje `0.85`. Um
  `100dvh` dentro dela vale menos que a tela. Para altura cheia use
  `calc(100dvh * var(--vinkulo-ui-scale-inverse, 1))`, como as outras telas
  cheias do app já fazem.
- **`.pilot-workspace` tem `overflow-x: clip` abaixo de 560px**, então o truque
  de "sangrar" com `width: 100vw; margin-left: calc(50% - 50vw)` é cortado. O
  caminho usado aqui foi zerar o padding do workspace via
  `[data-fullscreen-view="mensagens"]`.
- **Há blocos `data-ui-version="v2"` com `!important` no fim do
  `globals.css`** que sobrescrevem regras do chat. As regras novas foram
  anexadas ao fim do arquivo justamente para ganhar por ordem de origem. Se
  colocar no meio, não pegam.

## Passos da publicação

1. Aplique **primeiro** `drizzle/0070_chat_system_retention.sql` no D1 de
   produção, pelo fluxo de sempre. Confira depois que `conversas_privadas` tem
   `ciclo_semana` e não tem mais `drive_file_id`/`storage_provider`, e que
   `mensagens_privadas` tem `entregue_em`.
2. Publique o código do branch.
3. Não rode `npm run db:generate`: as migrações deste repositório são escritas
   à mão e o snapshot do drizzle-kit está desatualizado desde a `0048` (está
   explicado em `drizzle/README.md`). O próximo número livre agora é `0071`.
4. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
5. Registre a versão publicada nas linhas do Claude em
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- Abrir **Mensagens** no computador: título, aviso com data e hora da próxima
  limpeza, lista à esquerda e conversa à direita.
- Mandar uma mensagem: ela aparece na hora (um tique). Quando o outro lado
  carrega a conversa, viram dois tiques cinza; quando ele abre, ficam azuis.
- O contador de não lidas no atalho do topo mostra número real e some ao ler.
- Com a outra pessoa escrevendo enquanto você está em outra aba: desce o aviso
  com a foto e o nome dela; clicar abre a conversa; ele some sozinho em 6s.
- No celular: a aba abre só com os contatos, linhas altas; ao abrir a conversa
  não sobra barra nenhuma na tela; a seta volta para a lista.
- Na virada da semana (segunda 00h UTC / domingo 21h em Brasília), as conversas
  da semana anterior somem da tela. Uma consulta em `conversas_privadas` deve
  mostrar só linhas com o `ciclo_semana` corrente depois da primeira
  manutenção.

## O que não fazer

- Não devolva as mensagens para o Google Drive: a troca foi consciente —
  histórico permanente é exatamente o que uma conversa privada não deveria ter
  aqui, e a rapidez do envio veio de gravar no próprio banco.
- Não torne a limpeza semanal configurável nem a mova para dentro do
  Otimizador da Plataforma.
- Não troque o texto fixo do aviso por um dia da semana fixo (o fuso, de novo).
- Não remova o `minmax(0, 1fr)` de `.private-chat-row-main`: sem ele a coluna
  do grid nasce em `max-content` e o nome vaza da barra lateral.
