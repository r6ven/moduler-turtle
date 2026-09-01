create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ranked_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ranked_cron_secret',
      'Shared secret used by ranked maintenance cron jobs'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'ranked_puzzle_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ranked_puzzle_secret',
      'Seed secret used to generate ranked puzzle seasons'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'ranked_project_url') then
    perform vault.create_secret(
      'https://dcpmbjmjlaafrwzxlmsx.supabase.co',
      'ranked_project_url',
      'Supabase project URL used by ranked maintenance cron jobs'
    );
  end if;
end;
$$;

create or replace function public.get_ranked_server_config()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select jsonb_build_object(
    'cron_secret', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ranked_cron_secret'
      limit 1
    ),
    'puzzle_secret', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ranked_puzzle_secret'
      limit 1
    ),
    'project_url', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ranked_project_url'
      limit 1
    )
  );
$$;

revoke all on function public.get_ranked_server_config() from public, anon, authenticated;
grant execute on function public.get_ranked_server_config() to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in ('ranked-finalize-previous-day', 'ranked-generate-next-season')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ranked-finalize-previous-day',
  '10 0 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ranked_project_url'
        limit 1
      ) || '/functions/v1/finalize-ranked-day',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ranked_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'playDate', ((now() at time zone 'UTC')::date - 1)::text
      )
    );
  $job$
);

select cron.schedule(
  'ranked-generate-next-season',
  '15 0 25 * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ranked_project_url'
        limit 1
      ) || '/functions/v1/generate-ranked-season',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ranked_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'seasonId',
        to_char((now() at time zone 'UTC') + interval '1 month', 'YYYY-MM')
      )
    );
  $job$
);
