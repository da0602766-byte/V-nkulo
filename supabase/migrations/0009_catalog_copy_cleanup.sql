-- Remoção explícita das cópias de apoio. A operação não alcança auth.users,
-- arquivos nem dados operacionais que venham a ser migrados em novas tabelas.

begin;

alter table public.vinkulo_migration_runs drop constraint if exists vinkulo_migration_runs_scope_check;
alter table public.vinkulo_migration_runs add constraint vinkulo_migration_runs_scope_check
  check (scope in ('TENANCY_FOUNDATION', 'TENANTS', 'PROFILES', 'MEMBERSHIPS',
    'PROFILE_DETAILS', 'CATALOG_COPIES_CLEAR'));

create or replace function public.vinkulo_catalog_copy_counts()
returns table(tenants bigint, profiles bigint, memberships bigint,
  profile_details bigint, linked_auth bigint)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select
    (select count(*) from public.vinkulo_tenants),
    (select count(*) from public.vinkulo_profiles),
    (select count(*) from public.vinkulo_memberships),
    (select count(*) from public.vinkulo_profile_details),
    (select count(*) from public.vinkulo_profiles where auth_user_id is not null);
$$;

create or replace function public.vinkulo_clear_catalog_copies(
  expected_tenants bigint, expected_profiles bigint,
  expected_memberships bigint, expected_profile_details bigint,
  actor_legacy_d1_id bigint)
returns table(tenants bigint, profiles bigint, memberships bigint, profile_details bigint)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  actual_tenants bigint;
  actual_profiles bigint;
  actual_memberships bigint;
  actual_details bigint;
  actual_linked bigint;
begin
  if actor_legacy_d1_id is null or actor_legacy_d1_id < 1
     or expected_tenants is null or expected_tenants < 0
     or expected_profiles is null or expected_profiles < 0
     or expected_memberships is null or expected_memberships < 0
     or expected_profile_details is null or expected_profile_details < 0 then
    raise exception 'invalid catalog cleanup request';
  end if;

  -- Access exclusive locks hold the four counts stable through TRUNCATE.
  -- RESTRICT refuses cleanup if a future operational table references them.
  lock table public.vinkulo_memberships, public.vinkulo_profile_details,
    public.vinkulo_profiles, public.vinkulo_tenants in access exclusive mode;
  select c.tenants, c.profiles, c.memberships, c.profile_details, c.linked_auth
    into actual_tenants, actual_profiles, actual_memberships, actual_details, actual_linked
    from public.vinkulo_catalog_copy_counts() c;
  if actual_linked > 0 then raise exception 'linked auth profiles require separate migration'; end if;
  if actual_tenants <> expected_tenants or actual_profiles <> expected_profiles
     or actual_memberships <> expected_memberships or actual_details <> expected_profile_details then
    raise exception 'catalog counts changed';
  end if;

  truncate table public.vinkulo_memberships, public.vinkulo_profile_details,
    public.vinkulo_profiles, public.vinkulo_tenants restrict;
  insert into public.vinkulo_migration_runs(scope, status, summary, finished_at, initiated_by_legacy_d1_id)
  values('CATALOG_COPIES_CLEAR', 'SUCCEEDED',
    jsonb_build_object('tenants', actual_tenants, 'profiles', actual_profiles,
      'memberships', actual_memberships, 'profile_details', actual_details),
    now(), actor_legacy_d1_id);
  return query select actual_tenants, actual_profiles, actual_memberships, actual_details;
end;
$$;

revoke all on function public.vinkulo_catalog_copy_counts() from public, anon, authenticated;
revoke all on function public.vinkulo_clear_catalog_copies(bigint, bigint, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.vinkulo_catalog_copy_counts() to service_role;
grant execute on function public.vinkulo_clear_catalog_copies(bigint, bigint, bigint, bigint, bigint)
  to service_role;

notify pgrst, 'reload schema';

commit;
