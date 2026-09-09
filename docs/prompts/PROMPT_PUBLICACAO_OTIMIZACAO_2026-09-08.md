# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a rodada de **otimização, limpeza e correção de defeitos** do
Vínkulo, pronta e validada no branch `claude/project-changes-updates-vsr287` do
repositório `da0602766-byte/V-nkulo`. O pull request está aberto:
**https://github.com/da0602766-byte/V-nkulo/pull/9** (16 commits à frente da
`main`).

## Antes de tudo: não há migração

**Nenhuma alteração de banco.** Não rode `drizzle-kit generate`, não aplique
nada em `drizzle/` e não mexa no journal. Se alguma ferramenta sugerir uma
migração, é engano — pare e confira antes.

Remover rota não apagou dado nenhum: as tabelas e as linhas das rotas legadas
continuam intactas no D1, apenas sem caminho pelo aplicativo.

## O que publicar

Dez das dezessete etapas de um script de otimização interna, mais oito defeitos
que não estavam no script e apareceram ao abrir o código.

### Defeitos corrigidos

O mais grave primeiro:

1. **Mensagens do chat apagadas para sempre.** A migração de conversas para o
   Google Drive lia as 500 mensagens mais antigas e em seguida executava
   `DELETE FROM mensagens_privadas WHERE conversa_id = ?`, apagando a conversa
   inteira. Acima de 500, o que não coube no lote era apagado sem nunca ter
   subido — perda permanente e silenciosa. Agora o laço avança por lotes e cada
   lote só é apagado depois de ter subido.
2. **Dados de menores sem isolamento.** `/api/teens` devolvia nome, data de
   nascimento, nome dos pais e telefone varrendo a tabela `usuarios` inteira da
   plataforma, sem filtro de `comunidade_id`. As rotas foram removidas, e a
   trava em `tests/pilot-security.test.mjs` passou a vigiar a **ausência** dos
   arquivos.
3. **Contador de não lidas mentindo** — contava sobre o lote carregado.
4. **Registros sumindo em silêncio** em Ministérios e Pedidos, acima do teto.
5. **Recurso pronto sem interface** — `/api/pilot/presenca` estava no ar e
   testado, mas nenhuma tela renderizava o painel.
6. **Hidratação quebrando** em Agenda e Ministérios, que calculavam a data
   durante a renderização.
7. **Contraste abaixo do mínimo** em três cores de texto, e um token de cor
   usado em várias regras sem nunca ter sido definido.
8. **Alvo de toque de 9×9px** nos pontos do carrossel de depoimentos.

### Desempenho (medido, com cenário semeado)

| | Antes | Depois |
| --- | --- | --- |
| Central · 400 escalas na comunidade | 150 escalas · 753 designações | 3 · 18 |
| Lista de Pessoas · 500 membros | 501 registros · 161,7 KB | 30 · 9,6 KB |
| Designações de Escalas · 400×5 | 2.000 linhas · 471,0 KB | 750 · 175,9 KB |
| JavaScript da entrada do painel | 498,8 KB | 388,7 KB (−22,1%) |

### Limpeza

52 arquivos e 7.552 linhas removidas — 45 rotas herdadas do sistema de
comunidade única e 16 componentes órfãos, classificados um a um em
`docs/relatorios/AUDITORIA_ENDPOINTS_LEGADOS_2026-09-08.md`.

## O que foi preservado do seu trabalho

- **`/api/cultos*` e `app/lib/cultos.ts` continuam no repositório.** O
  proprietário confirmou que a funcionalidade ainda serve e não há equivalente
  no piloto. Seguem atrás do interruptor de módulos legados, e o teste do gate
  423 em `pilot-integration` aponta para elas — não remova.
- O interruptor `PILOT_CONFIG.legacyModulesEnabled` continua `false`, e a trava
  que exige a checagem dentro de `requireApiPermission` continua valendo.
- `app/lib/access.ts` **não** foi removido: `tenant.ts` e `local-auth.ts` usam
  `import type { AppUser }` dele.
- Nenhuma regra de negócio, permissão ou isolamento entre comunidades mudou.
  Toda otimização preserva exatamente os mesmos dados e permissões.

## Duas regressões que foram encontradas e corrigidas antes da entrega

Vale saber que existiram, porque explicam dois commits do fim:

