# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar três entregas independentes, prontas e validadas no branch
`claude/system-update-8pnvqj` do repositório `da0602766-byte/V-nkulo`
(3 commits à frente de `main`, sem PR aberto). Duas são correções de defeito
achadas em QA no navegador; a terceira é uma remoção autorizada
expressamente pelo proprietário.

## Antes de tudo: não há migração, e NÃO PODE haver

**Nenhuma alteração de banco.** Não rode `drizzle-kit generate`, não aplique
nada em `drizzle/` e não mexa no journal.

Isto merece atenção especial nesta rodada: o terceiro commit **remove o
módulo Cultos**, mas as tabelas `culto_rotinas` e `culto_lancamentos`
**continuam de pé, no banco e em `db/schema.ts`, de propósito**. A decisão do
proprietário foi aposentar a funcionalidade, não descartar o histórico já
registrado. `db/schema.ts` e `drizzle/` não aparecem no diff justamente por
isso.

> Se alguma ferramenta sugerir gerar uma migração porque "o schema tem tabelas
> sem uso", **recuse**. Uma migração aqui viraria `DROP TABLE` e apagaria dado
> real do proprietário. Não existe migração correta nesta rodada.

## O que publicar

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `1415def` | Painel de detalhes da célula deixa de ficar translúcido |
| 2 | `40e24cc` | Botão de tema deixa de quebrar a hidratação |
| 3 | `77e6633` | Remoção do módulo legado Cultos |

### 1. Célula — painel de detalhes translúcido (`app/globals.css`)

O diálogo que abre ao tocar numa célula (`.cell-detail-v2.cell-detail-v4`)
herdava `--v2-surface`, que está ligado ao slider "Intensidade do vidro".
Resultado medido no navegador: fundo a **62% de opacidade**, com a lista de
trás vazando através do texto.

É a mesma classe de bug já corrigida no redesenho do Estacionamento
(versão 235, `docs/prompts/PROMPT_PUBLICACAO_GESTAO_ESTACIONAMENTO.md`), e a
correção usa o mesmo padrão já existente no arquivo (`--pilot-surface-opaque`
para o claro explícito, `var(--pilot-bg)` para o escuro, ambos sempre opacos).

**Detalhe que explica por que o bug sobreviveu tanto tempo:** o bloco
`--pilot-surface-opaque` que já existia só valia para
`html[data-pilot-theme="claro"]`, e esse atributo **só existe quando a pessoa
escolhe um tema à mão** — `ThemeControl` faz `removeAttribute` no modo
automático. Ou seja, a correção antiga nunca alcançava quem nunca mexeu no
tema, que é o padrão. Esta rodada estende a cobertura para o automático
(claro e escuro) e para o escuro explícito.

### 2. Tema — botão quebrava a hidratação (`app/components/ThemeControl.tsx`)

No tema automático, `currentThemeIsDark` era chamada **durante a
renderização** e lia `document.documentElement.dataset.theme` e `matchMedia`.
O servidor não tem navegador: caía no `return false` e desenhava o sol. O
script inline do `layout.tsx` já havia marcado `data-theme="dark"` antes da
hidratação, então o cliente desenhava a lua. A árvore divergia, o React
descartava e refazia a renderização, e **em desenvolvimento a sobreposição de
erro cobria a tela inteira**.

`currentThemeIsDark` virou função pura que recebe o valor já resolvido; o
"escuro do sistema" passou a ser estado (`autoIsDark`), acertado no mesmo
efeito com `setTimeout` que o arquivo já usava para o tema salvo, e mantido
pelo ouvinte de `prefers-color-scheme` e por cada troca manual.

> **Armadilha do projeto, já evitada:** a regra de lint própria (`Calling
> setState synchronously within an effect...`) rejeitou exatamente esse tipo
> de correção na rodada de 08/09 (`CommunityHome`,
> `SecretaryMinisterialWorkspace`). Aqui ela não dispara porque as chamadas
> ficam dentro do `setTimeout` e do manipulador do evento, nunca no corpo do
> efeito. Se você mexer neste arquivo, mantenha isso.

