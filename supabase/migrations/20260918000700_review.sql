-- =============================================================================
-- 0700 — Revisione degli elaborati con il committente (Modulo 2)
-- AFU: FR-M2-01..18, SM-ELABORATO, SM-PIN, SM-RICHIESTA-MODIFICA,
--      BR-01 (congelamento), BR-10 (sign-off), BR-11, BR-14, BR-18 (numerazione), BR-19, BR-20
-- =============================================================================

create table app.drawings (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references app.tenants (id) on delete cascade,
  project_id           uuid not null references app.projects (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 150),
  sheet_code           text check (sheet_code is null or char_length(sheet_code) <= 30),
  category             text not null default 'OTHER' check (category in (
                         'PLAN', 'SECTION', 'ELEVATION', 'DETAIL', 'RENDER', 'SURVEY', 'OTHER')),
  phase                text,
  scale                text,
  client_notes         text,
  download_allowed     boolean not null default false,
  next_version_number  integer not null default 1 check (next_version_number >= 1),
  created_at           timestamptz not null default now(),
  created_by           uuid references app.user_profiles (id),
  updated_at           timestamptz not null default now(),
  version              integer not null default 1
);
create unique index drawings_sheet_code_uq on app.drawings (project_id, lower(sheet_code)) where sheet_code is not null;
create index drawings_project_idx on app.drawings (project_id);
create trigger drawings_touch before update on app.drawings
  for each row execute function app.touch_updated_at();

-- Versione: SM-ELABORATO. PROCESSING → DRAFT | ERROR; DRAFT → PUBLISHED; PUBLISHED → DRAFT | SUPERSEDED | APPROVED
create table app.drawing_versions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references app.tenants (id) on delete cascade,
  drawing_id        uuid not null references app.drawings (id) on delete cascade,
  number            integer not null check (number >= 1),
  status            text not null default 'PROCESSING' check (status in (
                      'PROCESSING', 'ERROR', 'DRAFT', 'PUBLISHED', 'SUPERSEDED', 'APPROVED', 'DISCARDED')),
  original_file_key text,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes between 1 and 209715200),
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  page_count        integer check (page_count is null or page_count between 1 and 200),
  revision_note     text check (revision_note is null or char_length(revision_note) <= 1000),
  error_message     text,
  uploaded_by       uuid references app.user_profiles (id),
  uploaded_at       timestamptz not null default now(),
  published_at      timestamptz,
  published_by      uuid references app.user_profiles (id),
  review_due_date   date,
  frozen_at         timestamptz,
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,
  unique (drawing_id, number)
);
create index drawing_versions_drawing_idx on app.drawing_versions (drawing_id, number desc);
create trigger drawing_versions_touch before update on app.drawing_versions
  for each row execute function app.touch_updated_at();

-- BR-18: il numero di versione si assegna in modo atomico e non si riusa mai.
create or replace function app.next_drawing_version_number(p_drawing_id uuid) returns integer
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_number integer;
begin
  update app.drawings
     set next_version_number = next_version_number + 1
   where id = p_drawing_id
  returning next_version_number - 1 into v_number;
  if v_number is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_number;
end
$$;
grant execute on function app.next_drawing_version_number(uuid) to app_api;

-- SM-ELABORATO: transizioni ammesse; BR-01: una versione congelata non cambia più.
create or replace function app.enforce_version_transition() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if old.frozen_at is not null then
    raise exception 'VERSION_FROZEN' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    if new.original_file_key is distinct from old.original_file_key
       and old.status not in ('PROCESSING', 'ERROR') then
      raise exception 'VERSION_FILE_IMMUTABLE' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if not (
       (old.status = 'PROCESSING' and new.status in ('DRAFT', 'ERROR'))
    or (old.status = 'ERROR' and new.status = 'DISCARDED')
    or (old.status = 'DRAFT' and new.status in ('PUBLISHED', 'DISCARDED'))
    or (old.status = 'PUBLISHED' and new.status in ('DRAFT', 'SUPERSEDED', 'APPROVED'))
  ) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001',
      detail = format('%s → %s', old.status, new.status);
  end if;
  if new.status in ('APPROVED', 'SUPERSEDED') then
    new.frozen_at := now();
  end if;
  return new;
end
$$;
create trigger drawing_versions_transition before update on app.drawing_versions
  for each row execute function app.enforce_version_transition();

create table app.drawing_pages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants (id) on delete cascade,
  version_id   uuid not null references app.drawing_versions (id) on delete cascade,
  page_index   integer not null check (page_index >= 0),
  width_px     integer not null check (width_px > 0),
  height_px    integer not null check (height_px > 0),
  rotation     integer not null default 0 check (rotation in (0, 90, 180, 270)),
  preview_key  text,
  thumb_key    text,
  unique (version_id, page_index)
);

