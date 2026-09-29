-- Vinculação progressiva de contas Auth após um login CPF válido no Vínkulo.
-- As sessões e a autorização operacional continuam no D1 nesta etapa.

begin;

alter table public.vinkulo_migration_runs drop constraint if exists vinkulo_migration_runs_scope_check;
alter table public.vinkulo_migration_runs add constraint vinkulo_migration_runs_scope_check
  check (scope in ('TENANCY_FOUNDATION', 'TENANTS', 'PROFILES', 'MEMBERSHIPS',
    'PROFILE_DETAILS', 'CATALOG_COPIES_CLEAR', 'AUTH_LINK'));

-- Ainda não há sessão Supabase no aplicativo nem revogação integrada com D1.
-- As cópias de preparação só são acessíveis pelo serviço até o corte completo.
revoke select on public.vinkulo_tenants, public.vinkulo_profiles,
  public.vinkulo_memberships from authenticated;
drop policy if exists vinkulo_tenants_read_isolated on public.vinkulo_tenants;
drop policy if exists vinkulo_profiles_read_self_or_owner on public.vinkulo_profiles;
drop policy if exists vinkulo_memberships_read_self_or_owner on public.vinkulo_memberships;

-- A contagem de segurança inclui contas criadas antes de um vínculo interrompido.
-- O nome da coluna permanece estável para os clientes da migração 0009.
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
    (select count(*) from (
      select p.auth_user_id as id from public.vinkulo_profiles p where p.auth_user_id is not null
      union
      select u.id from auth.users u where u.raw_app_meta_data ? 'vinkulo_legacy_d1_id'
    ) auth_accounts);
$$;

create or replace function public.vinkulo_auth_link_state(legacy_user_id bigint)
returns table(profile_id uuid, profile_email text, linked_user_id uuid,
  candidate_user_id uuid, candidate_email text, candidate_legacy_id text,
  candidate_count bigint)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  profile_record public.vinkulo_profiles%rowtype;
begin
  if legacy_user_id is null or legacy_user_id < 1 then raise exception 'invalid user'; end if;
  select * into profile_record from public.vinkulo_profiles p where p.legacy_d1_id = legacy_user_id;
  if not found then raise exception 'profile missing'; end if;
  return query
    with candidates as (
      select u.id, u.email, u.raw_app_meta_data->>'vinkulo_legacy_d1_id' as legacy_id
      from auth.users u
      where lower(u.email) = lower(profile_record.email)
         or u.raw_app_meta_data->>'vinkulo_legacy_d1_id' = legacy_user_id::text
    )
    select profile_record.id, profile_record.email, profile_record.auth_user_id,
      (select c.id from candidates c order by c.id limit 1),
      (select c.email from candidates c order by c.id limit 1),
      (select c.legacy_id from candidates c order by c.id limit 1),
      (select count(*) from candidates);
end;
$$;