### 3. Remoção do módulo Cultos — **decisão expressa do proprietário**

Autorizada por Douglas em 12/09/2026, encerrando a pendência que ele próprio
havia deixado em aberto em 06/09 ("cultos ainda serve"). O que embasou a
decisão, levantado antes de remover:

- as 5 rotas tinham **zero** ocorrências de `comunidade_id` — nenhuma
  filtrava por comunidade, e a única proteção era o interruptor
  `legacyModulesEnabled`;
- `local-auth.ts` rodava `EXISTS(SELECT 1 FROM culto_rotinas ...)` nas **duas**
  consultas de sessão: uma subconsulta por requisição autenticada, no caminho
  mais quente do sistema, só para preencher `culto_registrador`, consumido
  apenas pelo catálogo de permissões legado;
- nenhuma tela chamava as rotas, e todas já respondiam 423 para qualquer
  usuário.

**Removidos:** as 5 rotas de `app/api/cultos/**`, `app/lib/cultos.ts`, as duas
subconsultas, o interruptor `legacyModulesEnabled` (sem nenhum consumidor
depois da remoção) e todo o corpo de `app/lib/access.ts`.

**Preservado:** `app/lib/access.ts` continua existindo com o tipo `AppUser`,
que `local-auth.ts` preenche e `tenant.ts` consome. Deletar o arquivo
quebraria o sistema atual.

Com isso, o sistema de permissão de comunidade única — anterior à reforma
multi-tenant, mapeado em `docs/relatorios/AUDITORIA_ENDPOINTS_LEGADOS_2026-09-08.md`
— **deixa de existir no repositório**. Das 45 rotas originais da auditoria,
estas eram as 5 últimas.

## Travas de teste, e uma que foi conferida na marra

