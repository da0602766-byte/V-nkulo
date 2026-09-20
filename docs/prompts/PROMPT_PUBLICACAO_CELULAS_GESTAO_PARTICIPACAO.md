# Prompt de publicação — para ChatGPT/Codex

Copie daqui para baixo.

---

Você vai publicar o **redesenho completo da aba "Células" em duas
experiências — Gestão e Participação**, pronto no branch
`claude/dreamy-cerf-b5b9f8` do repositório `da0602766-byte/V-nkulo`
(3 commits, ponta em `71ed244`). Não há pull request aberto ainda — abra
um a partir deste branch, ou integre direto em `main` se for o seu fluxo
de costume.

Uma prévia estática (HTML/CSS/JS reproduzindo fielmente as classes reais,
com dados fictícios) está publicada em
https://claude.ai/code/artifact/57842073-51ef-4ddd-b0f1-bd6088bdcf61 —
útil para ver as duas telas sem subir o ambiente, mas não substitui o QA
visual no app de verdade pedido mais abaixo.

## Antes de tudo: há uma migração, sim

Ao contrário do redesenho anterior (Gestão do estacionamento), este tem
**uma migração nova**: `drizzle/0071_celulas_participacao_detalhes.sql`,
que adiciona em `celulas` as colunas `rede`, `horario_texto`, `temas` e
`foto_capa` (todas com `DEFAULT` — não quebra linhas existentes). Aplique
essa migração no D1 de produção como qualquer outra desta pasta. **Não
rode `drizzle-kit generate`** — `drizzle/README.md` explica por que o
journal está desatualizado desde a migração `0048` e por que migrações
continuam sendo escritas à mão a partir daí; o próximo número livre já
foi atualizado para `0072`.

A caixinha de destaque editável (ver abaixo) **não** usa migração — ela
reaproveita a tabela `configuracoes` (chave/valor) com a chave
`cell_highlight_message:<comunidadeId>`, o mesmo padrão já usado pelo
tema visual da comunidade (`community_theme:<comunidadeId>` em
`app/lib/community-theme-storage.ts`).

## O que publicar

### Duas experiências completas, no espírito do redesenho da Gestão do estacionamento

O componente único de Células dentro de `TenantOperations.tsx` virou um
orquestrador fino, `app/components/CellsWorkspace.tsx`, que escolhe entre
duas telas novas em `app/components/cells/`:

- **`CellManagementConsole`** (Gestão) — grade de células com 6 cartões
  de estatística, busca e filtros de situação/saúde (Frame 1 do design
  aprovado); ao abrir uma célula, ela vira **página cheia** (não um
  modal — o design é explícito sobre isso), com abas Visão geral,
  Integrantes, Agenda, Relatório semanal, Solicitações e a aba nova
  **Configurações** (nome, horário, rede, dias, endereço/descrição
  públicos, temas, foto de capa, observações internas e a área de risco
  para arquivar/reativar) — Frame 2.
- **`CellMemberPortal`** (Participação) — lista de células + painel de
  perfil fixo, estatísticas, filtros por rede/dia/situação e os três
  cartões de rodapé (Frame 3); no celular de verdade a página vira a
  versão compacta de uma coluna (Frame 4); no computador, essa mesma
  versão aparece também como **prévia interativa dentro de uma moldura
  de celular**, abaixo do conteúdo principal — útil para quem lidera
  testar "como o membro vê" sem precisar de outro aparelho.

Acesso à Gestão é decidido em `CellsWorkspace.tsx`: quem tem a permissão
`cells.manage` (pastoral/administração) **ou** lidera/vice-lidera ao
menos uma célula. Todo mundo mais só vê Participação. Quem tem acesso à
Gestão pode alternar para "Ver como participante" e voltar com "← Ver
como gestão".

CSS novo com prefixo `.cgestao-` (Gestão) e `.cpart-` (Participação) em
`app/globals.css`; o CSS antigo `.cell-*-v2/v4/v5` **foi deixado no
arquivo de propósito** (código morto, não usado por nenhum componente
novo) — mesma decisão tomada no redesenho do estacionamento, pelo mesmo
motivo (vasculhar um arquivo de ~34 mil linhas sem ganho funcional).

### A caixinha de destaque — o que o dono da comunidade pode mudar

