# Prompt de publicação — aba Célula em duas telas: gestão e participação

Copie daqui para baixo.

---

Você vai publicar o **redesenho da aba Célula, que passa a ter duas telas — gestão
e participação — escolhidas pelo papel de quem entra somado ao aparelho**, pronto
e validado no branch `claude/redesign-celula-tab-unb06e` do repositório
`da0602766-byte/V-nkulo`.

São **2 commits** — `a5e81bc` (todo o código, 18 arquivos, 3.725 linhas somadas e
2.250 removidas) e o commit desta documentação. O branch descende de
`origin/main` em `0eb5842` e não está atrás dele:

```
git fetch origin claude/redesign-celula-tab-unb06e
git log --oneline origin/main..origin/claude/redesign-celula-tab-unb06e
git diff --shortstat origin/main...origin/claude/redesign-celula-tab-unb06e
```

## Antes de tudo: a migração é obrigatória e vem primeiro

**Aplique `drizzle/0071_celula_perfil_publico.sql` no banco de produção antes de
subir o código.** A rota `app/api/pilot/celulas/route.ts` passou a selecionar as
quatro colunas novas por nome; sem a migração, **a aba Célula inteira responde
erro** para todo mundo que a enxerga — não só a parte nova.

A migração é puramente aditiva, quatro colunas em `celulas`, todas com valor
padrão para que as células existentes continuem válidas sem backfill:

- `horario_reuniao` — hora de início anunciada ("19h30"). Só os dias existiam;
- `rede` — agrupamento pastoral das células (Rede Centro, Rede Sul). **Não** tem
  relação com o módulo Redes do sistema, que agrupa igrejas;
- `tags` — temas da célula, em JSON, como `dias_reuniao` e `membros` já são;
- `capa_url` — imagem de capa do perfil público, equivalente ao `banner_url`
  dos ministérios.

Reverter é `ALTER TABLE celulas DROP COLUMN` nas quatro; o código anterior as
ignora. Célula sem horário, rede, tema ou capa simplesmente não mostra esses
trechos no perfil.

**Sobre o número.** `main` vai até `0070_chat_system_retention.sql`, então `0071`
está livre e é o número que `drizzle/README.md` aponta como próximo. Se outro
trabalho tomar o `0071` antes, **renumere para o próximo livre** — o conteúdo do
arquivo não depende do número. Não foi registrado em `drizzle/meta/_journal.json`,
seguindo o padrão dos `0068`, `0069` e `0070` já publicados.

## O que este trabalho entrega

**1. Duas telas no mesmo módulo** (`app/components/TenantOperations.tsx`)

A escolha é do papel somado ao aparelho, e está numa linha só:

```
const canUseManagement = canManage || cells.some((cell) => cell.can_operate);
const activeMode = mode ?? (isMobile || !canUseManagement ? "membro" : "gestao");
```

- quem administra (`cells.manage`) ou lidera alguma célula abre em **gestão** no
  computador e em **participação** no celular;
- quem só enxerga a aba (`cells.view` sem liderar nada) abre sempre em
  participação, e não recebe o botão de troca — abriria um painel vazio;
