-- =============================================================================
-- 0900 — Diario di cantiere (Modulo 4)
-- AFU: FR-M4-01..16, SM-SOPRALLUOGO, BR-05 (validazione AI), BR-09 (immutabilità),
--      BR-16 (numerazione senza buchi), BR-23 (completezza sync), BR-24 (idempotenza)
-- =============================================================================

-- Contatore progressivo per commessa: numerazione atomica e senza buchi (BR-16)
alter table app.projects add column next_visit_number integer not null default 1;

create table app.site_visits (
  id                      uuid primary key,              -- generabile dal client (offline)
  tenant_id               uuid not null references app.tenants (id) on delete cascade,
  project_id              uuid not null references app.projects (id) on delete cascade,
  number                  integer not null check (number >= 1),
  visit_type              text not null default 'ORDINARY'
                          check (visit_type in ('ORDINARY', 'EXTRAORDINARY', 'TESTING', 'OTHER')),
  started_at              timestamptz not null,
  ended_at                timestamptz,
  weather                 jsonb,                          -- {condition, temperatureC, source}
  phase                   text,
  geo                     jsonb,
  status                  text not null default 'DRAFT' check (status in (
                            'DRAFT', 'AI_PROCESSING', 'REVIEW', 'FINAL', 'SENT', 'CANCELLED')),
  director_membership_id  uuid not null references app.memberships (id),
  general_notes           text,
  finalized_at            timestamptz,
  finalized_by            uuid references app.user_profiles (id),
  cancelled_at            timestamptz,
  cancel_reason           text,
  replaces_visit_id       uuid references app.site_visits (id),
  shared_with_client      boolean not null default false,
  created_at              timestamptz not null default now(),
  created_by              uuid references app.user_profiles (id),
  updated_at              timestamptz not null default now(),
  version                 integer not null default 1,
  unique (project_id, number),
  check (status <> 'CANCELLED' or char_length(coalesce(cancel_reason, '')) >= 10)
);
create index site_visits_project_idx on app.site_visits (project_id, number desc);
create trigger site_visits_touch before update on app.site_visits
  for each row execute function app.touch_updated_at();

create or replace function app.next_visit_number(p_project_id uuid) returns integer
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_number integer;
begin
  update app.projects set next_visit_number = next_visit_number + 1
   where id = p_project_id
  returning next_visit_number - 1 into v_number;
  if v_number is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_number;
end
$$;
grant execute on function app.next_visit_number(uuid) to app_api;

-- SM-SOPRALLUOGO + BR-09: un verbale finalizzato cambia solo verso SENT o CANCELLED.
create or replace function app.enforce_visit_transition() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if old.status in ('FINAL', 'SENT', 'CANCELLED') then
    if old.status = 'CANCELLED'
       or (new.status not in ('SENT', 'CANCELLED') and new.status <> old.status)
       or (new.status = old.status and (
             new.general_notes is distinct from old.general_notes
          or new.weather is distinct from old.weather
          or new.started_at is distinct from old.started_at
          or new.director_membership_id is distinct from old.director_membership_id)) then
      raise exception 'REPORT_FINALIZED' using errcode = 'P0001';
    end if;
  end if;
  if new.number is distinct from old.number then
    raise exception 'VISIT_NUMBER_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger site_visits_transition before update on app.site_visits
  for each row execute function app.enforce_visit_transition();

-- Guardia comune per i figli del sopralluogo: nessuna modifica a verbale finalizzato (BR-09)
create or replace function app.guard_finalized_visit() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from app.site_visits
   where id = case when tg_op = 'DELETE' then old.visit_id else new.visit_id end;
  if v_status in ('FINAL', 'SENT', 'CANCELLED') then
    raise exception 'REPORT_FINALIZED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create table app.visit_attendees (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references app.tenants (id) on delete cascade,
  visit_id       uuid not null references app.site_visits (id) on delete cascade,
  kind           text not null check (kind in ('MEMBER', 'CLIENT', 'CONTRACTOR', 'OTHER')),
  ref_id         uuid,
  name           text not null check (char_length(name) between 1 and 150),
  qualification  text,
  organization   text,
  is_director    boolean not null default false,
  sort_order     integer not null default 0
);
create index visit_attendees_visit_idx on app.visit_attendees (visit_id);
create trigger visit_attendees_guard before insert or update or delete on app.visit_attendees
  for each row execute function app.guard_finalized_visit();

create table app.visit_photos (
  id                    uuid primary key,                 -- generato dal client
  tenant_id             uuid not null references app.tenants (id) on delete cascade,
  visit_id              uuid not null references app.site_visits (id) on delete cascade,
  file_key              text,
  thumb_key             text,
  mime_type             text,
  size_bytes            bigint,
  upload_status         text not null default 'PENDING' check (upload_status in ('PENDING', 'UPLOADED', 'FAILED')),
  taken_at              timestamptz,
  geo                   jsonb,
  sort_order            integer not null default 0,
  caption               text check (caption is null or char_length(caption) <= 500),
  section               text check (section is null or section in ('PROGRESS', 'ISSUES', 'ORDERS', 'GENERAL')),
  include_in_report     boolean not null default true,
  derived_from_photo_id uuid references app.visit_photos (id),
  created_at            timestamptz not null default now()
);
create index visit_photos_visit_idx on app.visit_photos (visit_id, sort_order);
create trigger visit_photos_guard before insert or update or delete on app.visit_photos
  for each row execute function app.guard_finalized_visit();

