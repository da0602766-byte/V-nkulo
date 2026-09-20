# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a entrega de **Visitantes**, pronta e validada no branch
`claude/visitantes-layout-desktop-11wzop` do repositório `da0602766-byte/V-nkulo`.

São duas tarefas que andam juntas: o acerto do layout no desktop e o redesenho
da tela no padrão de Ministérios. Não há migração de banco — `drizzle/` não foi
tocado, então nada precisa ser aplicado em produção antes de subir o código.

## O que publicar

Tudo o que o branch tem à frente de `main`. Confira na fonte em vez de confiar
nos números daqui:

```
git log --oneline --reverse origin/main..origin/claude/visitantes-layout-desktop-11wzop
git diff --shortstat origin/main...origin/claude/visitantes-layout-desktop-11wzop
```

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `d3fdc93` | Acerta o layout de Visitantes no desktop |
| 2 | `eef3309` | Redesenha Visitantes no padrão de Ministérios |
| 3 | `f9d4c49` | Script de publicação (desfeito no commit seguinte) |
| 4 | `5d208fe` | Registro da entrega na coordenação; desfaz o script |

Os commits de código são os dois primeiros. Os arquivos tocados em `app/` são
`components/TenantOperations.tsx`, `components/RelacionamentoTools.tsx`,
`globals.css`, `layout.tsx`, `visitors.css` (novo) e `api/pilot/visitantes/route.ts`
— esta última com 4 linhas somadas, que acrescentam `em_contato` e `integrado`
ao SELECT já existente das contagens, sem consulta nova.

Os commits 3 e 4 merecem explicação, porque a dupla parece estranha no log. O
terceiro criou um `publish-visitantes.sh` na raiz que descrevia a publicação
como `git push origin main`; o quarto o removeu, porque não é isso que o projeto
faz — o caminho é o desta seção, e `scripts/pre-publicacao.sh` já cobre a parte
automatizável. O par ficou no histórico em vez de ser reescrito.

## O merge com `main` já foi conferido, mas não está no branch

O branch está atrás de `main`. O merge foi executado e validado num worktree
separado, **não commitado** — integrar continua sendo seu passo. Vale saber o
que a conferência encontrou, porque há uma armadilha:

`main` removeu oito arquivos na limpeza de código morto, entre eles
`app/components/DashboardChart.tsx`. A entrega devolveu o gráfico de crescimento
ao painel de panorama, e o Git **não acusa conflito** entre "removi o arquivo" e
"voltei a usá-lo" — seria merge limpo e build quebrado.

Não é o caso: foi conferido por busca que nenhum dos removidos
(`DashboardChart.tsx`, `LandingFeatureCards.tsx`, `PublicFeedCard.tsx`,
`PublicPostInteractions.tsx`, `diaconia-ranking.ts`, `diaconia-teams.ts`,
`display-control.ts`, `display-message-input.ts`) é referenciado pela candidata.
A única menção que sobra é o próprio `tests/dead-code-cleanup.test.mjs`, que
exige a ausência deles. O gráfico é markup inline, não aquele componente.

O merge não teve conflito.

## Validação já executada

`scripts/pre-publicacao.sh` rodou **sobre o resultado do merge com `origin/main`**,
não sobre o branch isolado:

- TypeScript limpo.
- Lint com 0 erros e os 42 avisos `@next/next/no-img-element` preexistentes.
- Build e artefato do Sites aprovados.
- **358 de 358 testes, nenhuma falha nova.**

A contagem subiu de 354 para 358 porque `main` trouxe
`tests/dead-code-cleanup.test.mjs`. Se você vir 354 citado na tabela de
coordenação, é a medição do branch isolado, feita antes da integração.

As quatro abas foram medidas no navegador em 1024, 1280, 1440 e 1920 px, em tema
claro e escuro, sem nenhum elemento fora do contêiner.

## Duas pendências deixadas de propósito

1. **O CSS do cartão legado continua em `globals.css`, inerte** — `.visitor-card-*`,
   `.visitor-inline-*`, `.visitor-overview-grid`, `.visitor-category-dashboards`.
   Remover exigiria mexer em regras compartilhadas com `.operations-list` e
   `.operations-toolbar` de outras áreas, e não cabia nestas tarefas.
2. **O kicker continua cobre** nas abas de Visitantes e Ministérios, por causa de
   `.pilot-dashboard[data-ui-version="v2"] .pilot-kicker{color:var(--v2-teal)!important}`
   em `globals.css:25659`. É o mesmo nas duas telas, então foi mantido; se virar
   decisão, muda para as duas de uma vez.

## Passos

1. `git fetch origin claude/visitantes-layout-desktop-11wzop`
2. Confira o diff contra `main` e as duas linhas de Visitantes em
   `docs/coordenacao/COORDENACAO_IA.md`, que trazem o detalhamento completo.
3. Integre em `main` e rode `scripts/pre-publicacao.sh` sobre o resultado — ele
   sai com 0 quando tudo passa e 1 quando encontra regressão.
4. Publique no Sites pelo fluxo do `docs/coordenacao/COORDENACAO_IA.md`: leia o
   `project_id` de `.openai/hosting.json`, peça a credencial temporária ao
   conector e use-a só no comando de push, por cabeçalho HTTP. Nunca gravada em
   arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada nas duas linhas de Visitantes em
   `docs/coordenacao/COORDENACAO_IA.md`, hoje em "aguardando publicação no Sites".
   A última publicada é a **258**.

## Verificação depois de publicar

- A aba Visitantes abre em **Visão geral**, e as quatro abas são Visão geral,
  Pessoas, Acompanhamento e Aniversários.
- Em **Pessoas**, a tabela não rola horizontalmente entre 1280 e 1920 px, e as
  colunas "Próximo passo" e o botão de abrir a ficha ficam visíveis.
- Com busca ou filtro ativo, o funil **não** muda para "100% integrados": as
  proporções vêm das contagens do servidor, não da página carregada.
- Um erro ao salvar categoria ou ao criar visitante aparece **na frente** do
  modal aberto, não atrás dele.
- A faixa de categorias e a lista de aniversariantes não escondem conteúdo à
  direita no desktop — quebram em linhas.
- Os cabeçalhos das seções do cadastro saem separados, não colados
  ("1Informações pessoaisNome e formas de contato" era o defeito).
