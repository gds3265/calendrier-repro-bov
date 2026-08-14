-- À exécuter APRÈS avoir créé et déployé l'Edge Function repro-notifications.
-- Vérifie toutes les 15 minutes. La fonction n'envoie qu'une fois par jour,
-- dès que l'heure paramétrée dans l'application est atteinte.

do $$
begin
  if exists (select 1 from cron.job where jobname='repro-bovine-notifications') then
    perform cron.unschedule('repro-bovine-notifications');
  end if;
end $$;

select cron.schedule(
  'repro-bovine-notifications',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='repro_project_url') || '/functions/v1/repro-notifications',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='repro_publishable_key')
    ),
    body := jsonb_build_object('source','cron','time',now())
  );
  $$
);
