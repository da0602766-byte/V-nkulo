# Publicação — auditoria e otimização de desempenho

Entrega original preparada no branch `perf/auditoria-otimizacao-2026-09`,
commit `2d64eab`, do repositório `da0602766-byte/V-nkulo`. Na integração com
o repositório do Sites, preserve todas as mudanças posteriores já publicadas.

## Entregas empilhadas

A origem desta entrega também carrega a preparação de login Google/Drive já
descrita em `docs/prompts/PROMPT_PUBLICACAO_GOOGLE_OAUTH.md`. Ela não deve ser duplicada nem
revertida durante a integração.

## Migração aditiva

O índice `usuario_comunidades_comunidade_status_idx`, em
`(comunidade_id, status)`, não altera nem remove dados. Na origem ele recebeu o
número `0067`; na linha atual do Sites, onde `0067` e `0068` já estavam
ocupados, foi renumerado para
`drizzle/0069_usuario_comunidades_status_idx.sql`.

A migração é escrita à mão e não recebe entrada em
`drizzle/meta/_journal.json`, seguindo a convenção registrada em
`drizzle/README.md`. `npm run db:generate` continua fora do fluxo: os snapshots
internos estão parados na migração `0048` e o comando tenta recriar estruturas
que já existem.

## O que entra

| Mudança | Arquivos |
| --- | --- |
| Carregamento sob demanda do Editor Visual | `app/components/GlobalVisualEditorLazy.tsx`, `PublicHeader.tsx`, `PilotDashboard.tsx`, `OwnerWorkspace.tsx` |
| Índice para consultas por comunidade e status | `db/schema.ts`, `drizzle/0069_usuario_comunidades_status_idx.sql` |
| Trava de segurança de 2.000 pessoas e flag `peopleTruncated` | `app/api/pilot/pessoas/route.ts` |
| Validação em lote de voluntários e membros da equipe na criação de escala | `app/api/pilot/escalas/route.ts` |

`app/components/AdoteDashboard.tsx` já havia sido removido na linha publicada
do Sites e não exige nova alteração.

## Limites intencionais

- Capacidade e conflito de horário continuam validados por integrante.
- A API de Pessoas continua entregando a lista para busca instantânea no
  navegador, limitada a 2.000 registros; paginação real é decisão futura de
  produto.
- A reconciliação dos snapshots do drizzle-kit não faz parte desta entrega.

## Validação obrigatória

1. `npx eslint . --ignore-pattern dist --ignore-pattern .next`
2. `npx tsc --noEmit`
3. `npx vinext build` e validação do artefato Sites
4. `node --test tests/*.test.mjs`
5. Confirmar que `GlobalVisualEditorLazy` gera chunk separado.
6. Conferir integridade de `app/globals.css` e
   `app/api/pilot/escalas/route.ts` antes de empacotar.

## Conferência pós-publicação

1. Abrir a Landing Page deslogado: o chunk do editor não deve carregar para
   visitantes comuns.
2. Abrir `/painel` e `/proprietario`: o editor deve continuar disponível para
   quem tem permissão, sem mudança visual.
3. Abrir Pessoas: a lista deve carregar normalmente.
4. Criar escala com equipe e vários integrantes: integrantes fora do
   ministério/equipe devem continuar bloqueados com as mesmas mensagens.
