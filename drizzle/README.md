# Migrações — convenção e estado atual

O ambiente hospedado aplica as migrações presentes nesta pasta (ver
`README.md` e `GUIA_PASSO_A_PASSO.md` na raiz). Antes de adicionar uma
migração nova, leia isto.

## Próximo número livre

**`0067`**. Use o próximo inteiro disponível a partir daí — não reaproveite
um número já usado, mesmo que o arquivo tenha sido escrito à mão.

## Se dois números colidirem

Já aconteceu mais de uma vez (times/agentes diferentes trabalhando em
paralelo escolhem o mesmo número). A convenção adotada, registrada em
`PROMPT_PUBLICACAO_RELACIONAMENTO_AGENDA.md`:

> **Renumere a migração que chega depois — nunca a que já foi publicada.**
> Se você não sabe qual das duas já foi aplicada em produção, não renomeie
> nenhuma; confirme antes (ver "Duplicatas conhecidas" abaixo).

## Duplicatas conhecidas (históricas — não mexer)

Dois pares de arquivos compartilham número. Os dois lados de cada par
parecem já estar aplicados em produção (as duas features de cada par estão
documentadas como publicadas e funcionando — Fio do dia versão 194 em
`COORDENACAO_IA.md`, integração Google Drive V4.9.0 em
`ESTADO_DO_PROJETO.md`), então **não renomeie nenhum dos quatro** sem
confirmar primeiro no banco de produção (tabela de migrações aplicadas) —
renomear um arquivo já aplicado pode fazer o ambiente hospedado tentar
rodá-lo de novo.

| Número | Arquivos | Tabelas afetadas (não se sobrepõem) |
| --- | --- | --- |
| `0053` | `0053_parking_event_link.sql` | `estacionamento_reservas` |
| `0053` | `0053_reforma_fluxos.sql` | `escalas_ministerio`, `eventos_comunidade` |
| `0060` | `0060_fio_registros.sql` | `fio_registros` |
| `0060` | `0060_google_drive_privacy.sql` | `conversas_privadas`, `community_drive_storage`, `google_connections`, `storage_preferences`, `user_drive_storage` |

## Sobre `drizzle/meta/` (journal e snapshots)

`meta/_journal.json` e os `meta/*_snapshot.json` estão desatualizados desde
a migração `0048` — migrações escritas à mão (a maioria a partir daí) não
entram nele de propósito, mesmo padrão usado em publicações anteriores.
Na prática isso significa:

- **Não rode `npm run db:generate` (drizzle-kit generate) sem revisar o
  resultado com cuidado.** Ele vai comparar `db/schema.ts` contra o
  snapshot desatualizado (`0048`) e pode gerar uma migração incorreta ou
  duplicar algo que já existe em `0049`–`0066`.
- Continue escrevendo migrações `.sql` à mão e numerando manualmente
  seguindo a convenção acima, até que alguém decida reconciliar o
  journal/snapshots com o estado real do schema.
