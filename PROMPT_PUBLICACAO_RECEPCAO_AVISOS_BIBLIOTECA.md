# Prompt de publicação — recepção nova, avisos e biblioteca do ministério

Copie daqui para baixo.

---

Você vai publicar a **reforma da recepção com avisos de promoção, introdução de
novos membros e biblioteca do ministério agrupada**, pronta e validada no branch
`claude/tender-thompson-t0xiv0` do repositório `da0602766-byte/V-nkulo`.

É **1 commit** (`32a76a2`), 21 arquivos, 2.643 linhas somadas e 191 removidas.
O branch descende de `origin/main` em `7c90e95` e não está atrás dele:

```
git fetch origin claude/tender-thompson-t0xiv0
git log --oneline origin/main..origin/claude/tender-thompson-t0xiv0
git diff --shortstat origin/main...origin/claude/tender-thompson-t0xiv0
```

## Antes de tudo: a migração é obrigatória e vem primeiro

**Aplique `drizzle/0069_recepcao_avisos_biblioteca.sql` no banco de produção
antes de subir o código.** Isto não é opcional: `app/painel/page.tsx` passou a
consultar `avisos_promocao` no carregamento, então, sem a migração, **o painel
inteiro responde erro para todas as pessoas** — não só a funcionalidade nova.
A ordem correta é migração primeiro, código depois; o contrário deixa o painel
fora do ar no intervalo.

A migração é puramente aditiva:

- cria `avisos_promocao` (aviso de promoção por pessoa, com `visto_em`);
- cria `usuario_introducoes` (introdução vista/pulada por pessoa e comunidade);
- cria `ministerio_biblioteca_itens` (o agrupador da biblioteca);
- adiciona a coluna `item_id` em `ministerio_links_reutilizaveis`;
- preenche os itens a partir dos links já salvos, um item por título existente,
  e liga cada link ao seu item. Nada é apagado nem reescrito.

Reverter é `DROP TABLE` nas três tabelas novas; a coluna `item_id` pode ficar,
é ignorada pelo código anterior.

**Sobre o número.** Hoje `main` vai até `0068_owner_laboratory.sql`, então
`0069` está livre. Mas existem branches não publicados com migração de número
já ocupado (`perf/auditoria-otimizacao-2026-09` traz um `0067`, e
`codex/security-privacy-review-20260904` traz um `0068`). Se, na hora de
publicar, o `0069` já tiver sido usado por outro trabalho, **renumere para o
próximo número livre** — o conteúdo do arquivo não depende do número. O arquivo
não foi registrado em `drizzle/meta/_journal.json`, seguindo o mesmo padrão do
`0068` que já está publicado; se o seu fluxo exigir o journal, é aí que entra.

## O que este trabalho entrega

**1. Recepção pública reformulada** (`app/page.tsx`,
`app/components/ReceptionExperience.tsx`, `app/recepcao.css`)

Layout novo em tema escuro, com luz ambiente, linha de energia em SVG e cartões
de vidro, no lugar da landing anterior. Três interações por clique: alternância
"quem participa / quem lidera", jornada em quatro etapas e depoimentos com
paginação. Revelação ao rolar por `IntersectionObserver`.

Detalhe que importa para quem revisar: a classe que esconde os blocos
(`rc-ready`) só é aplicada pelo JavaScript, depois de o observador ser
registrado. Sem JS, ou se o script falhar, a página continua inteira e legível
— nenhum conteúdo fica preso em `opacity: 0`.

Foram preservados de propósito: o `PublicHeader` (busca, conta e barra do editor
visual), o banner da plataforma (`branding.feedBannerUrl`, com a classe
`landing-top-banner` que a hospedagem já estiliza), a seção "Entrada
responsável" e as chaves `data-editor-key` do editor visual.

**2. Aviso de promoção** (`app/lib/recepcao.ts`,
`app/api/pilot/recepcao/route.ts`, `app/components/RecepcaoAvisos.tsx`)

Toda mudança de papel que **sobe** na hierarquia registra um aviso. Ele aparece
uma única vez, no primeiro acesso ao painel depois da promoção, e é marcado como
visto ao fechar. Pontos que gravam o aviso:

- `app/api/pilot/pessoas/route.ts` (PATCH) — papel na comunidade;
- `app/api/pilot/ministerios/route.ts` — responsável de ministério novo;
- `app/api/pilot/ministerios/[id]/route.ts` — troca de responsável, lendo o
  papel anterior antes do upsert.

Rebaixamento e troca lateral não geram aviso, e quem se promove a si mesmo
também não recebe.

**3. Introdução de novos membros**

Mini-tour de três passos, um para a plataforma e outro para a comunidade, com
"Pular introdução" (decisão do dono do produto: pode pular). O estado é gravado
por pessoa e por comunidade, então cada uma aparece uma vez só.

**4. Biblioteca do ministério agrupada**
(`app/components/SecretaryMinisterialWorkspace.tsx`,
`app/api/pilot/ministerios/recursos/route.ts`, `app/secretary.css`)

