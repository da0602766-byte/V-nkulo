-- Dados cadastrais de usuários, separados da identidade e das credenciais.
-- A tabela não concede leitura direta ao navegador; apenas o serviço pode
-- comparar e gravar os dados durante a migração.

create table if not exists public.vinkulo_profile_details (
  profile_id uuid primary key references public.vinkulo_profiles(id) on delete cascade,
  legacy_d1_id bigint not null unique check (legacy_d1_id > 0),
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  source_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.vinkulo_profile_details enable row level security;
revoke all on public.vinkulo_profile_details from anon, authenticated;

alter table public.vinkulo_migration_runs drop constraint if exists vinkulo_migration_runs_scope_check;
alter table public.vinkulo_migration_runs add constraint vinkulo_migration_runs_scope_check
  check (scope in ('TENANCY_FOUNDATION', 'TENANTS', 'PROFILES', 'MEMBERSHIPS', 'PROFILE_DETAILS'));

create or replace function public.vinkulo_profile_details_snapshot()
returns table(legacy_d1_id bigint, details jsonb, source_updated_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.legacy_d1_id, d.details, d.source_updated_at
  from public.vinkulo_profile_details d order by d.legacy_d1_id;
$$;

create or replace function public.vinkulo_sync_profile_details(payload jsonb, actor_legacy_d1_id bigint)
returns table(run_id uuid, source_count integer, inserted_count integer, updated_count integer, unchanged_count integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  item jsonb;
  item_id bigint;
  profile_uuid uuid;
  prior public.vinkulo_profile_details%rowtype;
  seen_ids bigint[] := '{}';
  item_details jsonb;
  item_updated timestamptz;
  source_total integer;
  inserted_total integer := 0;
  updated_total integer := 0;
  unchanged_total integer := 0;
  run_uuid uuid := gen_random_uuid();
begin
  if actor_legacy_d1_id is null or actor_legacy_d1_id < 1 then
    raise exception 'invalid actor';
  end if;
  if coalesce(jsonb_typeof(payload), '') <> 'array' or jsonb_array_length(payload) > 1000 then
    raise exception 'invalid payload size';
  end if;
  source_total := jsonb_array_length(payload);
  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'details') <> 'object' then
      raise exception 'invalid profile detail';
    end if;
    item_id := (item->>'legacy_d1_id')::bigint;
    item_updated := (item->>'source_updated_at')::timestamptz;
    item_details := item->'details';
    if item_id is null or item_id < 1 or item_id = any(seen_ids)
       or item_updated is null or pg_column_size(item_details) > 32768
       or exists (
         select 1 from jsonb_object_keys(item_details) as field(name)
         where field.name <> all(array[
           'profile_role','permissions','profile_photo','phone','registration_data',
           'birth_date','address','cell','ministry','notes','parent_name',
           'deacon_team_id','theme','church_title'
         ])
       ) then
      raise exception 'invalid profile detail';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    select id into profile_uuid from public.vinkulo_profiles where legacy_d1_id = item_id;
    if profile_uuid is null then raise exception 'profile missing'; end if;
    select * into prior from public.vinkulo_profile_details where legacy_d1_id = item_id for update;
    if prior.profile_id is null then
      insert into public.vinkulo_profile_details(profile_id, legacy_d1_id, details, source_updated_at)
      values(profile_uuid, item_id, item_details, item_updated);
      inserted_total := inserted_total + 1;
    elsif prior.profile_id <> profile_uuid then
      raise exception 'profile mismatch';
    elsif prior.details is distinct from item_details or prior.source_updated_at is distinct from item_updated then
      update public.vinkulo_profile_details
      set details = item_details, source_updated_at = item_updated, updated_at = now()
      where legacy_d1_id = item_id;
      updated_total := updated_total + 1;
    else
      unchanged_total := unchanged_total + 1;
    end if;
  end loop;
  if exists (
    select 1 from public.vinkulo_profile_details
    where legacy_d1_id <> all(seen_ids)
  ) then raise exception 'extra profile details'; end if;
  insert into public.vinkulo_migration_runs(id, scope, status, summary, finished_at, initiated_by_legacy_d1_id)
  values(run_uuid, 'PROFILE_DETAILS', 'SUCCEEDED',
    jsonb_build_object('source_count',source_total,'inserted_count',inserted_total,
      'updated_count',updated_total,'unchanged_count',unchanged_total), now(), actor_legacy_d1_id);
  return query select run_uuid, source_total, inserted_total, updated_total, unchanged_total;
end;
$$;

revoke all on function public.vinkulo_profile_details_snapshot() from public, anon, authenticated;
revoke all on function public.vinkulo_sync_profile_details(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_profile_details_snapshot() to service_role;
grant execute on function public.vinkulo_sync_profile_details(jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
