-- Verificação de estrutura para o painel proprietário.
-- Não lê nem expõe dados das comunidades; retorna somente existência e RLS.
create or replace function public.vinkulo_tenant_foundation_health()
returns table (table_key text, present boolean, rls_enabled boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select * from (values
    ('tenants'::text, to_regclass('public.vinkulo_tenants') is not null, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.vinkulo_tenants')), false)),
    ('profiles'::text, to_regclass('public.vinkulo_profiles') is not null, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.vinkulo_profiles')), false)),
    ('memberships'::text, to_regclass('public.vinkulo_memberships') is not null, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.vinkulo_memberships')), false)),
    ('migrationRuns'::text, to_regclass('public.vinkulo_migration_runs') is not null, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.vinkulo_migration_runs')), false))
  ) as foundation(table_key, present, rls_enabled);
$$;

revoke all on function public.vinkulo_tenant_foundation_health() from public, anon, authenticated;
grant execute on function public.vinkulo_tenant_foundation_health() to service_role;

notify pgrst, 'reload schema';