Os links deixam de ser cartões soltos: cada música ou material vira um item com
vários links dentro. A lista mostra só o nome e os ícones das plataformas lado a
lado, com busca no topo, renomear, excluir o item inteiro e detalhe sob demanda
com as URLs. Ações novas na rota: `RENOMEAR_ITEM_BIBLIOTECA` e
`EXCLUIR_ITEM_BIBLIOTECA`; `SALVAR_LINKS_REUTILIZAVEIS` agora aceita o campo
`item`. O GET passou a devolver `bibliotecaItens`, e `linksReutilizaveis`
continua sendo devolvido como antes.

**5. Checklist de responsabilidades**

Quem já foi escolhido em uma tarefa sai das opções das demais tarefas da mesma
escala. A própria escolha da linha continua visível, para o campo não esvaziar.

## Testes existentes que foram adaptados

Quatro testes fixavam o markup da landing antiga e foram atualizados para os
marcadores da recepção nova, mantendo a intenção de cada asserção:

| Arquivo | Antes | Agora |
| --- | --- | --- |
| `tests/pilot-integration.test.mjs` | `/A plataforma completa/i` no HTML de `/` | `/conectada de verdade/i` |
| `tests/pilot-security.test.mjs` | `/A plataforma completa/i` e `O QUE É CONFERIDO` | `vinkulo-reception` e `O que é conferido` |
| `tests/public-reception-redesign.test.mjs` | `landing-status-badge`, `VISUAL DEMONSTRATIVO` | `rc-kicker`, `rc-stack` (lendo também `ReceptionExperience.tsx`) |
| `tests/image-and-community-profile.test.mjs` | `Salvar para próximas escalas` | `Salvar na biblioteca` |

As asserções sobre `landing-top-banner`, `data-editor-key="landing-page"` e
`data-editor-key="landing-governanca"` **continuam valendo** — o banner, a seção
de governança e as chaves do editor foram mantidos justamente por isso.

## Validação já executada

- `npm test` (que roda o build antes): **297 de 297 testes passando**, com cinco
  novos em `tests/v215-recepcao-avisos-biblioteca.test.mjs` — dois de integração
  de verdade, exercitando a promoção ponta a ponta (PATCH em pessoas → aviso
  pendente → marcar visto → some) e o ciclo da biblioteca (salvar agrupado →
  listar → renomear → excluir em bloco).
- `npm run lint`: 0 erros, 45 avisos (os mesmos `@next/next/no-img-element` de
  sempre).
- `npx tsc --noEmit`: limpo.
- Verificação no navegador com o app rodando: recepção em 1280px e 390px, e os
  dois modais nos temas claro e escuro. Duas correções saíram dessa checagem —
  os modais herdavam tokens do painel e ficavam sem contraste (agora têm par
  fundo/texto próprio), e a linha de energia cruzava o título da seção seguinte
  (agora tem máscara e altura limitada).

## Convivência com os outros branches em aberto

Nada aqui depende deles, mas dois tocam arquivos em comum:

- **`perf/auditoria-otimizacao-2026-09`** altera o `GET` de
  `app/api/pilot/pessoas/route.ts`; este trabalho altera o `PATCH` do mesmo
  arquivo. Se os dois forem integrados, o conflito provável é só no bloco de
  imports do topo — as duas mudanças são independentes e cabem juntas. Esse
  branch também acrescenta dois links ao rodapé da landing antiga
  ("Exclusão de dados" e "Contato"); **os dois já estão no rodapé novo**, então
  nada se perde ao descartar aquele lado do conflito.
- **`claude/tender-curie-maw83d`** mexe em `app/globals.css`, que este trabalho
  não toca. Sem conflito.

## Passos

1. `git fetch origin claude/tender-thompson-t0xiv0`
2. Confira o diff contra `main` e leia
   `drizzle/0069_recepcao_avisos_biblioteca.sql` inteiro antes de aplicar.
3. **Aplique a migração no banco de produção** (renumerando se `0069` já estiver
   ocupado).
4. Integre em `main` e publique pelo fluxo do `COORDENACAO_IA.md` — credencial
   temporária por comando, nunca gravada em arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada na linha correspondente do `COORDENACAO_IA.md`.

## Verificação depois de publicar

- `/` abre a recepção escura, com o cabeçalho público e o banner da plataforma
  no topo, e rola até o rodapé sem nenhum bloco invisível.
- Clicar em "Quem lidera" troca o painel; clicar em "Liderança" na jornada troca
  o texto; clicar nos pontinhos troca o depoimento.
- `/painel` abre normalmente para uma conta comum — se responder erro, a
  migração não foi aplicada.
- Promova alguém em Pessoas e entre com a conta dessa pessoa: o aviso aparece
  uma vez e não volta ao recarregar.
- Numa conta que nunca entrou na comunidade, a introdução aparece e o botão
  "Pular introdução" a encerra de vez.
- Em Ministérios → criar escala → biblioteca: os itens aparecem em linha com os
  ícones das plataformas, a busca filtra, e clicar no ícone joga o link na
  escala em criação.
- No checklist, escolher alguém em uma tarefa faz essa pessoa sumir das opções
  das outras.
