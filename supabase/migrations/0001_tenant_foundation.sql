-- Fundação paralela do Vínkulo no Supabase.
-- Esta migração não copia dados do D1. Ela cria somente a estrutura segura
-- que receberá comunidades, perfis e vínculos em uma etapa posterior e auditável.

create table if not exists public.vinkulo_tenants (
  id uuid primary key default gen_random_uuid(),
  legacy_d1_id bigint not null unique check (legacy_d1_id > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 180),
  status text not null default 'ATIVA' check (status in ('ATIVA', 'INATIVA', 'SUSPENSA')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vinkulo_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  legacy_d1_id bigint unique check (legacy_d1_id > 0),
  display_name text not null check (char_length(display_name) between 1 and 180),
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vinkulo_memberships (
  id uuid primary key default gen_random_uuid(),
  legacy_d1_id bigint unique check (legacy_d1_id > 0),
  tenant_id uuid not null references public.vinkulo_tenants(id) on delete cascade,
  profile_id uuid not null references public.vinkulo_profiles(id) on delete cascade,
  role text not null default 'MEMBRO' check (char_length(role) between 1 and 64),
  status text not null default 'ATIVO' check (status in ('ATIVO', 'PENDENTE', 'SUSPENSO', 'INATIVO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id)
);

create table if not exists public.vinkulo_migration_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'D1' check (source = 'D1'),
  scope text not null check (scope in ('TENANCY_FOUNDATION', 'TENANTS', 'PROFILES', 'MEMBERSHIPS')),
  status text not null check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  initiated_by_legacy_d1_id bigint
);

create index if not exists vinkulo_memberships_tenant_status_idx
  on public.vinkulo_memberships (tenant_id, status);
create index if not exists vinkulo_memberships_profile_status_idx
  on public.vinkulo_memberships (profile_id, status);
create index if not exists vinkulo_migration_runs_scope_started_idx
  on public.vinkulo_migration_runs (scope, started_at desc);

-- As claims serão preenchidas somente quando a autenticação do Vínkulo for
-- migrada. Enquanto isso, todas as leituras de cliente falham por padrão.
create or replace function public.vinkulo_current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'vinkulo_tenant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() -> 'app_metadata' ->> 'vinkulo_tenant_id')::uuid
    else null
  end;
$$;

create or replace function public.vinkulo_is_system_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'vinkulo_system_owner', '') = 'true';
$$;

alter table public.vinkulo_tenants enable row level security;
alter table public.vinkulo_profiles enable row level security;
alter table public.vinkulo_memberships enable row level security;
alter table public.vinkulo_migration_runs enable row level security;

revoke all on public.vinkulo_tenants, public.vinkulo_profiles, public.vinkulo_memberships, public.vinkulo_migration_runs from anon, authenticated;
grant select on public.vinkulo_tenants, public.vinkulo_profiles, public.vinkulo_memberships to authenticated;

drop policy if exists vinkulo_tenants_read_isolated on public.vinkulo_tenants;
create policy vinkulo_tenants_read_isolated on public.vinkulo_tenants
  for select to authenticated
  using (id = public.vinkulo_current_tenant_id() or public.vinkulo_is_system_owner());

drop policy if exists vinkulo_profiles_read_self_or_owner on public.vinkulo_profiles;
create policy vinkulo_profiles_read_self_or_owner on public.vinkulo_profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or public.vinkulo_is_system_owner());

drop policy if exists vinkulo_memberships_read_self_or_owner on public.vinkulo_memberships;
create policy vinkulo_memberships_read_self_or_owner on public.vinkulo_memberships
  for select to authenticated
  using (
    public.vinkulo_is_system_owner()
    or exists (
      select 1 from public.vinkulo_profiles profile
      where profile.id = profile_id and profile.auth_user_id = auth.uid()
    )
  );

-- Nenhuma política de escrita de cliente é criada nesta etapa. Escritas só
-- poderão ocorrer pelo servidor do Vínkulo com chave de serviço, em rota
-- protegida, depois da migração de dados ser autorizada.

notify pgrst, 'reload schema';