A trava de conteúdo ("o gate precisa continuar existindo dentro de
`requireApiPermission`") virou **trava de ausência**, mesmo padrão já adotado
para `/api/teens` em 08/09. Ela vigia os 6 arquivos removidos e exige que:

- `app/lib/access.ts` não volte a exportar **função nenhuma** (só o tipo);
- o interruptor `legacyModulesEnabled` não reapareça;
- a consulta de sessão não volte a tocar `culto_rotinas`.

O teste de integração que esperava 423 em `/api/cultos` passou a esperar 404.

A trava foi verificada injetando `export function hasPermission()` em
`access.ts`: falhou como esperado e voltou a passar com a violação removida.
No caminho, uma asserção precisou ser ajustada porque comparava o texto do
arquivo e pegava o **próprio comentário de cabeçalho**, que cita os nomes
removidos para explicar a história — passou a olhar o que o arquivo exporta.

## Validação já executada

`scripts/pre-publicacao.sh` completo, aprovado:

```
1. Dependências        presentes
2. TypeScript          limpo
3. Lint                0 errors, 42 warnings
4. Build e artefato    aprovado (Worker ESM e hosting.json presentes)
5. Suíte de testes     354 passaram, 0 falharam — nenhuma falha nova

APROVADO. O candidato está pronto para a publicação no Sites.
```

Os 42 avisos são todos `@next/next/no-img-element`, bloqueados por
infraestrutura (binding do Cloudflare Images), como já registrado em rodadas
anteriores. Conferido também que **nenhuma rota de cultos aparece na listagem
do build**.

As duas correções de defeito foram medidas em navegador real (Chromium +
Playwright, banco local semeado com dados fictícios), não só em teste:

- **Células**, nas 10 combinações de 360/390/412/768/1366px × claro/escuro:
  zero rolagem horizontal em todas; fundo do painel conferido por estilo
  computado, `rgb(251, 249, 255)` no claro e `rgb(11, 13, 16)` no escuro,
  ambos sem canal alfa (antes: 62% de opacidade).
- **Tema**: erros de hidratação de **5 para 0** nas mesmas 10 combinações,
  console sem nenhum erro, e o botão conferido funcionalmente — com o sistema
  no escuro ele exibe "Tema escuro" (o estado corrige depois da montagem, não
  ficou preso no claro) e a alternância muda `data-theme` nos dois sentidos.

## Passos

1. `git fetch origin claude/system-update-8pnvqj`
2. Confira o diff contra `main`:
   ```
   git log --oneline --reverse origin/main..origin/claude/system-update-8pnvqj
   git diff --shortstat origin/main...origin/claude/system-update-8pnvqj
   ```
   3 commits, 14 arquivos, 129 linhas somadas e 990 removidas.
3. **Não aplique migração**, e não gere nenhuma — ver o aviso no topo.
4. Não há PR aberto para este branch — abra um contra `main` se for seu fluxo
   de integração, ou integre direto conforme preferir.
5. Integre em `main` e publique no Sites pelo fluxo do
   `docs/coordenacao/COORDENACAO_IA.md` — credencial temporária por comando,
   nunca gravada em arquivo, log, commit ou URL.
6. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para
   o mesmo commit antes de declarar concluído.
7. Registre a versão publicada nas **três** linhas criadas para esta rodada em
   `docs/coordenacao/COORDENACAO_IA.md` — já estão escritas, só falta a versão
   e o commit do Sites.

## Verificação depois de publicar

**Células** (`Painel → Células`, com um usuário que lidere ou administre
alguma célula):

- Abrir uma célula pelo diretório: o painel de detalhes precisa estar
  **sólido**, sem a lista de fundo aparecendo através do texto. Confira nos
  dois temas, e especialmente **sem escolher tema à mão** (modo automático,
  que é onde o defeito vivia).
- O fundo escurecido *atrás* do painel continua semitransparente — isso é o
  scrim do modal, comportamento correto, não é o defeito.
- As abas do painel (Visão geral, Integrantes, Agenda, Relatório semanal,
  Solicitações) continuam abrindo, e Aprovar/Recusar numa solicitação de
  entrada continua funcionando.

**Tema** (qualquer tela do painel):

- Com o **sistema operacional no modo escuro** e o Vínkulo no tema automático,
  abra o menu da conta: o botão precisa dizer "Tema escuro" e mostrar a lua —
  não o sol. Era exatamente isso que divergia.
- Clicar alterna claro ↔ escuro normalmente, e a escolha sobrevive a recarga.
- Nenhum erro novo no console do navegador ao carregar o painel.

**Cultos** (a remoção):

- Nenhuma tela do sistema deve ter mudado — o módulo já não tinha interface e
  já respondia bloqueado a todos. Se alguma tela mudou, algo saiu errado.
- Login, troca de comunidade e permissões continuam normais (a consulta de
  sessão foi alterada; é o ponto mais sensível desta rodada).
- **Confirme no D1 de produção** que `culto_rotinas` e `culto_lancamentos`
  continuam existindo com suas linhas. Elas não devem ter sido tocadas por
  nada nesta publicação.

## Consequência registrada, sem ação — decisão do proprietário

`app/lib/display-control.ts` (86 linhas, modo de manutenção já morto desde
08/09) ficou **sem nenhum importador**, porque `access.ts` era seu último
consumidor. Não foi removido por não fazer parte do módulo Cultos — mesmo
tratamento dado antes a `/api/pilot/presenca`. A decisão de remover ou manter
é do Douglas; não remova por conta própria nesta publicação.

Segue intocado também o membro `"CULTOS"` do tipo união em
`app/lib/system-notifications.ts`, que já convive com `MODULOS`, `DIACONIA` e
`USUARIOS` de remoções anteriores.

Se algo falhar, os três commits estão isolados por assunto — cada um pode ser
revertido sozinho, com a descrição do que mudou e por quê.
