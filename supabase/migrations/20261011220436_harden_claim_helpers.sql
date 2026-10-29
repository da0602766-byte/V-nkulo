-- These helpers only inspect the caller's JWT; neither needs elevated privileges.
-- Keep their results and grants compatible with existing/future RLS policies.
begin;
alter function public.vinkulo_current_tenant_id() security invoker;
alter function public.vinkulo_current_tenant_id() set search_path = pg_catalog, pg_temp;
alter function public.vinkulo_is_system_owner() security invoker;
alter function public.vinkulo_is_system_owner() set search_path = pg_catalog, pg_temp;
notify pgrst, 'reload schema';
commit;