create or replace function public.vinkulo_link_auth_profile(legacy_user_id bigint, new_auth_user_id uuid)
returns table(linked boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  profile_record public.vinkulo_profiles%rowtype;
  auth_record auth.users%rowtype;
begin
  if legacy_user_id is null or legacy_user_id < 1 or new_auth_user_id is null then
    raise exception 'invalid auth link';
  end if;
  select * into profile_record from public.vinkulo_profiles p
    where p.legacy_d1_id = legacy_user_id for update;
  if not found then raise exception 'profile missing'; end if;
  select * into auth_record from auth.users u where u.id = new_auth_user_id;
  if not found or auth_record.email_confirmed_at is null
     or lower(auth_record.email) is distinct from lower(profile_record.email)
     or auth_record.raw_app_meta_data->>'vinkulo_legacy_d1_id' is distinct from legacy_user_id::text then
    raise exception 'auth identity mismatch';
  end if;
  if profile_record.auth_user_id is not null and profile_record.auth_user_id <> new_auth_user_id then
    raise exception 'profile already linked';
  end if;
  if profile_record.auth_user_id is null then
    update public.vinkulo_profiles p set auth_user_id = new_auth_user_id, updated_at = now()
      where p.id = profile_record.id;
    insert into public.vinkulo_migration_runs(scope, status, summary, finished_at, initiated_by_legacy_d1_id)
    values('AUTH_LINK', 'SUCCEEDED', '{}'::jsonb, now(), legacy_user_id);
  end if;
  return query select true;
end;
$$;

-- A conciliação de perfis continua funcionando depois do vínculo Auth.
-- Uma alteração de e-mail precisa aparecer primeiro no próprio Auth.
create or replace function public.vinkulo_sync_profiles(payload jsonb, actor_legacy_d1_id bigint)
returns table(run_id uuid, source_count integer, inserted_count integer, updated_count integer, unchanged_count integer)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  item jsonb;
  prior public.vinkulo_profiles%rowtype;
  item_id bigint;
  item_name text;
  item_email text;
  item_active boolean;
  item_created timestamptz;
  seen_ids bigint[] := array[]::bigint[];
  seen_emails text[] := array[]::text[];
  total integer := 0;
  added integer := 0;
  changed integer := 0;
  same integer := 0;
  completed_run uuid;
begin
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) > 1000 then
    raise exception 'invalid profile list';
  end if;
  if actor_legacy_d1_id is null or actor_legacy_d1_id <= 0 then raise exception 'invalid actor'; end if;

  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'legacy_d1_id', '') !~ '^[1-9][0-9]*$'
      or char_length(coalesce(item->>'display_name', '')) not between 1 and 180
      or char_length(coalesce(item->>'email', '')) not between 3 and 254
      or coalesce(item->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or jsonb_typeof(item->'active') is distinct from 'boolean'
      or coalesce(item->>'created_at', '') = '' then
      raise exception 'invalid source profile';
    end if;
    item_id := (item->>'legacy_d1_id')::bigint;
    item_name := item->>'display_name';
    item_email := item->>'email';
    item_active := (item->>'active')::boolean;
    item_created := (item->>'created_at')::timestamptz;
    if item_id = any(seen_ids) or lower(item_email) = any(seen_emails) then
      raise exception 'duplicate profile identifiers';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    seen_emails := array_append(seen_emails, lower(item_email));
    total := total + 1;

    select * into prior from public.vinkulo_profiles p where p.legacy_d1_id = item_id for update;
    if not found then
      insert into public.vinkulo_profiles (legacy_d1_id, display_name, email, active, created_at)
      values (item_id, item_name, item_email, item_active, item_created);
      added := added + 1;
    else
      if prior.auth_user_id is not null and lower(prior.email) is distinct from lower(item_email)
         and not exists (select 1 from auth.users u where u.id = prior.auth_user_id and lower(u.email) = lower(item_email)) then
        raise exception 'linked auth email mismatch';
      end if;
      if prior.display_name is distinct from item_name
        or prior.email is distinct from item_email
        or prior.active is distinct from item_active
        or prior.created_at is distinct from item_created then
        update public.vinkulo_profiles p
          set display_name = item_name, email = item_email, active = item_active,
              created_at = item_created, updated_at = now()
          where p.legacy_d1_id = item_id;
        changed := changed + 1;
      else
        same := same + 1;
      end if;
    end if;
  end loop;

  if exists (select 1 from public.vinkulo_profiles p
    where p.legacy_d1_id is null or p.legacy_d1_id <> all(seen_ids)) then
    raise exception 'extra destination profiles';
  end if;
  insert into public.vinkulo_migration_runs(scope, status, summary, started_at, finished_at, initiated_by_legacy_d1_id)
  values('PROFILES', 'SUCCEEDED', jsonb_build_object('source_count', total, 'inserted', added,
    'updated', changed, 'unchanged', same), now(), now(), actor_legacy_d1_id)
  returning id into completed_run;
  return query select completed_run, total, added, changed, same;
end;
$$;

-- Após a primeira criação Auth, limpar os catálogos requer uma etapa própria
-- que trate inclusive contas criadas antes de um vínculo interrompido.
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
  lock table public.vinkulo_memberships, public.vinkulo_profile_details,
    public.vinkulo_profiles, public.vinkulo_tenants in access exclusive mode;
  select c.tenants, c.profiles, c.memberships, c.profile_details, c.linked_auth
    into actual_tenants, actual_profiles, actual_memberships, actual_details, actual_linked
    from public.vinkulo_catalog_copy_counts() c;
  if actual_linked > 0 or exists (
    select 1 from auth.users u where u.raw_app_meta_data ? 'vinkulo_legacy_d1_id'
  ) then raise exception 'auth accounts require separate migration'; end if;
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

revoke all on function public.vinkulo_auth_link_state(bigint) from public, anon, authenticated;
revoke all on function public.vinkulo_link_auth_profile(bigint, uuid) from public, anon, authenticated;
revoke all on function public.vinkulo_catalog_copy_counts() from public, anon, authenticated;
revoke all on function public.vinkulo_sync_profiles(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.vinkulo_clear_catalog_copies(bigint, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_auth_link_state(bigint) to service_role;
grant execute on function public.vinkulo_link_auth_profile(bigint, uuid) to service_role;
grant execute on function public.vinkulo_catalog_copy_counts() to service_role;
grant execute on function public.vinkulo_sync_profiles(jsonb, bigint) to service_role;
grant execute on function public.vinkulo_clear_catalog_copies(bigint, bigint, bigint, bigint, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