create table app.audio_notes (
  id                    uuid primary key,                 -- generato dal client
  tenant_id             uuid not null references app.tenants (id) on delete cascade,
  visit_id              uuid not null references app.site_visits (id) on delete cascade,
  file_key              text,
  mime_type             text,
  duration_sec          integer check (duration_sec is null or duration_sec between 1 and 3600),
  upload_status         text not null default 'PENDING' check (upload_status in ('PENDING', 'UPLOADED', 'FAILED')),
  recorded_at           timestamptz not null,
  transcription_status  text not null default 'NONE' check (transcription_status in (
                          'NONE', 'QUEUED', 'RUNNING', 'DONE', 'FAILED')),
  created_at            timestamptz not null default now()
);
create index audio_notes_visit_idx on app.audio_notes (visit_id);
create trigger audio_notes_guard before insert or update or delete on app.audio_notes
  for each row execute function app.guard_finalized_visit();

create table app.transcripts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants (id) on delete cascade,
  audio_note_id   uuid not null unique references app.audio_notes (id) on delete cascade,
  provider        text not null,
  language        text not null default 'it',
  text            text not null,
  segments        jsonb not null default '[]'::jsonb,
  avg_confidence  numeric(5, 4),
  created_at      timestamptz not null default now()
);

-- Tracciabilità dell'AI (NFR-AI-02)
create table app.structured_drafts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants (id) on delete cascade,
  visit_id        uuid not null references app.site_visits (id) on delete cascade,
  model           text not null,
  prompt_version  text not null,
  input_sha256    text not null,
  output          jsonb not null,
  created_at      timestamptz not null default now()
);

create table app.report_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants (id) on delete cascade,
  visit_id            uuid not null references app.site_visits (id) on delete cascade,
  section             text not null check (section in ('PROGRESS', 'ISSUES', 'ORDERS', 'GENERAL')),
  sort_order          integer not null default 0,
  text                text not null check (char_length(text) between 1 and 5000),
  severity            text check (severity is null or severity in ('LOW', 'MEDIUM', 'HIGH')),
  addressee           text,
  due_date            date,
  needs_verification  boolean not null default false,
  origin              text not null default 'HUMAN' check (origin in ('AI', 'HUMAN', 'AI_EDITED')),
  photo_refs          uuid[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             integer not null default 1
);
create index report_items_visit_idx on app.report_items (visit_id, section, sort_order);
create trigger report_items_touch before update on app.report_items
  for each row execute function app.touch_updated_at();
create trigger report_items_guard before insert or update or delete on app.report_items
  for each row execute function app.guard_finalized_visit();

-- Registro delle azioni aperte (difformità da verificare nei sopralluoghi successivi) — FR-M4-15
create table app.open_actions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references app.tenants (id) on delete cascade,
  project_id             uuid not null references app.projects (id) on delete cascade,
  source_item_id         uuid not null references app.report_items (id) on delete restrict,
  source_visit_number    integer not null,
  status                 text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'SUPERSEDED')),
  due_date               date,
  resolved_in_visit_id   uuid references app.site_visits (id),
  resolved_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index open_actions_project_idx on app.open_actions (project_id, status);

-- Idempotenza delle operazioni offline (BR-24): ogni clientOpId si applica una sola volta
create table app.client_operations (
  tenant_id     uuid not null references app.tenants (id) on delete cascade,
  client_op_id  uuid not null,
  user_id       uuid not null,
  operation     text not null,
  result        jsonb not null,
  applied_at    timestamptz not null default now(),
  primary key (tenant_id, client_op_id)
);

-- -----------------------------------------------------------------------------
-- RLS (BR-04) e privilegi
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'site_visits', 'visit_attendees', 'visit_photos', 'audio_notes', 'transcripts',
    'structured_drafts', 'report_items', 'open_actions', 'client_operations'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all to app_api
         using (tenant_id = app.current_tenant_id())
         with check (tenant_id = app.current_tenant_id())', t);
  end loop;
end
$$;

grant select, insert, update on app.site_visits to app_api;
grant select, insert, update, delete on app.visit_attendees to app_api;
grant select, insert, update, delete on app.visit_photos to app_api;
grant select, insert, update, delete on app.audio_notes to app_api;
grant select, insert on app.transcripts to app_api;
grant select, insert on app.structured_drafts to app_api;
grant select, insert, update, delete on app.report_items to app_api;
grant select, insert, update on app.open_actions to app_api;
grant select, insert on app.client_operations to app_api;
