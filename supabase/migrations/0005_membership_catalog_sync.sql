-- Etapa 4: cópia dos vínculos D1 entre perfis e comunidades já conferidos.
-- REMOVIDO é preservado como estado histórico, sem virar vínculo ativo.

alter table public.vinkulo_memberships drop constraint if exists vinkulo_memberships_status_check;
alter table public.vinkulo_memberships add constraint vinkulo_memberships_status_check
  check (status in ('ATIVO', 'PENDENTE', 'SUSPENSO', 'INATIVO', 'REMOVIDO'));

create or replace function public.vinkulo_membership_snapshot()
returns table (
  legacy_d1_id bigint,
  legacy_user_id bigint,
  legacy_tenant_id bigint,
  role text,
  status text,
  created_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select m.legacy_d1_id, p.legacy_d1_id, t.legacy_d1_id,
         m.role, m.status, m.created_at
  from public.vinkulo_memberships m
  join public.vinkulo_profiles p on p.id = m.profile_id
  join public.vinkulo_tenants t on t.id = m.tenant_id
  order by m.legacy_d1_id;
$$;

create or replace function public.vinkulo_sync_memberships(payload jsonb, actor_legacy_d1_id bigint)
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
  prior public.vinkulo_memberships%rowtype;
  item_id bigint;
  item_user bigint;
  item_tenant bigint;
  item_role text;
  item_status text;
  item_created timestamptz;
  target_profile uuid;
  target_tenant uuid;
  seen_ids bigint[] := array[]::bigint[];
  seen_pairs text[] := array[]::text[];
  total integer := 0;
  added integer := 0;
  changed integer := 0;
  same integer := 0;
  completed_run uuid;
begin
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) > 1000 then
    raise exception 'Lista de vinculos invalida ou acima de 1000';
  end if;
  if actor_legacy_d1_id is null or actor_legacy_d1_id <= 0 then
    raise exception 'Responsavel invalido';
  end if;

  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'legacy_d1_id', '') !~ '^[1-9][0-9]*$'
      or coalesce(item->>'legacy_user_id', '') !~ '^[1-9][0-9]*$'
      or coalesce(item->>'legacy_tenant_id', '') !~ '^[1-9][0-9]*$'
      or char_length(coalesce(item->>'role', '')) not between 1 and 64
      or coalesce(item->>'status', '') not in ('ATIVO', 'PENDENTE', 'SUSPENSO', 'INATIVO', 'REMOVIDO')
      or coalesce(item->>'created_at', '') = '' then
      raise exception 'Vinculo invalido na origem';
    end if;
    item_id := (item->>'legacy_d1_id')::bigint;
    item_user := (item->>'legacy_user_id')::bigint;
    item_tenant := (item->>'legacy_tenant_id')::bigint;
    item_role := item->>'role';
    item_status := item->>'status';
    item_created := (item->>'created_at')::timestamptz;
    if item_id = any(seen_ids) or item_user::text || ':' || item_tenant::text = any(seen_pairs) then
      raise exception 'IDs ou pares de vinculos duplicados';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    seen_pairs := array_append(seen_pairs, item_user::text || ':' || item_tenant::text);
    total := total + 1;

    select id into target_profile from public.vinkulo_profiles where legacy_d1_id = item_user;
    if not found then raise exception 'Perfil do vinculo ausente no destino'; end if;
    select id into target_tenant from public.vinkulo_tenants where legacy_d1_id = item_tenant;
    if not found then raise exception 'Comunidade do vinculo ausente no destino'; end if;

    select * into prior from public.vinkulo_memberships where legacy_d1_id = item_id for update;
    if not found then
      insert into public.vinkulo_memberships (legacy_d1_id, profile_id, tenant_id, role, status, created_at)
      values (item_id, target_profile, target_tenant, item_role, item_status, item_created);
      added := added + 1;
    elsif prior.profile_id is distinct from target_profile
      or prior.tenant_id is distinct from target_tenant
      or prior.role is distinct from item_role
      or prior.status is distinct from item_status
      or prior.created_at is distinct from item_created then
      update public.vinkulo_memberships
      set profile_id = target_profile, tenant_id = target_tenant, role = item_role,
          status = item_status, created_at = item_created, updated_at = now()
      where legacy_d1_id = item_id;
      changed := changed + 1;
    else
      same := same + 1;
    end if;
  end loop;

  if exists (select 1 from public.vinkulo_memberships where legacy_d1_id is null or legacy_d1_id <> all(seen_ids)) then
    raise exception 'Ha vinculos extras no destino';
  end if;

  insert into public.vinkulo_migration_runs
    (scope, status, summary, started_at, finished_at, initiated_by_legacy_d1_id)
  values
    ('MEMBERSHIPS', 'SUCCEEDED',
     jsonb_build_object('source_count', total, 'inserted', added, 'updated', changed, 'unchanged', same),
     now(), now(), actor_legacy_d1_id)
  returning id into completed_run;

  return query select completed_run, total, added, changed, same;
end;
$$;

revoke all on function public.vinkulo_membership_snapshot() from public, anon, authenticated;
revoke all on function public.vinkulo_sync_memberships(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_membership_snapshot() to service_role;
grant execute on function public.vinkulo_sync_memberships(jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