1. `/api/pilot/escalas` montava um `IN (...)` com um marcador por escala do
   lote. Com o padrão de 150, seriam 152 parâmetros numa consulta só, **acima
   do limite por consulta do D1**. Nenhum teste pegava: o cenário usava lote de
   5, e o SQLite do ambiente de teste aceita muito mais parâmetros que o D1 —
   a falha apareceria só em produção, derrubando a tela de escalas. A busca
   passou a ser fatiada em blocos de 90, com teste de 100 escalas que cruza a
   fronteira.
2. `LeadershipWorkspace` buscava `/api/pilot/pessoas` sem parâmetros. Como essa
   rota passou a responder por lotes, a lista de candidatos a líder ficou
   cortada nos 30 primeiros: quem estivesse fora não podia mais ser promovido.
   A tela passou a percorrer os lotes pelo cursor até o fim.

## Validação já executada

`scripts/pre-publicacao.sh` completo, aprovado:

```
1. Dependências        presentes
2. TypeScript          limpo
3. Lint                0 errors, 41 warnings
4. Build e artefato    aprovado (Worker ESM e hosting.json presentes)
5. Suíte de testes     333 passaram, 0 falharam — nenhuma falha nova
```

Os 41 avisos são todos `@next/next/no-img-element` e continuam bloqueados por
infraestrutura: o vinext roteia imagens locais por `/_vinext/image`, que depende
do binding do Cloudflare Images. Sem esse binding provisionado, migrar troca
`<img>` funcional por imagem quebrada.

## Três coisas que são do proprietário para decidir — não resolva por conta

1. **Botão primário no tema escuro** tem 2,72:1 de contraste (branco sobre
   `--pilot-blue`). Corrigir exige escurecer o azul da marca **ou** inverter o
   texto do botão. É identidade visual.
2. **`RequestsWorkspace`** junta duas fontes (repositórios e solicitações
   gerais) e ordena o resultado no cliente. Uma ordenação de duas fontes não
   pode ser paginada paginando só uma delas — sai na ordem errada. Paginação
   real dessa tela depende de unificar as duas no servidor.
3. **Reconciliação do journal do Drizzle** está documentada e verificada em
   `drizzle/README.md`, mas exige confirmar no D1 de produção o que já rodou.
   Não aplique nesta publicação.

## Passos

1. `git fetch origin claude/project-changes-updates-vsr287`
2. Confira o diff contra `main` e leia
   `docs/relatorios/RELATORIO_PERFORMANCE_2026-09-08.md` — ele traz as medições
   e uma seção explícita do que **não** foi medido.
3. **Não aplique migração.** Esta rodada não tem nenhuma.
4. Integre em `main` pelo PR #9 e publique no Sites pelo fluxo do
   `docs/coordenacao/COORDENACAO_IA.md` — credencial temporária por comando,
   nunca gravada em arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada nas linhas do Claude em
   `docs/coordenacao/COORDENACAO_IA.md` (são várias desta rodada; a versão vai
   em todas).

## Verificação depois de publicar

A única mudança **visível** ao usuário é o painel de presença. O resto é
remoção, paginação e correção interna, coberto pelos testes.

- `/painel?view=inicio` mostra o painel **"Quem está online"** na trilha
  lateral da Central. Clicar numa pessoa abre o perfil; o botão **Mensagem**
  leva ao chat (popover no desktop, aba Mensagens no celular).
- A Central continua mostrando no máximo quatro escalas com participação
  pendente, e só as suas — escala de outra pessoa, já respondida ou encerrada
  não pode aparecer.
- Em **Pessoas**, a busca e as abas Membros/Oficiais funcionam, e o botão
  **"Carregar mais"** traz o lote seguinte. Os contadores do topo descrevem a
  comunidade inteira, não o lote carregado.
- Em **Ministérios** e **Pedidos**, "Carregar mais" aparece quando há mais
  registros do que o lote.
- Um membro comum continua sem enxergar dado de outra comunidade em nenhuma
  tela.
- No tema claro, "Sair da plataforma" e o "Online" do painel de presença estão
  legíveis; no escuro também.

Se algo dessa lista falhar, o commit correspondente está isolado — cada bloco
de trabalho virou um commit próprio, com a descrição do que mudou e por quê.
