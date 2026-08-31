# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a **Reforma Visual V5**, que está pronta e validada no branch
`claude/system-preview-last-commit-dsr0q4` do repositório
`da0602766-byte/V-nkulo`. Ela já foi integrada ao seu trabalho: o merge de
`origin/main` (até `8d9aca2`) está feito dentro do branch, e a suíte passa com
os seus testes `v183` e `v187` sem nenhuma adaptação.

## Antes de tudo: a migração mudou de número

**Aplique `drizzle/0060_fio_registros.sql` no banco de produção antes de subir
o código.** Sem ela, a página "Fio do dia" responde 500 ao gravar um registro
manual — a leitura do fio funciona, porque é agregação do que já existe.

Ela nasceu como `0059` e foi renumerada porque você publicou
`0059_publication_governance.sql` primeiro. Duas migrações com o mesmo número
deixam ambíguo o que aplicar; quem chega depois assume o número seguinte. As
duas foram aplicadas ao mesmo banco local, na ordem, sem conflito — é assim que
se sabe que convivem.

A `0060` cria uma tabela nova (`fio_registros`) e um índice
(`fio_registros_dia_idx`). Não altera nem remove nada existente, então é
reversível por `DROP TABLE`.

## O que publicar

Os 15 commits que o branch tem à frente de `main` — de `90bdb09` a `b7e7886`.
O conjunto mexe em 46 arquivos: 2.932 linhas somadas, 157 removidas.

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `90bdb09` | Cache de fontes geradas localmente (`.vinext`) |
| 2 | `b1f001d` | `REFORMA_VISUAL_V5.md` — a especificação |
| 3 | `095fbdf` | Bloco 1: paletas colapsadas num acento de cobre |
| 4 | `79c8fbc` | Bloco 2: ícones em SVG, itens duplicados do menu desfeitos |
| 5 | `f0eda8d` | Bloco 3: Fio do dia como página própria |
| 6 | `b99313d` | Bloco 4: saúde das células e funil de visitantes |
| 7 | `c9591d6` | Bloco 4: notificações por dia, escopo do proprietário |
| 8 | `e3b3658` | Quatro defeitos que só apareceram com o sistema rodando |
| 9 | `c1dfb1a` | Configurações com navegação por assunto |
| 10 | `02cdfb2` | Fio do dia completo; encerra o bloco 4 |
| 11 | `1bd5a9f` | Bloco 5: consequência no rodapé dos formulários |
| 12 | `97d4da1` | Bloco 6: superfície pública com um acento só |
| 13 | `7b7caf0` | Renumera a migração do fio para `0060` |
| 14 | `90eeffe` | Integra a reforma ao seu trabalho publicado |
| 15 | `b7e7886` | Este documento |

## O que foi preservado do seu trabalho

A mesclagem teve 54 conflitos, resolvidos um a um. O critério: **o que você
publicou e é capacidade nova permanece; o que é apenas a versão anterior
daquilo que a reforma substituiu, cede.**

Ficou como você escreveu:

- **A barra móvel é a sua**, com o botão central "Adicionar" e os contadores em
  Agenda e Pedidos. Os dois lados chegaram com cinco itens diferentes — a
  reforma tinha um item "Comunidade" — e somar daria seis em cinco espaços. O
  seu já estava publicado e traz contagem de pendências, que é informação; o
  "Comunidade" era conveniência. O Fio do dia continua alcançável pela folha do
  menu.
- **Os nomes das visões de Visitantes são os seus** (`todos`, `novos`,
  `acompanhamento`, `pendencias`, `sem_contato`), com "Revisar e exportar",
  "Ver arquivados" e a coluna "Próximo passo".
- **O popover de mensagens no desktop e a folha móvel redesenhada** são seus.

Ficou da reforma: os ícones em SVG (o seu lado ainda trazia `◇ ▣ ✣ ♡ ⬡`), o Fio
do dia, os grupos do trilho, o funil, a saúde das células e o diálogo de célula
reestruturado.

**Uma correção foi reaplicada sobre o seu código:** a coluna "Próximo passo"
comparava datas com `new Date().toISOString().slice(0, 10)`, que é UTC. No
Brasil, das 21h em diante a data já virou — um visitante recebido no culto de
domingo à noite era gravado como segunda, e a marca de atraso saía errada.
Agora usa `hojeLocal()`.

## Validação já executada

- Build e artefato do Sites aprovados.
- **250 de 250 testes**, incluindo os seus `v183` e `v187` sem adaptação.
- Lint com 0 erros e 47 avisos (os mesmos `@next/next/no-img-element` de antes).
- As seis views do painel e as quatro páginas públicas abertas autenticadas num
  banco local semeado, em tema claro e escuro, a 1440px e 390px: nenhuma
  resposta 4xx/5xx e nenhuma cor fora da paleta.

## Duas coisas que são suas para decidir

1. **Aviso de hidratação em `CommunityHome`.** `renderedAt` guarda `Date.now()`
   num `useState`, que roda no servidor e no cliente com valores diferentes. O
   React reclama no console. Está nos dois lados desde antes desta reforma, e
   por isso não foi tocado aqui.
2. **O verde-água da agenda** (`#3fc9b0`, camada pessoal) permanece de
   propósito, e vale dizer com precisão por quê: camada **não** é estado, é
   categoria. A regra escrita na reforma ("verde, âmbar e rosa só significam
   estado") não cobre esse caso — o que ela quer dizer é que cor precisa
   informar, não decorar, e distinguir três camadas na mesma grade informa.
   Se você preferir fechar a regra em vez de interpretá-la, o caminho é
   declarar as cores de camada como um conjunto categórico próprio, separado
   dos tokens de estado.

## Passos

1. `git fetch origin claude/system-preview-last-commit-dsr0q4`
2. Confira o diff contra `main` e o `REFORMA_VISUAL_V5.md` (as seções 7.1, 7.2
   e 7.3 contam o que deu errado e por quê).
3. Aplique `drizzle/0060_fio_registros.sql` no banco de produção.
4. Integre em `main` e publique no Sites pelo fluxo do
   `COORDENACAO_IA.md` — credencial temporária por comando, nunca gravada em
   arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada na linha do Claude em `COORDENACAO_IA.md`.

## Verificação depois de publicar

- `/` , `/login`, `/comunidades` e `/comunidades/<slug>` abrem com título
  próprio na aba e sem azul, roxo ou ciano de marca.
- `/painel?view=fio` abre o Fio do dia — e continua nele depois de recarregar
  (esse era um defeito real: a lista branca de views em `app/painel/page.tsx`).
- Em Células, a coluna de saúde aparece na linha sem cortar.
- Um visitante cadastrado à noite recebe a data de hoje, não a de amanhã.
