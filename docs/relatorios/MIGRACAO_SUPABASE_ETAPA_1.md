# Migração Supabase — Etapa 1: comunidades e isolamento

## Entrega

Foi criada a fundação paralela no Supabase para comunidades, perfis, vínculos e controle de futuras migrações. Ela usa identificadores de legado do D1 apenas como chave de reconciliação e aplica Row Level Security (RLS) desde o início.

O arquivo `supabase/migrations/0001_tenant_foundation.sql` não altera o D1, não move registros existentes e não substitui o login atual. A tabela de comunidades será visível a um usuário autenticado apenas quando a claim `vinkulo_tenant_id` corresponder à comunidade; perfis e vínculos são visíveis somente ao próprio usuário ou ao proprietário do sistema. Não há política de escrita pelo navegador.

## Limites desta etapa

Nenhum nome, e-mail, senha, documento, arquivo, foto, sessão ou histórico foi transferido ao Supabase. A cópia desses dados exige uma etapa separada, com inventário, contagem de origem/destino, execução idempotente, validação por comunidade e autorização explícita do proprietário para transferir dados pessoais.

## Operação

O painel Proprietário > Publicação do sistema passa a verificar as quatro tabelas da fundação por uma rota exclusiva do proprietário. A verificação usa a chave de serviço somente no servidor, não retorna o segredo ao navegador e registra o resultado na auditoria do Vínkulo.

## Aplicação e verificação

Em 21/09/2026, a migração foi aplicada ao projeto Supabase configurado do Vínkulo. A conferência direta no banco confirmou as quatro tabelas (`vinkulo_tenants`, `vinkulo_profiles`, `vinkulo_memberships` e `vinkulo_migration_runs`) e RLS ativo em todas elas. A fundação está pronta para receber uma migração futura, deliberada e auditável; ela permanece vazia nesta etapa.