No canto superior direito da Participação (Frame 3) fica um card com uma
citação — Mateus 18:20 por padrão. Quem tem `cells.manage` vê um lápis
nesse card; clicar abre um formulário (título/referência + texto) que
salva via `PUT /api/pilot/celulas/mensagem` e atualiza a tela sem recarregar.
Todo mundo mais só lê o texto atual.

### O que mudou no backend

1. `GET /api/pilot/celulas` passa a devolver `minha_participacao`
   (`"LEADER" | "VICE_LEADER" | "MEMBER" | null`) em cada célula, **para
   qualquer pessoa autenticada**, calculado a partir do próprio `membros`
   já carregado — sem expor o resto do quadro a quem não opera a célula
   (a lista completa de integrantes continua restrita a quem opera,
   exatamente como antes). É o que a Participação usa para decidir "Já
   participo" / "Aberta" por célula.
2. `PATCH /api/pilot/celulas/[id]` ganha a ação `CONFIGURACOES_ATUALIZAR`,
   restrita a quem já podia editar a célula (`operator`: gestão pastoral,
   líder ou vice-líder) — mesma checagem de permissão que as ações
   existentes.
3. Upload de imagem ganha o propósito `cell-cover` (foto de capa), com a
   mesma política de permissão do banner de ministério: `canManageCell`,
   nova em `app/lib/cell-membership.ts`, verifica se a pessoa gerencia
   células globalmente ou lidera/vice-lidera aquela célula específica.
   Tocou em `app/lib/client-image.ts`, `app/lib/upload-key-policy.mjs` e
   `app/api/pilot/uploads/route.ts` — mesmo padrão dos propósitos
   existentes, nenhum deles teve o comportamento alterado.
4. `GET/PUT /api/pilot/celulas/mensagem` (novo arquivo) — leitura exige
   `cells.view`, escrita exige `cells.manage`.

"Solicitação pendente" na Participação (por pessoa, por célula) é uma
lembrança **só do aparelho** (`localStorage`), não um dado do servidor —
a tabela `celula_solicitacoes` não amarra o pedido a uma conta (ela também
recebe pedidos da página pública, sem login). Isso está documentado em
comentário no topo de `app/components/cells/CellMemberPortal.tsx`; não é
uma lacuna a "corrigir" nesta publicação, é uma decisão consciente dado o
modelo de dados atual.

## O que foi preservado do trabalho anterior

- Nenhum contrato de API existente mudou de comportamento — só ganhou
  campos novos (`minha_participacao`, `rede`/`horario_texto`/`temas`/
  `foto_capa` no retorno) e uma ação nova (`CONFIGURACOES_ATUALIZAR`).
- `app/components/PublicCellRequest.tsx`, `app/comunidades/[slug]/page.tsx`
  e `app/api/public/celulas/[id]/solicitar/route.ts` (a página pública,
  sem login) **não foram tocados** — o pedido descrevia o projeto de
  Gestão/Participação (área logada), não a superfície pública.
- Nenhuma regra de isolamento entre comunidades mudou.
- `VisitorsWorkspace` (que também mora em `TenantOperations.tsx` e usa
  células só para o campo "Célula" do cadastro de visitante) não mudou de
  comportamento — só o tipo local `Cell` ali ficou menor (`{id, nome}`,
  que é tudo que aquele formulário usa).

## Validação já executada (e o que falta rodar aí)

Este ambiente de trabalho não tinha o toolchain `vinext`/`sites-env`
disponível (variáveis de ambiente e cache específicos da hospedagem), então
**não rodei `scripts/pre-publicacao.sh` nem `npm test` com build**. O que
rodei e passou limpo:

```
npm install (dependências já existentes, nenhuma nova)
node_modules/.bin/tsc --noEmit -p tsconfig.json         → 0 erros
node_modules/.bin/eslint <todos os arquivos tocados>    → 0 erros, warnings
                                                            pré-existentes
node --test tests/*.test.mjs (sem build)                → 302 passam, 54
                                                            falham — as
                                                            mesmas 54 que
                                                            falham sem
                                                            build na
                                                            branch-base
                                                            (exigem dist/,
                                                            não são defeito)
```

