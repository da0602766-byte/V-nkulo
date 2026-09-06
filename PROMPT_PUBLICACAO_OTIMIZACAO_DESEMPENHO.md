# Prompt de publicação — para o Codex/ChatGPT

Copie daqui para baixo.

---

Você vai publicar a **auditoria e otimização de desempenho**, pronta no branch
`feat/layout-e-tema` do repositório `da0602766-byte/V-nkulo` (o commit de
topo, `2d64eab`, foi feito originalmente numa branch derivada,
`perf/auditoria-otimizacao-2026-09`, que já está integrada — sem merge
commit, é sequência direta). O branch está com `origin/main` mesclado.

## Atenção: este branch carrega DUAS entregas empilhadas

Os quatro commits mais antigos à frente de `main` (`e53a8ea`, `bb863d5`,
`19a1c05`, `92bfa6b`) são a preparação de login Google/Drive para
verificação OAuth, **já descrita em `PROMPT_PUBLICACAO_GOOGLE_OAUTH.md`**.
Se você ainda não publicou aquele bloco, siga primeiro as instruções de lá
(inclusive a verificação de integridade de `app/globals.css`) — não estão
repetidas aqui. Este documento cobre **só o commit novo por cima**,
`2d64eab`.

## Sem migração bloqueante — mas tem uma migração nova aditiva

`drizzle/0067_usuario_comunidades_status_idx.sql` cria **só um índice**
(`usuario_comunidades_comunidade_status_idx`, em `comunidade_id, status`).
Não cria tabela, não altera coluna, não apaga nada — `CREATE INDEX IF NOT
EXISTS`, então é seguro reaplicar mesmo que já tenha rodado. Não é
bloqueante (nada quebra sem ela), mas aplique junto para o ganho de
desempenho valer.

Como as anteriores, **não tem entrada em `drizzle/meta/_journal.json`** —
foi escrita à mão, mesmo padrão de sempre. Aliás: ao tentar gerar essa
migração com `npm run db:generate`, descobri que os snapshots internos do
drizzle-kit estão parados na migração `0048` — o comando tentou recriar
~10 tabelas que já existem. Não mexi nisso (é só ferramenta de
desenvolvimento, não afeta o app publicado), mas registre que `db:generate`
está quebrado até alguém reconciliar os snapshots.

## O que publicar (só o commit `2d64eab`)

```
git log --oneline --reverse 4cb6cd8..2d64eab
git diff --shortstat 4cb6cd8...2d64eab
```

Na última medição: 9 arquivos, 94 linhas somadas e 4.212 removidas (o
grosso da remoção é um componente morto apagado, não uma regressão).

| O que entra | Onde |
| --- | --- |
| Editor Visual (~1700 linhas) sai do bundle inicial da Landing Page, painel e Área do Proprietário — passa a carregar sob demanda via `next/dynamic` | `app/components/GlobalVisualEditorLazy.tsx` (novo), `PublicHeader.tsx`, `PilotDashboard.tsx`, `OwnerWorkspace.tsx` |
| Índice novo em `usuario_comunidades(comunidade_id, status)` — a tabela só tinha índice único por `(usuario_id, comunidade_id)`, que não serve para o filtro por comunidade usado em quase toda consulta multi-tenant | `db/schema.ts`, `drizzle/0067_usuario_comunidades_status_idx.sql` |
| API de Pessoas ganha trava de segurança (`LIMIT 2000` + flag `peopleTruncated`) — comportamento idêntico hoje, nunca mais devolve lista sem limite algum | `app/api/pilot/pessoas/route.ts` |
| Criação de escala: validação "voluntário pertence ao ministério"/"pertence à equipe" virou consulta em lote (`IN (...)`) em vez de 1-2 consultas por integrante escalado | `app/api/pilot/escalas/route.ts` |
| Componente legado sem nenhuma referência no projeto, removido | `app/components/AdoteDashboard.tsx` (apagado) |

## O que NÃO foi feito de propósito (fica para depois, se quiser)

- Capacidade e conflito de horário na criação de escala continuam
  validados por integrante (não em lote): dependem de agregados por
  pessoa e de `hasScheduleConflict`, helper compartilhado com edição de
  escala, substituição e acesso temporário — mexer ali era risco maior
  que o ganho.
- API de Pessoas continua devolvendo a lista inteira (até o limite de
  2000); paginação real no servidor mudaria a busca instantânea que hoje
  roda no navegador — decisão de produto, não foi autorizada nesta
  rodada.
- Reconciliar os snapshots do `drizzle-kit` (citado acima).
- Outros três componentes sem uso (`PortalModules.tsx`,
  `MinistryModules.tsx`, `ChurchServicesModule.tsx`) que ficaram órfãos
  depois da remoção do `AdoteDashboard.tsx` — só esse foi removido, por
  decisão explícita do Douglas.

## Validação já executada

- `npm run lint` → 0 erros (44 avisos pré-existentes de `<img>`; dois
  avisos a menos que antes, porque estavam só no arquivo removido)
- `npx tsc --noEmit` → 0 erros
- `npm run build` (vinext build + validação do artefato) → aprovado
- `node --test tests/*.test.mjs` → **281/281** aprovados, sem adaptação
- Build confirma o corte real: `GlobalVisualEditor` sai como chunk
  separado (~27,6 KB minificados) em vez de embutido nos bundles de
  `PublicHeader`/`PilotDashboard`/`OwnerWorkspace`

## O que conferir depois de publicar

1. Abrir `/` (Landing Page) deslogado → inspecionar rede/bundle → o chunk
   do Editor Visual não deve carregar até alguém abrir a ferramenta
   (ela só aparece pra `system_owner`, então visitante comum nunca a
   vê nem baixa o JS dela).
2. Abrir `/painel` e `/proprietario` normalmente → nada de visual muda;
   o editor continua funcionando igual para quem tem permissão.
3. Abrir Pessoas numa comunidade qualquer → lista carrega igual a antes.
4. Criar uma escala com equipe e mais de um integrante → validação de
   equipe/ministério continua bloqueando integrante errado com a mesma
   mensagem de erro de antes.

## Aviso de segurança — repita a verificação de integridade

Mesma recomendação de sempre, porque já aconteceu antes com arquivos
grandes chegando truncados na publicação:

```
wc -c app/globals.css app/api/pilot/escalas/route.ts
head -c 100 app/globals.css
tail -c 100 app/globals.css
```

Se algum desses arquivos aparecer muito menor do que o esperado ou com
bytes não-texto, pare e refaça a transmissão em vez de aplicar.
