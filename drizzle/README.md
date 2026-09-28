# Migrações — convenção e estado atual

O ambiente hospedado aplica as migrações presentes nesta pasta (ver
`README.md` na raiz e `docs/guias/GUIA_PASSO_A_PASSO.md`). Antes de adicionar uma
migração nova, leia isto.

## Próximo número livre

`0082_mobile_modules.sql`: grants/recibos de operações móveis e versões de checklists com trigger de UPDATE, inclusive para alterações feitas online. Aditiva, sem backfill de conteúdo pessoal nem reset de filas; bootstrap autenticado em `app/lib/mobile-module-storage.ts` espelha o DDL. Validada em SQLite e D1/Miniflare.

**`0083`**. Use o próximo inteiro disponível a partir daí — não reaproveite
um número já usado, mesmo que o arquivo tenha sido escrito à mão.

`0081_mobile_visitor_outbox.sql` cria concessões restritas de envio e recibos de
idempotência sem copiar contatos. Bootstrap autenticado aplica o mesmo DDL
aditivo em bases antigas. Recibos não expiram automaticamente: removê-los pode
permitir repetição de uma operação antiga. Exclusão da conta/comunidade remove
os respectivos recibos. Tokens brutos nunca são persistidos no servidor.

`0080_platform_reset.sql` cria somente estruturas de controle e arquivo protegido.
Não apaga nem arquiva nenhum dado durante a migração. A reinicialização exige
ação explícita e reautenticação do Proprietário; veja `docs/REINICIAR_PLATAFORMA.md`.

`0079_controlled_onboarding.sql` adiciona identidade CPF por HMAC, solicitações
LOG1, catálogo de planos, links de contratação e assinaturas. Não altera contas
ou vínculos existentes. Seus triggers de cota são parte obrigatória da migração.
Veja `docs/ACESSO_LOG1_PLANOS.md` para implantação, retenção e rollback.

`0078_push_delivery_queue.sql` cria a fila, o controle do consumidor e um trigger
que inclui as entregas na mesma transação de cada nova notificação individual.
Não copia título, mensagem, endpoint ou chaves; não reenvia notificações antigas.
O trigger é parte obrigatória da migração e não é representado pelo Drizzle.

`0077_push_session_privacy.sql` vincula cada assinatura à sessão autenticada,
com exclusão em cascata ao revogar a sessão. Acrescenta um identificador de
vínculo para rejeitar push atrasado após troca de conta e metadados de tentativa
e aceite pelo provedor, sem conteúdo da notificação. Assinaturas antigas só
voltam a enviar após reconciliação autenticada da mesma conta/aparelho.

`0075_notificacoes_push_dispositivos.sql` guarda uma assinatura Web Push por
aparelho autenticado. O endpoint é único, então o mesmo navegador não continua
ligado à conta anterior depois de um novo login. A chave privada VAPID fica
somente nas variáveis seguras do Sites; nunca deve ser registrada nesta pasta.

`0076_feed_reactions.sql` cria as reações persistentes do feed interno. Cada
reação é vinculada à publicação, ao usuário e à comunidade da publicação no
servidor, com unicidade por tipo para impedir duplicação acidental.

`0073_escalas_multiplas_equipes.sql` permite associar várias equipes a uma
escala e guarda a equipe de cada designação. A coluna legada `equipe_id` da
escala é preservada para compatibilidade com registros e integrações antigas.

`0071_celulas_participacao_detalhes.sql` adiciona `rede`, `horario_texto`,
`temas` e `foto_capa` em `celulas`, para a aba Configurações do redesenho de
Gestão/Participação de Células (ver app/components/cells/). A mensagem de
destaque editável pela liderança na Participação **não** usa migração — ela
reaproveita a tabela `configuracoes` (chave `cell_highlight_message:<comunidadeId>`),
o mesmo padrão de `community_theme:<comunidadeId>`.

`0072_fio_ministerio.sql` adiciona `fio_habilitado` e `fio_etapas` em
`ministerios_comunidade` (o modelo do Fio do Ministério) e `fio_etapas` em
`escalas_ministerio` (as etapas daquela escala, com estado). Ver
`app/components/SecretaryMinisterialWorkspace.tsx`.

`0070_chat_system_retention.sql` reconstrói `conversas_privadas` (troca o
ciclo mensal `ciclo_mes` pelo semanal `ciclo_semana` e remove `drive_file_id`
e `storage_provider`, que só existiam para o chat espelhar conteúdo no
Google Drive) e adiciona `entregue_em` em `mensagens_privadas` para o status
de entrega. Ver app/lib/chat-retention.ts.

## Se dois números colidirem

Já aconteceu mais de uma vez (times/agentes diferentes trabalhando em
paralelo escolhem o mesmo número). A convenção adotada, registrada em
`docs/prompts/PROMPT_PUBLICACAO_RELACIONAMENTO_AGENDA.md`:

> **Renumere a migração que chega depois — nunca a que já foi publicada.**
> Se você não sabe qual das duas já foi aplicada em produção, não renomeie
> nenhuma; confirme antes (ver "Duplicatas conhecidas" abaixo).

## Duplicatas conhecidas (históricas — não mexer)

Três pares de arquivos compartilham número. Os dois lados de cada par
parecem já estar aplicados em produção (as duas features de cada par estão
documentadas como publicadas e funcionando — Fio do dia versão 194 em
`docs/coordenacao/COORDENACAO_IA.md`, integração Google Drive V4.9.0 em
`docs/coordenacao/ESTADO_DO_PROJETO.md`, e o par `0069` nas versões 222 e
226/227), então **não renomeie nenhum dos seis** sem confirmar primeiro no
banco de produção (tabela de migrações aplicadas) — renomear um arquivo já
aplicado pode fazer o ambiente hospedado tentar rodá-lo de novo.

