# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a correção da **paginação e busca do painel de Pedidos**,
pronta e validada no branch `claude/pedidos-pagination-incomplete-m73xxd` do
repositório `da0602766-byte/V-nkulo` (4 commits à frente de `main`, sem PR
aberto ainda). Ela fecha um ponto que uma rodada anterior deixou
explicitamente pendente — ver "O que isso fecha" abaixo.

## Antes de tudo: não há migração

**Nenhuma alteração de banco.** Não rode `drizzle-kit generate`, não aplique
nada em `drizzle/` e não mexa no journal. Só há mudança de código e testes.

## O que publicar

`RequestsWorkspace` (tela **Pedidos**) juntava itens de dois lugares — a
Central de repositórios (oração/visita) e a lista geral de solicitações — e
ordenava o resultado no navegador. Isso tinha três limitações reais:

1. **Central sem cursor.** `app/api/pilot/solicitacoes/central/route.ts`
   trazia até 250 itens de oração/visita com `LIMIT` fixo e nenhum jeito de
   pedir o resto: comunidade com mais de 250 pedidos abertos perdia os mais
   antigos da fila para sempre, sem aviso na tela.
2. **Cartões do painel contando só o carregado.** Os quatro números do topo
   (Total em aberto, Urgentes, Visitas pendentes, Atendidos hoje) e os
   números das abas rápidas vinham de `operationalRows.filter(...).length`
   — ou seja, do que já tinha sido baixado, não da fila real.
3. **Busca e abas só no que já foi carregado.** Digitar um nome, trocar de
   aba (Orações, Urgentes, Aguardando retorno…) ou usar os filtros
   avançados (status, responsável, período, sem responsável) filtrava só o
   navegador — uma pessoa procurada além do primeiro lote não aparecia.

### Como cada uma foi resolvida

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `f584783` | Cursor por `(grupo, id)` nos itens de repositório da Central, no mesmo desenho de keyset já usado em `solicitacoes/route.ts` — "Carregar mais orações e visitas" |
| 2 | `45ae226` | `COUNT` agregado incondicional (`loadRepositoryItemsMetrics`/`generalMetrics`) para os quatro cartões — fila inteira, não o lote |
| 3 | `00e4986` | Busca, abas e filtros avançados movidos para o SQL nos dois endpoints (`?operacional=1`), com contagem de aba também incondicional (mesmo padrão de `app/api/pilot/pessoas/route.ts`) |
| 4 | `2db3b76` | Anotação de tipo que o `tsc --noEmit` pegou depois da rodada 3 (nunca rodou sozinho até este ponto) |

Nenhuma regra de autorização mudou: os mesmos filtros de
`solicitante_id`/`solicitacao_destinatarios`/`legacyModulesEnabled` que já
existiam continuam valendo em cada consulta nova.

## O que isso fecha

O prompt anterior (`docs/prompts/PROMPT_PUBLICACAO_OTIMIZACAO_2026-09-08.md`,
publicado como versão 235) registrou isto como decisão do proprietário, não
resolvida naquela rodada:

> **`RequestsWorkspace`** junta duas fontes (repositórios e solicitações
> gerais) e ordena o resultado no cliente. Uma ordenação de duas fontes não
> pode ser paginada paginando só uma delas — sai na ordem errada. Paginação
> real dessa tela depende de unificar as duas no servidor.

Cada fonte agora pagina e filtra por conta própria no servidor
(`app/api/pilot/solicitacoes/central/route.ts` e
`app/api/pilot/solicitacoes/route.ts` com `?operacional=1`); o navegador só
combina e ordena os dois lotes já corretos para exibição — não filtra mais
nada que o servidor não tenha filtrado primeiro.

## Isolamento importante: "Meus pedidos" nunca foi tocado

