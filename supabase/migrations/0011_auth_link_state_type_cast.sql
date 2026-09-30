-- Alinha o tipo do e-mail vindo de auth.users com o contrato text da RPC.

begin;

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
    select profile_record.id, profile_record.email::text, profile_record.auth_user_id,
      (select c.id from candidates c order by c.id limit 1),
      (select c.email::text from candidates c order by c.id limit 1),
      (select c.legacy_id from candidates c order by c.id limit 1),
      (select count(*) from candidates);
end;
$$;

revoke all on function public.vinkulo_auth_link_state(bigint) from public, anon, authenticated;
grant execute on function public.vinkulo_auth_link_state(bigint) to service_role;

notify pgrst, 'reload schema';

commit;
