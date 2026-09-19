-- =============================================================================
-- 1000 — Documentale, invii, notifiche e job asincroni (Modulo 5, FR-MT-05/06)
-- AFU: FR-M5-00..22, FR-M1-07, BR-07, BR-08, BR-09 (immutabilità), BR-21
-- =============================================================================

create table app.documents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants (id) on delete cascade,
  project_id          uuid not null references app.projects (id) on delete cascade,
  type                text not null check (type in (
                        'SITE_REPORT', 'RAI_REPORT', 'RAI_CHECK', 'APPROVAL_SUMMARY', 'PIN_EXPORT', 'UPLOAD')),
  number              text not null,                    -- es. VS-03, RAI-R1
  revision            integer not null default 0 check (revision >= 0),
  revision_reason     text,
  title               text not null,
  status              text not null default 'DRAFT' check (status in ('DRAFT', 'FINAL', 'SIGNED', 'CANCELLED')),
  file_key            text,
  file_name           text,
  size_bytes          bigint,
  sha256              text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  verification_code   text unique,
  source_type         text check (source_type is null or source_type in ('SITE_VISIT', 'RAI_SNAPSHOT', 'APPROVAL', 'DRAWING_VERSION')),
  source_id           uuid,
  signer_membership_id uuid references app.memberships (id),
  signed_file_key     text,
  signed_sha256       text check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at           timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  cancelled_by        uuid references app.user_profiles (id),
  shared_with_client  boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid references app.user_profiles (id),
  updated_at          timestamptz not null default now(),
  version             integer not null default 1,
  check (revision = 0 or char_length(coalesce(revision_reason, '')) >= 5),
  check (status <> 'CANCELLED' or char_length(coalesce(cancel_reason, '')) >= 10),
  check (status in ('DRAFT', 'CANCELLED') or (sha256 is not null and verification_code is not null))
);
create unique index documents_number_revision_uq on app.documents (project_id, type, number, revision);
create index documents_project_idx on app.documents (project_id, created_at desc);
create trigger documents_touch before update on app.documents
  for each row execute function app.touch_updated_at();

-- BR-09: un documento definitivo non si elimina e cambia solo per firma, condivisione o annullamento.
create or replace function app.enforce_document_immutability() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'REPORT_FINALIZED' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'REPORT_FINALIZED' using errcode = 'P0001';
  end if;
  if old.status in ('FINAL', 'SIGNED') and (
       new.file_key is distinct from old.file_key
    or new.sha256 is distinct from old.sha256
    or new.number is distinct from old.number
    or new.revision is distinct from old.revision
    or new.type is distinct from old.type
    or new.status not in ('SIGNED', 'CANCELLED', old.status)) then
    raise exception 'REPORT_FINALIZED' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger documents_immutable before update or delete on app.documents
  for each row execute function app.enforce_document_immutability();

-- Invii — FR-M5-05 (allegato ≤ 10 MB, altrimenti link a 7 giorni; PEC registrata a mano)
create table app.document_deliveries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references app.tenants (id) on delete cascade,
  document_id      uuid not null references app.documents (id) on delete cascade,
  recipients       jsonb not null check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) >= 1),
  channel          text not null check (channel in ('EMAIL_ATTACHMENT', 'EMAIL_LINK', 'MANUAL_PEC')),
  message          text,
  sent_at          timestamptz not null default now(),
  sent_by          uuid references app.user_profiles (id),
  delivery_status  jsonb not null default '[]'::jsonb,
  link_expires_at  timestamptz
);
create index document_deliveries_document_idx on app.document_deliveries (document_id, sent_at desc);

-- Notifiche in app ed email con digest (FR-MT-05/06)
create table app.notifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants (id) on delete cascade,
  recipient_type  text not null check (recipient_type in ('MEMBER', 'CLIENT')),
  recipient_id    uuid not null,
  event           text not null,
  payload         jsonb not null default '{}'::jsonb,
  channel         text not null check (channel in ('IN_APP', 'EMAIL')),
  status          text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  digest_key      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index notifications_recipient_idx on app.notifications (recipient_type, recipient_id, created_at desc);
create index notifications_pending_idx on app.notifications (status, created_at) where status = 'PENDING';

-- Job asincroni idempotenti (elaborazione file, trascrizione, PDF, email, export)
create table app.jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references app.tenants (id) on delete cascade,
  type             text not null check (type in ('FILE_PROCESS', 'TRANSCRIBE', 'STRUCTURE', 'PDF', 'EXPORT', 'EMAIL')),
  idempotency_key  text not null,
  status           text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'DEAD')),
  attempts         integer not null default 0,
  last_error       text,
  payload          jsonb not null default '{}'::jsonb,
  run_after        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  unique (tenant_id, type, idempotency_key)
);
create index jobs_queue_idx on app.jobs (status, run_after) where status = 'QUEUED';

-- -----------------------------------------------------------------------------
-- RLS (BR-04) e privilegi
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['documents', 'document_deliveries', 'notifications', 'jobs'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all to app_api
         using (tenant_id = app.current_tenant_id())
         with check (tenant_id = app.current_tenant_id())', t);
  end loop;
end
$$;

grant select, insert, update, delete on app.documents to app_api;
grant select, insert, update on app.document_deliveries to app_api;
grant select, insert, update on app.notifications to app_api;
grant select, insert, update on app.jobs to app_api;
