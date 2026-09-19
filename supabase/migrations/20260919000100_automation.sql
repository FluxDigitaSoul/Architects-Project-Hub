-- =============================================================================
-- Automazione: job pianificati, coda delle notifiche, preferenze, conservazione dei dati
-- AFU: FR-M2-05 (promemoria di revisione, BR-19), FR-M2-12 / FR-MT-06 (notifiche raggruppate
-- in finestre di 10 minuti o riepilogo giornaliero), PRIV-03 (audio grezzo), cap. 12.2
-- (IP negli audit troncati dopo 90 giorni), cap. 14.3 (job pianificati).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Coda delle notifiche (outbox): le righe nascono nella stessa transazione dell'evento e
-- un job le invia raggruppate per destinatario e commessa (`digest_key`).
-- -----------------------------------------------------------------------------
alter table app.notifications
  add column send_after timestamptz not null default now(),
  add column attempts   integer not null default 0,
  add column last_error text,
  -- Idempotenza degli eventi generati dai job (es. promemoria "2 giorni prima" una sola volta).
  add column dedupe_key text;

create unique index notifications_dedupe_idx on app.notifications (tenant_id, dedupe_key) where dedupe_key is not null;
drop index if exists app.notifications_pending_idx;
create index notifications_due_idx on app.notifications (send_after) where status = 'PENDING';

grant delete on app.notifications to app_api; -- conservazione 90 giorni (FR-MT-05)

-- Preferenze: GROUPED = finestre di 10 minuti, DAILY = riepilogo giornaliero, OFF = solo email essenziali.
alter table app.client_contacts
  add column notification_mode text not null default 'GROUPED'
    check (notification_mode in ('GROUPED', 'DAILY', 'OFF'));
alter table app.memberships
  add column notification_mode text not null default 'GROUPED'
    check (notification_mode in ('GROUPED', 'DAILY', 'OFF'));

-- PRIV-03: l'audio grezzo si elimina dopo il periodo di conservazione; la riga resta come traccia.
alter table app.audio_notes add column purged_at timestamptz;

-- -----------------------------------------------------------------------------
-- Esecuzioni dei job (dati di piattaforma, senza tenant). L'indice unico parziale fa da lease:
-- due istanze dell'API non eseguono mai lo stesso job in parallelo.
-- -----------------------------------------------------------------------------
create table app.job_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  status      text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  trigger     text not null check (trigger in ('SCHEDULER', 'HTTP')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);
create unique index job_runs_lease_idx on app.job_runs (job) where status = 'RUNNING';
create index job_runs_job_time_idx on app.job_runs (job, started_at desc);

alter table app.job_runs enable row level security;
create policy platform_jobs on app.job_runs for all to app_api using (true) with check (true);
grant select, insert, update, delete on app.job_runs to app_api;

-- -----------------------------------------------------------------------------
-- Tenant su cui girano i job. SECURITY DEFINER: restituisce solo gli id; il lavoro vero si
-- fa poi con il contesto di ciascun tenant (RLS, BR-04).
-- -----------------------------------------------------------------------------
create or replace function app.automation_tenant_ids()
returns table (tenant_id uuid)
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select t.id from app.tenants t where t.status in ('ACTIVE', 'SUSPENDED') order by t.id
$$;

-- Tenant con notifiche da inviare adesso (evita di aprire una transazione per ogni studio).
create or replace function app.tenants_with_due_notifications()
returns table (tenant_id uuid)
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select distinct n.tenant_id from app.notifications n where n.status = 'PENDING' and n.send_after <= now()
$$;

revoke all on function app.automation_tenant_ids() from public;
revoke all on function app.tenants_with_due_notifications() from public;
grant execute on function app.automation_tenant_ids(), app.tenants_with_due_notifications() to app_api;

-- -----------------------------------------------------------------------------
-- Cap. 12.2: IP negli audit troncati dopo 90 giorni, esclusi gli eventi probatori
-- (approvazioni, OTP, presa visione dell'informativa). Il registro resta append-only:
-- l'unica modifica ammessa è il troncamento dell'IP, e solo da questa funzione.
-- -----------------------------------------------------------------------------
create or replace function app.prevent_audit_mutation() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('app.audit_ip_truncation', true) = 'on'
     and (to_jsonb(new) - 'ip') = (to_jsonb(old) - 'ip') then
    return new;
  end if;
  raise exception 'AUDIT_APPEND_ONLY' using errcode = 'P0001',
    detail = 'Il registro di audit non si modifica né si cancella (FR-MT-07).';
end
$$;

create or replace function app.truncate_audit_ips(p_older_than interval default interval '90 days', p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  n integer;
begin
  perform set_config('app.audit_ip_truncation', 'on', true);
  with batch as (
    select id from app.audit_events
     where ip is not null
       and occurred_at < now() - p_older_than
       and masklen(ip) = case when family(ip) = 4 then 32 else 128 end
       and action not in ('DRAWING_VERSION_APPROVED', 'OTP_SENT', 'PRIVACY_ACKNOWLEDGED')
     order by id
     limit p_limit
  )
  update app.audit_events a
     set ip = network(set_masklen(a.ip, case when family(a.ip) = 4 then 24 else 48 end))::inet
    from batch where a.id = batch.id;
  get diagnostics n = row_count;
  perform set_config('app.audit_ip_truncation', 'off', true);
  return n;
end
$$;

revoke all on function app.truncate_audit_ips(interval, integer) from public;
grant execute on function app.truncate_audit_ips(interval, integer) to app_api;