-- -----------------------------------------------------------------------------
-- Pin e commenti — SM-PIN, BR-11, BR-14, BR-20
-- -----------------------------------------------------------------------------
create table app.pins (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references app.tenants (id) on delete cascade,
  version_id               uuid not null references app.drawing_versions (id) on delete cascade,
  page_id                  uuid not null references app.drawing_pages (id) on delete cascade,
  number                   integer not null check (number >= 1),
  x_pct                    numeric(7, 4) not null check (x_pct between 0 and 100),
  y_pct                    numeric(7, 4) not null check (y_pct between 0 and 100),
  category                 text,
  status                   text not null default 'OPEN' check (status in (
                             'OPEN', 'WAITING', 'RESOLVED', 'WITHDRAWN', 'FROZEN', 'TRANSFERRED')),
  author_type              text not null check (author_type in ('MEMBER', 'CLIENT')),
  author_id                uuid not null,
  transferred_from_pin_id  uuid references app.pins (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  version                  integer not null default 1,
  unique (version_id, number)
);
create index pins_version_idx on app.pins (version_id);
create trigger pins_touch before update on app.pins
  for each row execute function app.touch_updated_at();

create table app.comments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references app.tenants (id) on delete cascade,
  pin_id         uuid not null references app.pins (id) on delete cascade,
  author_type    text not null check (author_type in ('MEMBER', 'CLIENT')),
  author_id      uuid not null,
  body           text not null check (char_length(body) between 1 and 5000),
  edit_history   jsonb not null default '[]'::jsonb,
  edited_at      timestamptz,
  retracted_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index comments_pin_idx on app.comments (pin_id, created_at);

-- BR-01: nessun pin o commento nuovo o modificato su una versione congelata.
create or replace function app.guard_frozen_version() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_version_id uuid;
  v_frozen     timestamptz;
begin
  if tg_table_name = 'pins' then
    v_version_id := new.version_id;
    -- Il congelamento dei pin fatto dal sistema al momento dell'approvazione è ammesso.
    if tg_op = 'UPDATE' and new.status in ('FROZEN', 'TRANSFERRED') then
      return new;
    end if;
  else
    select p.version_id into v_version_id from app.pins p where p.id = new.pin_id;
  end if;
  select frozen_at into v_frozen from app.drawing_versions where id = v_version_id;
  if v_frozen is not null then
    raise exception 'VERSION_FROZEN' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger pins_guard_frozen before insert or update on app.pins
  for each row execute function app.guard_frozen_version();
create trigger comments_guard_frozen before insert or update on app.comments
  for each row execute function app.guard_frozen_version();

-- Congela i pin quando la versione passa ad APPROVED o SUPERSEDED (SM-PIN).
create or replace function app.freeze_pins_on_version_freeze() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if new.frozen_at is not null and old.frozen_at is null then
    update app.pins set status = 'FROZEN'
     where version_id = new.id and status in ('OPEN', 'WAITING', 'RESOLVED');
  end if;
  return null;
end
$$;
create trigger drawing_versions_freeze_pins after update on app.drawing_versions
  for each row execute function app.freeze_pins_on_version_freeze();

-- -----------------------------------------------------------------------------
-- Approvazione (sign-off) — FR-M2-15/16, BR-10, record immutabile
-- -----------------------------------------------------------------------------
create table app.approvals (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references app.tenants (id) on delete cascade,
  version_id             uuid not null references app.drawing_versions (id) on delete restrict,
  client_contact_id      uuid not null references app.client_contacts (id) on delete restrict,
  approved_at            timestamptz not null default now(),
  ip                     inet,
  user_agent             text,
  file_sha256            text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  declaration_text       text not null,
  declaration_version    text not null,
  otp_challenge_id       uuid not null references app.otp_challenges (id),
  verification_code      text not null unique,
  open_pins_at_approval  integer not null default 0,
  open_pins_acknowledged boolean not null default false,
  is_partial             boolean not null default false,
  unique (version_id, client_contact_id)
);
create trigger approvals_append_only before update or delete on app.approvals
  for each row execute function app.prevent_audit_mutation();

-- Richieste di modifica post-approvazione — FR-M2-17, SM-RICHIESTA-MODIFICA
create table app.change_requests (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants (id) on delete cascade,
  version_id          uuid not null references app.drawing_versions (id) on delete cascade,
  client_contact_id   uuid not null references app.client_contacts (id) on delete cascade,
  description         text not null check (char_length(description) between 5 and 5000),
  position_pct        jsonb,
  status              text not null default 'SUBMITTED' check (status in (
                        'SUBMITTED', 'IN_REVIEW', 'ACCEPTED_IN_SCOPE', 'ACCEPTED_EXTRA_SCOPE', 'REJECTED', 'CLOSED')),
  assessment_note     text,
  indicative_amount_cents bigint check (indicative_amount_cents is null or indicative_amount_cents >= 0),
  visible_to_client   boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             integer not null default 1
);
create index change_requests_version_idx on app.change_requests (version_id);
create trigger change_requests_touch before update on app.change_requests
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (BR-04) e privilegi
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'drawings', 'drawing_versions', 'drawing_pages', 'pins', 'comments', 'approvals', 'change_requests'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all to app_api
         using (tenant_id = app.current_tenant_id())
         with check (tenant_id = app.current_tenant_id())', t);
  end loop;
end
$$;

grant select, insert, update on app.drawings to app_api;
grant select, insert, update on app.drawing_versions to app_api;
grant select, insert, update on app.drawing_pages to app_api;
grant select, insert, update on app.pins to app_api;
grant select, insert, update on app.comments to app_api;
grant select, insert on app.approvals to app_api;
grant select, insert, update on app.change_requests to app_api;
