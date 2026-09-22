-- Etapa 3: cópia mínima de perfis. Não cria usuários Auth nem recebe credenciais.
-- Somente service_role pode ler a foto da origem ou executar a importação.

create or replace function public.vinkulo_profile_snapshot()
returns table (
  legacy_d1_id bigint,
  display_name text,
  email text,
  active boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select p.legacy_d1_id, p.display_name, p.email, p.active, p.created_at
  from public.vinkulo_profiles p
  order by p.legacy_d1_id;
$$;

create or replace function public.vinkulo_sync_profiles(payload jsonb, actor_legacy_d1_id bigint)
returns table (
  run_id uuid,
  source_count integer,
  inserted_count integer,
  updated_count integer,
  unchanged_count integer
)
language plpgsql security definer set search_path = pg_catalog, public
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
    raise exception 'Lista de perfis invalida ou acima de 1000';
  end if;
  if actor_legacy_d1_id is null or actor_legacy_d1_id <= 0 then
    raise exception 'Responsavel invalido';
  end if;

  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'legacy_d1_id', '') !~ '^[1-9][0-9]*$'
      or char_length(coalesce(item->>'display_name', '')) not between 1 and 180
      or char_length(coalesce(item->>'email', '')) not between 3 and 254
      or coalesce(item->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or jsonb_typeof(item->'active') is distinct from 'boolean'
      or coalesce(item->>'created_at', '') = '' then
      raise exception 'Perfil invalido na origem';
    end if;
    item_id := (item->>'legacy_d1_id')::bigint;
    item_name := item->>'display_name';
    item_email := item->>'email';
    item_active := (item->>'active')::boolean;
    item_created := (item->>'created_at')::timestamptz;
    if item_id = any(seen_ids) or lower(item_email) = any(seen_emails) then
      raise exception 'IDs ou emails duplicados';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    seen_emails := array_append(seen_emails, lower(item_email));
    total := total + 1;

    select * into prior from public.vinkulo_profiles where legacy_d1_id = item_id for update;
    if not found then
      insert into public.vinkulo_profiles (legacy_d1_id, display_name, email, active, created_at)
      values (item_id, item_name, item_email, item_active, item_created);
      added := added + 1;
    elsif prior.auth_user_id is not null then
      raise exception 'Perfil ja vinculado a uma conta Supabase Auth';
    elsif prior.display_name is distinct from item_name
      or prior.email is distinct from item_email
      or prior.active is distinct from item_active
      or prior.created_at is distinct from item_created then
      update public.vinkulo_profiles
      set display_name = item_name, email = item_email, active = item_active,
          created_at = item_created, updated_at = now()
      where legacy_d1_id = item_id;
      changed := changed + 1;
    else
      same := same + 1;
    end if;
  end loop;

  if exists (select 1 from public.vinkulo_profiles where legacy_d1_id is null or legacy_d1_id <> all(seen_ids)) then
    raise exception 'Ha perfis extras no destino';
  end if;

  insert into public.vinkulo_migration_runs
    (scope, status, summary, started_at, finished_at, initiated_by_legacy_d1_id)
  values
    ('PROFILES', 'SUCCEEDED',
     jsonb_build_object('source_count', total, 'inserted', added, 'updated', changed, 'unchanged', same),
     now(), now(), actor_legacy_d1_id)
  returning id into completed_run;

  return query select completed_run, total, added, changed, same;
end;
$$;

revoke all on function public.vinkulo_profile_snapshot() from public, anon, authenticated;
revoke all on function public.vinkulo_sync_profiles(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_profile_snapshot() to service_role;
grant execute on function public.vinkulo_sync_profiles(jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