Antes de publicar, rode `scripts/pre-publicacao.sh` completo (ele faz o
build de verdade e roda a suíte inteira contra o artefato) e confira que
bate com a mesma contagem de `main` mais os testes novos/atualizados
desta rodada:

- `tests/v150-cells-hub.test.mjs` — teste novo cobrindo o orquestrador,
  a mensagem de destaque e `CONFIGURACOES_ATUALIZAR`.
- `tests/v165-reforma-workflows.test.mjs`,
  `tests/v166-browser-feedback.test.mjs`,
  `tests/v190-reforma-visual-v5.test.mjs` — asserções que liam
  literalmente o código antigo de Células dentro de
  `TenantOperations.tsx` foram reapontadas para os arquivos novos em
  `app/components/cells/` (nenhuma foi apagada sem uma verificação
  substituta; ver `git log -p` no commit `c8b23fc` para o antes/depois de
  cada uma).

Depois de escrever este prompt, montei a prévia estática linkada acima
(mesmas classes CSS reais, dados fictícios) e usei Playwright só para
tirar capturas de tela dela — não é QA no app de verdade, mas pegou um
defeito real: `.cpart-badge` sem `flex-shrink:0` deixava a etiqueta
"Solicitação pendente" (a mais longa das três) espremer o nome da célula
na lista compacta de celular (Frame 4). Corrigido no commit `71ed244`
(`app/globals.css`). Ainda vale um passe pelas quatro telas no app de
verdade (Gestão lista, Gestão detalhe, Participação computador,
Participação celular) antes de publicar, do mesmo jeito que foi feito no
redesenho do estacionamento — a prévia estática não roda contra dados ou
permissões reais.

## Passos

1. `git fetch origin claude/dreamy-cerf-b5b9f8`
2. Confira o diff contra `main`
   (`git diff origin/main...claude/dreamy-cerf-b5b9f8`) — 3 commits
   (`c8b23fc` o redesenho, `fe6f4d6` este prompt, `71ed244` a correção do
   badge), 26 arquivos ao todo.
3. **Aplique a migração** `drizzle/0071_celulas_participacao_detalhes.sql`
   no D1 de produção antes ou junto com o deploy do código (colunas com
   `DEFAULT`, então a ordem entre migração e deploy não quebra nada, mas
   confirme no seu processo de costume).
4. Rode `scripts/pre-publicacao.sh` e confira o resultado contra a seção
   anterior.
5. Integre em `main` (PR ou merge direto, como for seu fluxo) e publique
   no Sites pelo processo do `docs/coordenacao/COORDENACAO_IA.md` —
   credencial temporária por comando, nunca gravada em arquivo, log,
   commit ou URL.
6. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam
   para o mesmo commit antes de declarar concluído.
7. Registre a versão publicada nas linhas do Claude em
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- **Menu lateral/inferior**: o item "Células" continua com o mesmo nome e
  URL (`?view=celulas`) — só o conteúdo mudou.
- **Como pastoral/administração** (`cells.manage`): a aba abre em
  Gestão, com a grade de células e o botão "Ver como participante" no
  cabeçalho; clicar numa célula abre a página cheia, não um modal; a aba
  Configurações salva e reflete na Participação e na página pública.
- **Como líder de uma célula específica** (sem `cells.manage` global): a
  aba também abre em Gestão, mas só aquela célula mostra as abas
  completas de operação — abrir outra célula (que não lidera) cai na
  versão restrita ("Informações" / "Próximos encontros" / "Solicitar
  entrada").
- **Como membro sem nenhuma liderança**: a aba abre direto em
  Participação, sem o botão de alternância — o card de destaque aparece
  sem o lápis de edição.
- **Editar a caixinha de destaque**: como `cells.manage`, o lápis no card
  abre o formulário; salvar atualiza o texto para todo mundo (recarregue
  como outro usuário para confirmar).
- **Celular de verdade** (ou DevTools em largura de celular): a
  Participação vira a versão de uma coluna sem a moldura de telefone; a
  prévia de celular só aparece na largura de computador.
- Um membro de outra comunidade continua sem ver células, integrantes ou
  solicitações desta comunidade em nenhuma tela.

Se algo dessa lista falhar, são só três commits (`c8b23fc`, `fe6f4d6`,
`71ed244`) — reverter é simples, mas a lista acima deve dar sinal de qual
parte investigar antes disso.