- os dois lados têm botão de troca manual ("Ver como participante" e "Abrir
  gestão das células"), então o computador dá acesso às duas.

O corte de aparelho é `matchMedia("(max-width: 820px)")` ouvido em efeito, com
`isMobile` começando em `false` — a primeira renderização do servidor e a do
cliente são iguais, e a troca acontece depois de montar.

**2. Gestão** (mesmo arquivo, `app/globals.css`)

Catálogo em grade no padrão da aba Ministérios, no lugar da lista lateral
estreita com modal. Resumo em seis cartões: total de células, ativas, pendentes
(soma das solicitações de entrada aguardando decisão, que não existia como número
agregado), sem relatório, pessoas nas células e prontas para multiplicar. Cada
cartão da grade traz selo de saúde, mini-gráfico das oito últimas semanas de
relatório, dias e horário, pessoas, liderança e um contador de pedidos pendentes.

Abrir uma célula deixou de ser modal e virou **página cheia com "voltar"**, com as
abas de integrantes, agenda, relatório semanal, solicitações e a nova
**Configurações** — onde nome, dias, horário, rede, endereço, temas, descrição,
observações internas e capa são editados. Antes só dava para arquivar.

**3. Participação** (`app/components/CellsMemberBoard.tsx`)

Diretório com busca (nome, bairro, líder, rede, tema) e filtros de rede, dia e
situação (minha célula / com solicitação minha / abertas). Perfil com capa,
selo de situação, líder, encontro, local, pessoas, descrição, temas, próximo
encontro vindo da agenda real e, na própria célula, quem caminha junto. Ações:
solicitar entrada (com consentimento explícito), desistir do próprio pedido e
falar com o líder — este último dispara o evento `vinkulo:open-chat` que o painel
já escuta, sem rota nova.

Embaixo: minhas solicitações, próximos encontros e "como funciona".

**4. O essencial da liderança no celular**

No celular, no fim do perfil da própria célula, quem lidera recebe um bloco com
duas coisas: **relatório do encontro** e **pedidos para entrar** (aprovar e
recusar). Nada além disso — o rodapé do bloco diz em texto que integrantes,
agenda e configurações ficam no computador. Foi decisão do dono do produto.

**5. Rota de listagem devolve o contexto de quem pergunta**
(`app/api/pilot/celulas/route.ts`)

Cada célula passou a vir com `sou_membro` e `minha_solicitacao`. São dados que já
pertencem a quem pede: se a pessoa é integrante daquela célula e se o pedido dela
continua na fila. Na própria célula, quem é integrante passa a ver os outros
integrantes — **nome e função apenas**; e-mail e telefone seguem restritos a quem
lidera. Para quem não é integrante nem lidera, `membros` continua vazio.

**6. Desistir do próprio pedido**
(`app/api/public/celulas/[id]/solicitar/route.ts`)

`DELETE` novo: apaga somente pedido `PENDENTE` e somente o da sessão que chama,
identificado por `usuario_id`. Pedido anônimo não pode ser reivindicado depois.
Aprovar e recusar continuam sendo da liderança — desistir não é decidir.

**7. Capa da célula** (`app/api/pilot/uploads/route.ts`, `app/lib/cell-access.ts`,
`app/lib/upload-key-policy.mjs`)

Destino de envio novo `cell-cover`, autorizado por `canOperateCell` — a mesma
régua do `PATCH` da célula (líder, vice ou `cells.manage`), isolada em lib porque
o envio acontece em outra rota. A chave carrega o id da célula
(`images/cell-cover/cell-<id>/<uuid>.<ext>`) e `parseCellCoverUrl` só aceita
imagem vinda do próprio envio ou do armazenamento conectado — a capa não é campo
livre para apontar endereço externo no perfil público.

**Atenção operacional:** este destino segue o mesmo caminho do banner de
ministério, que passa pelo Google Drive da comunidade. Onde o Drive não estiver
conectado, o envio recusa com a mesma mensagem que os ministérios já dão hoje.
Nada quebra — a célula fica sem capa e o perfil usa o degradê padrão.

## Um bug antigo corrigido de passagem

A consulta de solicitações da rota de listagem não trazia `usuario_id` no
`SELECT`. Nada dependia disso antes; ao ligar `minha_solicitacao`, o campo nunca
casava. O teste de integração novo pegou isso antes da entrega. Uma coluna a mais
no `SELECT`, sem mudança de filtro nem de autorização.

## Decisão pendente que NÃO faz parte desta entrega

O papel `MEMBRO` **não tem `cells.view`** em `app/lib/tenant-policy.mjs`. Quem
alcança a aba Célula hoje é `LIDER`, `PASTOR`, `ADMIN_COMUNIDADE` e `SUPERADMIN`.
Na prática, a tela de participação atende `LIDER` que não lidera célula nenhuma —
e **não** o membro comum, que sequer vê a aba.

Dar `cells.view` a `MEMBRO` é uma linha, mas muda quem enxerga o diretório de
células em toda a plataforma e por isso **não foi feito aqui**. Fica registrado
para decisão do dono do produto; se for aprovado, é acrescentar `"cells.view"` à
lista de `MEMBRO` e o restante já funciona.

## Testes existentes que foram adaptados

Dois testes fixavam o markup que o redesenho substituiu. Foram atualizados para
os marcadores novos, preservando a intenção de cada asserção:

| Arquivo | Antes | Agora |
| --- | --- | --- |
| `tests/v150-cells-hub.test.mjs` | `cell-shell-v2` (lista lateral + modal) | `cell-catalog-grid-v6` e `CellsMemberBoard` |
| `tests/v166-browser-feedback.test.mjs` | `cell-detail-overlay-v2` bloqueando a página | `cell-detail-page-v6` mais a ficha do celular (`cell-member-sheet-v7`) fixa e com rolagem própria |

O segundo mudou de nome ("event actions block the page and the cell sheet scrolls
on its own") porque o detalhe da célula deixou de ser modal de propósito: no
computador não há mais nada por cima para bloquear. As asserções sobre o overlay
dos eventos e sobre `.cell-detail-content-v4` continuam valendo.

## Validação já executada

- `npm test` (roda o build antes): **357 de 357 testes passando** — eram 354, com
  os 2 acima falhando. Três novos em
  `tests/v239-celula-gestao-participante.test.mjs`, sendo **um de integração de
  verdade** contra o worker e o D1 local: pedido de entrada aparece só para quem
  o enviou, terceiro não vê nem cancela (404, e o pedido continua no banco), e o
  autor cancela o próprio. Os outros dois cobrem a chave de envio da capa
  (execução real de `upload-key-policy.mjs`, inclusive recusando travessia de
  caminho) e o contrato das duas telas.
- `npm run lint`: **0 erros**, 43 avisos (os mesmos `@next/next/no-img-element` de
  sempre).
- `npx tsc --noEmit`: limpo.
- Prévia visual das duas telas nos dois aparelhos, aprovada pelo dono do produto
  antes da entrega.

## Passos

1. `git fetch origin claude/redesign-celula-tab-unb06e`
2. Confira o diff contra `main` e leia
   `drizzle/0071_celula_perfil_publico.sql` inteiro antes de aplicar.
3. **Aplique a migração no banco de produção** (renumerando se `0071` já estiver
   ocupado).
4. Integre em `main` e publique pelo fluxo do `docs/coordenacao/COORDENACAO_IA.md`
   — credencial temporária por comando, nunca gravada em arquivo, log, commit ou
   URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada na linha correspondente do
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- Entre como pastor no computador: a aba Célula abre em gestão, com os seis
  cartões de resumo e o catálogo em grade. Se responder erro, a migração não foi
  aplicada.
- Abra uma célula: vira página cheia, com "Voltar às células" no topo. Em
  Configurações, salve horário, rede e temas e confirme que voltam preenchidos.
- Clique em "Ver como participante": diretório com filtros de rede e dia
  funcionando, perfil da célula com os temas e o horário que você acabou de
  salvar.
- Entre com uma conta `LIDER` que não lidera célula nenhuma: abre direto na tela
  de participação e **não** aparece botão de gestão.
- Nessa conta, peça entrada numa célula: o cartão "Minhas solicitações" passa a
  contar 1 e a célula fica com selo "Solicitação pendente". Cancele: volta a
  "Aberta". Confirme que outra conta não vê esse pedido.
- Aprove um pedido pela conta que lidera a célula e confirme que ele sai da fila.
- No celular, com a conta que lidera: a aba abre na tela de participação; abrindo
  a própria célula, o fim do perfil traz relatório do encontro e os pedidos para
  entrar — e nada de integrantes, agenda ou configurações.
