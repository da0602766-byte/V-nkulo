-- Etapa 2: catálogo mínimo de comunidades, com importação atômica e idempotente.
-- A função é acessível apenas pela chave de serviço no servidor do Vínkulo.

alter table public.vinkulo_tenants drop constraint if exists vinkulo_tenants_status_check;
alter table public.vinkulo_tenants add constraint vinkulo_tenants_status_check
  check (status in ('ATIVA', 'INATIVA', 'SUSPENSA', 'ARQUIVADA'));

create or replace function public.vinkulo_tenant_catalog_snapshot()
returns table (
  legacy_d1_id bigint,
  slug text,
  name text,
  status text,
  is_demo boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select t.legacy_d1_id, t.slug, t.name, t.status, t.is_demo, t.created_at
  from public.vinkulo_tenants t
  order by t.legacy_d1_id;
$$;

create or replace function public.vinkulo_sync_tenant_catalog(
  payload jsonb,
  actor_legacy_d1_id bigint
)
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
  prior public.vinkulo_tenants%rowtype;
  item_id bigint;
  item_slug text;
  item_name text;
  item_status text;
  item_demo boolean;
  item_created timestamptz;
  seen_ids bigint[] := array[]::bigint[];
  seen_slugs text[] := array[]::text[];
  total integer := 0;
  added integer := 0;
  changed integer := 0;
  same integer := 0;
  completed_run uuid;
begin
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'Catalogo invalido';
  end if;
  if jsonb_array_length(payload) > 500 then
    raise exception 'Catalogo acima de 500 comunidades';
  end if;
  if actor_legacy_d1_id is null or actor_legacy_d1_id <= 0 then
    raise exception 'Responsavel invalido';
  end if;

  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'legacy_d1_id', '') !~ '^[1-9][0-9]*$'
      or coalesce(item->>'slug', '') !~ '^[a-z0-9-]+$'
      or char_length(coalesce(item->>'name', '')) not between 1 and 180
      or coalesce(item->>'status', '') not in ('ATIVA', 'INATIVA', 'SUSPENSA', 'ARQUIVADA')
      or jsonb_typeof(item->'is_demo') is distinct from 'boolean'
      or coalesce(item->>'created_at', '') = '' then
      raise exception 'Comunidade invalida no catalogo';
    end if;
    item_id := (item->>'legacy_d1_id')::bigint;
    item_slug := item->>'slug';
    item_name := item->>'name';
    item_status := item->>'status';
    item_demo := (item->>'is_demo')::boolean;
    item_created := (item->>'created_at')::timestamptz;
    if item_id = any(seen_ids) or item_slug = any(seen_slugs) then
      raise exception 'IDs ou slugs duplicados';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    seen_slugs := array_append(seen_slugs, item_slug);
    total := total + 1;

    select * into prior from public.vinkulo_tenants where legacy_d1_id = item_id for update;
    if not found then
      insert into public.vinkulo_tenants (legacy_d1_id, slug, name, status, is_demo, created_at)
      values (item_id, item_slug, item_name, item_status, item_demo, item_created);
      added := added + 1;
    elsif prior.slug is distinct from item_slug
      or prior.name is distinct from item_name
      or prior.status is distinct from item_status
      or prior.is_demo is distinct from item_demo
      or prior.created_at is distinct from item_created then
      update public.vinkulo_tenants
      set slug = item_slug, name = item_name, status = item_status,
          is_demo = item_demo, created_at = item_created, updated_at = now()
      where legacy_d1_id = item_id;
      changed := changed + 1;
    else
      same := same + 1;
    end if;
  end loop;

  insert into public.vinkulo_migration_runs
    (scope, status, summary, started_at, finished_at, initiated_by_legacy_d1_id)
  values
    ('TENANTS', 'SUCCEEDED',
     jsonb_build_object('source_count', total, 'inserted', added, 'updated', changed, 'unchanged', same),
     now(), now(), actor_legacy_d1_id)
  returning id into completed_run;

  return query select completed_run, total, added, changed, same;
end;
$$;

revoke all on function public.vinkulo_tenant_catalog_snapshot() from public, anon, authenticated;
revoke all on function public.vinkulo_sync_tenant_catalog(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_tenant_catalog_snapshot() to service_role;
grant execute on function public.vinkulo_sync_tenant_catalog(jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
