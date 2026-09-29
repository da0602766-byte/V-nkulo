-- A conta Auth vinculada ao perfil pode consultar cada comunidade onde tem
-- vínculo ativo. Isso cobre usuários de múltiplas comunidades sem confiar em
-- uma única claim de comunidade potencialmente desatualizada.

drop policy if exists vinkulo_tenants_read_isolated on public.vinkulo_tenants;
create policy vinkulo_tenants_read_isolated on public.vinkulo_tenants
  for select to authenticated
  using (
    public.vinkulo_is_system_owner()
    or exists (
      select 1
      from public.vinkulo_memberships membership
      join public.vinkulo_profiles profile on profile.id = membership.profile_id
      where membership.tenant_id = vinkulo_tenants.id
        and membership.status = 'ATIVO'
        and profile.active = true
        and profile.auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
