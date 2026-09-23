# Migração Supabase — etapa 3: perfis mínimos

Data: 22/09/2026.

## Escopo

A etapa adiciona uma cópia paralela dos perfis de `usuarios` em `public.vinkulo_profiles`. Somente `id`, `nome`, `email`, `ativo` e `criado_em` são lidos do D1 e transmitidos como `legacy_d1_id`, `display_name`, `email`, `active` e `created_at`. Nenhuma senha, sal, sessão, telefone, endereço, foto, observação ou vínculo é lido para a carga. O D1 continua como fonte das operações e da autenticação.

A rota de comparação e sincronização é exclusiva do proprietário global autenticado. Ela exige confirmação e contagem atual; bloqueia perfis extras no destino e revalida depois da escrita. A função SQL é transacional e idempotente, não cria usuários em Supabase Auth, não aceita mais de 1.000 perfis em uma execução, não substitui perfis já vinculados a Auth e registra execução sem dados pessoais no resumo. Dados de perfis nunca são devolvidos ao navegador — apenas contagens.

Esta cópia ainda não melhora a fluidez das telas: leitura e escrita do cadastro continuam no D1. O benefício imediato é preparar o destino com identidade estável e conferência para uma futura migração de vínculos e, depois, de caminhos de leitura específicos.

## Proteção conferida diretamente no Supabase

- `vinkulo_profiles` com RLS ativo.
- RPCs `vinkulo_profile_snapshot` e `vinkulo_sync_profiles` sem `EXECUTE` para `anon` ou `authenticated`; com `EXECUTE` somente para `service_role`.
- Antes da cópia: 0 perfis no Supabase; a prévia protegida encontrou 16 perfis ativos no D1 e 0 no Supabase.

## Validação e publicação

- TypeScript sem erro; build e artefato Sites aprovados.
- Lint: 0 erros, 41 avisos preexistentes de imagens.
- Testes: 399/399, incluindo lista branca de campos, autorização, contagem obsoleta, inatividade, auditoria e segunda execução idempotente.
- Versão 287 publicada em `https://adote-gestao.da0602766.chatgpt.site`, commit `33a34c5d6c3dc4ddc1c09b005b9f6f121a9b3c49`.

## Estado da cópia de produção

Após confirmação expressa do proprietário, os 16 perfis foram copiados. A comparação protegida retornou D1 16, Supabase 16, iguais 16, pendentes 0. Consulta SQL independente confirmou 16 ativos, 0 vinculados a Supabase Auth, 0 vínculos e 1 execução bem-sucedida. O D1, as senhas e as sessões seguem inalterados.