| Número | Arquivos | Tabelas afetadas (não se sobrepõem) |
| --- | --- | --- |
| `0053` | `0053_parking_event_link.sql` | `estacionamento_reservas` |
| `0053` | `0053_reforma_fluxos.sql` | `escalas_ministerio`, `eventos_comunidade` |
| `0060` | `0060_fio_registros.sql` | `fio_registros` |
| `0060` | `0060_google_drive_privacy.sql` | `conversas_privadas`, `community_drive_storage`, `google_connections`, `storage_preferences`, `user_drive_storage` |
| `0069` | `0069_usuario_comunidades_status_idx.sql` | `usuario_comunidades` (índice novo) |
| `0069` | `0069_recepcao_avisos_biblioteca.sql` | `avisos_promocao` e tabelas relacionadas à recepção/biblioteca |

A dupla `0069` foi encontrada em auditoria de 08/09/2026 (commits `7082fb7`,
2026-09-06, e `32a76a2`, 2026-09-07). Ambos os arquivos usam
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` sobre objetos
que não se sobrepõem, então rodar os dois sob o mesmo número não arrisca
dado nenhum — é só inconsistência de numeração.

**Os dois lados já estão aplicados em produção**, pelo que está registrado
em `docs/coordenacao/COORDENACAO_IA.md`: o índice saiu na versão 222 do
Sites e a recepção/biblioteca na 226/227, com a observação explícita de que
a "migração 0069 foi aplicada antes do código". Ou seja, este par entra na
mesma categoria dos pares `0053` e `0060`: **não renomeie nenhum dos dois**,
porque renomear um arquivo já aplicado pode fazer o ambiente hospedado
tentar rodá-lo de novo. O próximo número livre para trabalho novo continua
sendo `0070`.

## Sobre `drizzle/meta/` (journal e snapshots)

`meta/_journal.json` lista as migrações `0000`–`0050` e `0062`–`0067`, mas
`meta/*_snapshot.json` só existe até `0048`. Auditoria de 08/09/2026
conferiu exatamente quais arquivos `.sql` ficaram de fora do journal desde
então (nenhum tem entrada nem snapshot):
`0051_parking_reservations_and_reports`, `0052_parking_vehicle_details`,
`0053_parking_event_link`, `0053_reforma_fluxos`,
`0054_member_registration_links`, `0055_member_link_auto_delete`,
`0056_request_repository_workflows`, `0057_platform_feedback`,
`0058_agenda_pessoal`, `0059_publication_governance`,
`0060_fio_registros`, `0060_google_drive_privacy`,
`0061_google_android_handoff`, `0068_owner_laboratory`,
`0069_recepcao_avisos_biblioteca`, `0069_usuario_comunidades_status_idx`.
Isso confirma que a maioria das migrações escritas à mão desde `0048` não
entra no journal de propósito, mesmo padrão usado em publicações
anteriores. Na prática isso significa:

- **Não rode `npm run db:generate` (drizzle-kit generate) sem revisar o
  resultado com cuidado.** Ele vai comparar `db/schema.ts` contra o
  snapshot desatualizado (`0048`) e pode gerar uma migração incorreta ou
  duplicar algo que já existe em `0049`–`0069`.
- Continue escrevendo migrações `.sql` à mão e numerando manualmente
  seguindo a convenção acima, até que alguém decida reconciliar o
  journal/snapshots com o estado real do schema.

### Como reconciliar com segurança (procedimento verificado, ainda não aplicado)

Confirmei em 08/09/2026 que dá para gerar, sem tocar nesta pasta nem no
banco, um snapshot fiel ao `db/schema.ts` atual (92 tabelas reconhecidas,
0 erros) apontando o `drizzle-kit generate` para uma pasta descartável:

```bash
drizzle-kit generate --schema=./db/schema.ts --out=/tmp/drizzle-baseline \
  --dialect=sqlite --name=baseline_reconciliation
```

Isso produz `/tmp/drizzle-baseline/meta/0000_snapshot.json` (o estado real
do schema, derivado pela própria ferramenta, não digitado à mão) e um
`0000_baseline_reconciliation.sql` com os `CREATE TABLE` completos — **esse
`.sql` nunca deve ser copiado para `drizzle/` nem executado**, porque as
tabelas já existem em produção; ele serve só de conferência.

Para reconciliar de verdade, alguém com acesso ao D1 de produção precisa:

1. Confirmar na tabela de migrações aplicada do D1 que tudo até `0069`
   (as duas variantes) já rodou.
2. Copiar `meta/0000_snapshot.json` gerado acima para
   `drizzle/meta/0070_snapshot.json` neste repositório.
3. Adicionar a entrada correspondente em `drizzle/meta/_journal.json`
   (`idx: 70`, `tag: "0070_baseline_reconciliation"`).
4. Criar `drizzle/0070_baseline_reconciliation.sql` **vazio** (só um
   comentário explicando que é um marcador de reconciliação, sem DDL) —
   assim o ambiente hospedado pode marcá-lo como aplicado sem recriar
   nada, e a partir daí `drizzle-kit generate` volta a comparar contra o
   estado real.

Não apliquei os passos 2–4 nesta auditoria porque exigem confirmação no
banco de produção, que este ambiente de trabalho não acessa — ver
"Bloqueios" em `docs/coordenacao/COORDENACAO_IA.md`.
