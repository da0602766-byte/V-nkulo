# Prompt de publicação — para o Codex/ChatGPT

Copie daqui para baixo.

---

Você vai publicar as **Ferramentas de Relacionamento e os Refinamentos de
Agenda**, que estão prontas no branch `feat/layout-e-tema` do repositório
`da0602766-byte/V-nkulo`. O branch já está com `origin/main` mesclado (até
`3319696`, "docs: registrar publicacao da versao 198") — não há conflitos
pendentes e a suíte de testes existente não precisou de nenhuma adaptação
para isso entrar.

## Antes de tudo: cinco migrações novas

**Aplique estas cinco migrações no banco de produção antes de subir o
código, nesta ordem:**

```
drizzle/0062_contact_logging.sql
drizzle/0063_visita_tracking.sql
drizzle/0064_escala_respostas.sql
drizzle/0065_indisponibilidade.sql
drizzle/0066_metas_objetivos.sql
```

Elas nasceram como `0059` a `0063`, mas colidiam em número com migrações
que você já tinha publicado nesse intervalo (`0059_publication_governance`,
`0060_fio_registros`, `0060_google_drive_privacy`,
`0061_google_android_handoff`). Foram renumeradas para `0062-0066` seguindo
a mesma convenção que você usou para o fio (renumerar quem chega depois).
Sem isso aplicado, os endpoints de contato, visita, confirmação de escala,
indisponibilidade e metas respondem 500 ao gravar — a leitura funciona
normalmente, porque cai no fallback de lista vazia.

Todas as cinco criam tabela nova e índice, nenhuma altera ou remove algo
existente — são reversíveis por `DROP TABLE`:

| Migração | Tabela | Índices |
| --- | --- | --- |
| `0062` | `visitor_contacts` | `(comunidade_id, visitante_id, criado_em)`, `(responsavel_id, criado_em)` |
| `0063` | `visitor_visits` | `(comunidade_id, visitante_id, data_visita)`, `(responsavel_id, data_visita)`, `(data_visita, comunidade_id)` |
| `0064` | `escala_respostas` | único `(escala_designacao_id, usuario_id)`, `(comunidade_id, confirmado_em)` |
| `0065` | `indisponibilidades` | `(comunidade_id, usuario_id, data_inicio)`, `(data_inicio, data_fim, comunidade_id)` |
| `0066` | `metas_objetivos` | `(comunidade_id, usuario_id, data_alvo)`, `(status, comunidade_id, data_alvo)` |

Nenhuma delas tem entrada em `drizzle/meta/_journal.json` — foram escritas à
mão, não geradas por `drizzle-kit generate`, mesmo padrão que você já usou
antes. Se o seu processo de deploy depende do journal para decidir o que
aplicar, adicione as cinco entradas lá também antes de rodar; se aplica por
nome de arquivo em ordem, não precisa mexer no journal.

## O que publicar

Tudo o que o branch tem à frente de `main`, a partir do merge:

```
git log --oneline --reverse origin/main..origin/feat/layout-e-tema
git diff --shortstat origin/main...origin/feat/layout-e-tema
```

Na última medição: 6 commits, 12 arquivos, 4.431 linhas somadas e 2.240
removidas (a maior parte das remoções é o merge absorvendo sua reescrita de
`TenantOperations.tsx` — o conteúdo real novo é bem menor). Os 4 primeiros
commits são o trabalho de relacionamento/agenda; o 5º é o merge com o seu
`main`; o 6º é a reconciliação pós-merge.

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `906a886` | 5 ferramentas de Relacionamento: Engagement Score, Régua de Acompanhamento, Cadência de Contato, Load Metrics, Detecção de Conflitos |
| 2 | `0f697aa` | +2 ferramentas: Agrupamento Regional (por célula) e Cadência Avançada (recomendações contextuais) |
| 3 | `706a788` | +2 ferramentas: Registro de Contatos e Rastreamento de Visitas (tabelas novas) |
| 4 | `aa39064` | Refinamentos de Agenda: confirmação de escala (SIM/NÃO/TALVEZ), indisponibilidade (bloqueio de datas), metas & objetivos |
| 5 | `dfe7758` | Merge de `origin/main` — absorve sua Reforma Visual V5, funil de acolhimento, governança editorial, fluxo de aprovação da agenda |
| 6 | `0d7d722` | Reconciliação: reintegra as Ferramentas de Relacionamento no `TenantOperations.tsx` atual, liga Fio↔Agenda por navegação, adapta a Régua para não repetir o Funil |

## Duas decisões de produto que já foram tomadas — não refaça

Ao revisar antes de publicar, achei duas sobreposições reais com o que você
já tinha publicado. Já resolvi as duas; **não é preciso mexer de novo**:

1. **Funil de acolhimento (seu) vs Régua de Acompanhamento (minha)** — os
   dois mostravam os mesmos 4 estágios (Novo/Contatado/Acompanhamento/
   Integrado). Sua versão ficou como está (visão agregada, % por estágio,
   no topo da página). A minha virou um indicador individual — bolinha
   colorida + rótulo + "etapa X/4" — dentro de cada card nas Ferramentas de
   Relacionamento. Não competem mais pelo mesmo espaço visual.

2. **Fio do dia (seu) vs Agenda (minha)** — não uni os modelos de dados
   (`fio_registros` continua separado de `agenda_compromissos`; são
   propósitos diferentes: log cronológico de um dia só vs. calendário
   pessoal com semana/mês). Liguei as duas telas por navegação: o Fio
   ganhou um link "Ver agenda completa →" e a Agenda ganhou "Ver Fio do
   dia →". Se no futuro fizer sentido unificar de verdade, é decisão de
   produto — não técnica — e fica para quando o uso real mostrar qual dos
   dois formatos as comunidades preferem.

## O que conferir depois de publicar

1. Abrir uma comunidade com visitantes cadastrados → aba Visitantes →
   confirmar que o Funil (topo) e as Ferramentas de Relacionamento
   (Engagement Score, Régua, Cadência, Carga, Regional, Conflitos, Contatos,
   Visitas) aparecem sem sobreposição visual.
2. Abrir Fio do dia → clicar em "Ver agenda completa" → deve cair em
   `/painel?view=eventos` com a Agenda visível.
3. Abrir Agenda → clicar em "Ver Fio do dia" → deve cair em
   `/painel?view=fio`.
4. Criar uma escala, designar alguém, chamar
   `POST /api/pilot/agenda-refinamentos` com
   `{"tipo":"ESCALA_RESPOSTA","designacaoId":X,"resposta":"SIM"}` e conferir
   que grava em `escala_respostas` sem 500.
5. Registrar um contato via `POST /api/pilot/relacionamento` com
   `{"tipo":"CONTATO","visitanteId":X,"canal":"WHATSAPP","resultado":"..."}`
   e conferir que `ultimo_contato` do visitante atualiza junto.

## Aviso de segurança — repita a verificação de integridade

Da última vez, `globals.css` e `TenantOperations.tsx` chegaram truncados na
publicação (1,2 MB e binário, respectivamente) e precisaram ser restaurados
depois. Antes de considerar publicado, confira o tamanho e o começo/fim dos
arquivos grandes que este branch tocou:

```
wc -c app/globals.css app/components/TenantOperations.tsx app/components/RelacionamentoTools.tsx
head -c 100 app/globals.css   # deve começar com CSS, não binário
tail -c 100 app/globals.css   # deve terminar com uma regra CSS fechada
```

Se algum desses arquivos aparecer muito menor do que o esperado ou com bytes
não-texto, pare e refaça a transmissão em vez de aplicar.
