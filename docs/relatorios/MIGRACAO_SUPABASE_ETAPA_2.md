# Migração Supabase — Etapa 2: catálogo de comunidades

## Escopo

A etapa sincroniza apenas `id` legado, slug, nome, estado, marca de demonstração e data de criação de `comunidades` (D1) para `vinkulo_tenants` (Supabase). Nenhum cadastro de pessoa, vínculo, senha, sessão, arquivo ou conteúdo comunitário faz parte da carga.

O inventário de produção em 22/09/2026 encontrou quatro comunidades: duas ativas reais, uma ativa de demonstração e uma arquivada de demonstração. O estado `ARQUIVADA` foi acrescentado à restrição do banco de destino para preservar o registro como está na origem.

## Execução e proteção

O proprietário confere contagens de origem e destino na aba **Publicação do sistema** e inicia a sincronização manualmente. A rota valida sessão e propriedade, exige a contagem conferida e envia ao Supabase apenas as seis colunas declaradas acima. A função SQL realiza a carga em uma transação, atualiza por ID legado, não remove comunidades e registra a execução em `vinkulo_migration_runs`. Uma segunda execução com a mesma origem não duplica registros.

As funções de leitura e escrita do catálogo têm execução concedida apenas a `service_role`. A chave fica cifrada no D1 e é revelada somente no servidor do Vínkulo. A resposta ao navegador contém contagens e identificador da execução, sem a chave. Há uma auditoria correspondente no D1.

## Validação

TypeScript e build aprovados; lint com zero erros e 41 avisos preexistentes; suíte completa com 398/398 testes. No Supabase, a função de leitura retornou zero comunidades antes da carga. A permissão de execução da função de escrita foi conferida diretamente: `anon=false`, `authenticated=false`, `service_role=true`.

## Resultado em produção

A versão 286 foi publicada em `https://adote-gestao.da0602766.chatgpt.site`. O proprietário executou a sincronização pelo painel em 22/09/2026. Resultado: 4 inseridas, 0 atualizadas e 0 inalteradas. A comparação posterior mostrou D1 4, Supabase 4, iguais 4 e pendentes 0. A auditoria do D1 registrou `INTEGRACAO_SUPABASE_TENANTS_SINCRONIZADOS` com resultado `SUCESSO`.

Uma consulta independente no Supabase confirmou 4 comunidades, sendo 3 ativas, 1 arquivada e 2 de demonstração. `vinkulo_profiles` e `vinkulo_memberships` continuam com zero registros. Há uma execução bem-sucedida de escopo `TENANTS` em `vinkulo_migration_runs`.
