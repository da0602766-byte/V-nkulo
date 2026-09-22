-- Etapa 7: cron nativo do Supabase. O segredo de disparo fica no Vault,
-- nunca no texto persistido em cron.job nem em uma tabela pública.
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.vinkulo_install_sync_schedule(webhook_secret text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron, vault, net
as $fn$
declare
  secret_id uuid;
  job_id bigint;
begin
  if webhook_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'Segredo de agendamento invalido';
  end if;

  select id into secret_id from vault.secrets
  where name = 'vinkulo_sync_webhook_secret' limit 1;
  if secret_id is null then
    perform vault.create_secret(webhook_secret, 'vinkulo_sync_webhook_secret',
      'Autorizacao exclusiva para disparar a conciliacao Vinkulo');
  else
    perform vault.update_secret(secret_id, webhook_secret);
  end if;

  select cron.schedule(
    'vinkulo-sync-every-5-minutes', '*/5 * * * *',
    $job$select net.http_post(
      url := 'https://adote-gestao.da0602766.chatgpt.site/api/system/supabase-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'vinkulo_sync_webhook_secret' limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );$job$
  ) into job_id;
  return job_id;
end;
$fn$;

revoke all on function public.vinkulo_install_sync_schedule(text) from public, anon, authenticated;
grant execute on function public.vinkulo_install_sync_schedule(text) to service_role;
notify pgrst, 'reload schema';
