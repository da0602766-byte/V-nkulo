# Migração Supabase — etapa 4: vínculos entre pessoas e comunidades

Data: 22/09/2026.

## Escopo

A etapa prepara uma cópia paralela de `usuario_comunidades` em `public.vinkulo_memberships`. O payload contém somente o ID do vínculo, os IDs do perfil e da comunidade no D1, papel, estado e data de criação. Ele não contém nomes, e-mails, senhas, sessões nem permissões adicionais. A RPC resolve os IDs de destino para as chaves UUID já criadas nas etapas 2 e 3, sem criar contas Supabase Auth. O D1 continua como fonte de leitura, escrita e autorização.

O estado histórico `REMOVIDO` é preservado, não convertido para `ATIVO`. A importação é transacional, idempotente, limitada a 1.000 registros por execução e bloqueia IDs ou pares duplicados, referências ausentes e vínculos extras no destino. A rota requer o proprietário global autenticado, confirmação com contagem atual e comparação antes/depois. A resposta ao navegador contém somente contagens.

## Validação e publicação

- Prévia de produção: D1 21 vínculos (16 ativos, 5 removidos); Supabase 0; perfis 16/16 e comunidades 4/4 conferidos.
- SQL aplicada no Supabase. RLS ativo em `vinkulo_memberships`; funções `vinkulo_membership_snapshot` e `vinkulo_sync_memberships` executáveis por `service_role`, não por `anon` ou `authenticated`. A restrição de status aceita `REMOVIDO`.
- TypeScript e build aprovados; lint 0 erros/41 avisos preexistentes; 400/400 testes.
- Versão 288 publicada em `https://adote-gestao.da0602766.chatgpt.site`, commit `02ec0315c690dd922b3cf06bf2d4369bb1ed1dfc`.

## Estado da cópia de produção

Aguardando confirmação específica do proprietário para transmitir ao Supabase os vínculos entre pessoas e comunidades, que podem revelar participação religiosa. Até a confirmação, os 21 vínculos permanecem somente no D1.