`?operacional=1` é um modo à parte em `solicitacoes/route.ts`
(`loadOperationalGeneralList`), numa função separada da consulta normal —
de propósito, para um bug na busca do painel de Atendimento nunca vazar
para a lista pessoal do membro. A prova está no teste novo "modo
operacional da lista geral filtra tipo, busca e aba sem afetar Meus
pedidos". De brinde, "Meus pedidos" ganhou seu primeiro botão de "carregar
mais" (o cursor já existia desde a rodada anterior; sem filtro nenhum,
alguém com muitos pedidos nunca via os mais antigos).

## Validação já executada

`scripts/pre-publicacao.sh` completo, aprovado:

```
1. Dependências        presentes
2. TypeScript          limpo
3. Lint                0 errors, 41 warnings
4. Build e artefato    aprovado (Worker ESM e hosting.json presentes)
5. Suíte de testes     345 passaram, 0 falharam — nenhuma falha nova
```

Os 41 avisos são todos `@next/next/no-img-element`, bloqueados por
infraestrutura (binding do Cloudflare Images), como já registrado em
rodadas anteriores.

Cinco testes novos cobrem especificamente esta rodada: paginação por cursor
da Central sob lote pequeno; cartões do painel usando contagem da fila
inteira; busca/aba/status/responsável/período na Central atravessando mais
de um lote; e o isolamento operacional × Meus pedidos citado acima.

## Passos

1. `git fetch origin claude/pedidos-pagination-incomplete-m73xxd`
2. Confira o diff contra `main`:
   ```
   git log --oneline --reverse origin/main..origin/claude/pedidos-pagination-incomplete-m73xxd
   git diff --shortstat origin/main...origin/claude/pedidos-pagination-incomplete-m73xxd
   ```
   4 commits, 6 arquivos, ~1.100 linhas somadas e ~95 removidas.
3. **Não aplique migração.** Esta rodada não tem nenhuma.
4. Não há PR aberto para este branch — abra um contra `main` se for seu
   fluxo de integração, ou integre direto conforme preferir.
5. Integre em `main` e publique no Sites pelo fluxo do
   `docs/coordenacao/COORDENACAO_IA.md` — credencial temporária por comando,
   nunca gravada em arquivo, log, commit ou URL.
6. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para
   o mesmo commit antes de declarar concluído.
7. Registre a versão publicada na linha do Claude em
   `docs/coordenacao/COORDENACAO_IA.md` (ver linha já criada para esta
   tarefa, com Estado "aguardando publicação" — só falta a versão e o
   commit).

## Verificação depois de publicar

Tudo dentro de **Pedidos → Atendimento** (só visível a quem opera pedidos):

- Os quatro cartões do topo (Total em aberto, Urgentes, Visitas pendentes,
  Atendidos hoje) mostram o número real da comunidade, não só o que está na
  tela — teste criando mais pedidos do que um lote (250 na Central, 150 na
  lista geral) e conferindo que o cartão já soma tudo antes de clicar
  "carregar mais".
- Buscar por um nome ou palavra encontra o pedido mesmo que ele esteja além
  do primeiro lote carregado.
- Trocar de aba (Orações, Visitas, Urgentes, Pendentes, Em acompanhamento,
  Aguardando retorno, Já atendidos) filtra a lista de verdade, e o número ao
  lado de cada aba não muda quando se troca de aba nem quando se digita uma
  busca — é a contagem total daquele grupo.
- Os filtros avançados (status, responsável, "recebidos desde", "sem
  responsável") continuam funcionando e alcançam além do lote carregado.
- "Carregar mais orações e visitas" e "Carregar mais pedidos" (dentro do
  Atendimento) continuam trazendo o próximo lote **sob os mesmos
  filtros/busca ativos** — não reiniciam para a lista sem filtro.
- Em **Meu espaço** (visão do membro comum), "Meus pedidos" continua
  mostrando todos os tipos de pedido próprios, oração e visita incluídos,
  independentemente de qualquer filtro usado por um operador no painel de
  Atendimento — os dois nunca compartilham estado.

Se algo dessa lista falhar, o commit correspondente está isolado — cada
bloco de trabalho virou um commit próprio, com a descrição do que mudou e
por quê.
