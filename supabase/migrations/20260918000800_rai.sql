-- =============================================================================
-- 0800 — Motore R.A.I. persistente (Modulo 3)
-- AFU: FR-M3-01..16, BR-06, BR-21 (riproducibilità), BR-22 (decimali, max 3 cifre in input)
-- I parametri dei profili hanno la forma di `RegulationProfile` di @aph/rai-engine.
-- =============================================================================

-- Profili normativi: SYSTEM (tenant_id null, forniti dalla piattaforma) o TENANT
create table app.regulation_profiles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references app.tenants (id) on delete cascade,
  scope         text not null check (scope in ('SYSTEM', 'TENANT')),
  code          text not null,
  name          text not null check (char_length(name) between 1 and 150),
  jurisdiction  text,
  is_template   boolean not null default false,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  check ((scope = 'SYSTEM') = (tenant_id is null))
);
create unique index regulation_profiles_code_uq on app.regulation_profiles (coalesce(tenant_id::text, 'SYSTEM'), code);

create table app.regulation_profile_versions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references app.tenants (id) on delete cascade,
  profile_id       uuid not null references app.regulation_profiles (id) on delete cascade,
  version_number   integer not null check (version_number >= 1),
  parameters       jsonb not null check (jsonb_typeof(parameters) = 'object'),
  legal_references text[] not null default '{}',
  valid_from       date,
  published_at     timestamptz,
  locked_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (profile_id, version_number)
);

-- BR-21: una versione pubblicata non cambia più (si può solo marcare `locked_at`).
create or replace function app.prevent_published_profile_change() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'PROFILE_VERSION_IMMUTABLE' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.published_at is not null and (
       new.parameters is distinct from old.parameters
    or new.legal_references is distinct from old.legal_references
    or new.version_number is distinct from old.version_number
    or new.published_at is distinct from old.published_at) then
    raise exception 'PROFILE_VERSION_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger regulation_profile_versions_immutable before update or delete on app.regulation_profile_versions
  for each row execute function app.prevent_published_profile_change();

alter table app.projects
  add constraint projects_regulation_profile_version_fk
  foreign key (regulation_profile_version_id) references app.regulation_profile_versions (id);

-- -----------------------------------------------------------------------------
-- Fabbricati, unità, vani, aperture, abaco, deroghe — FR-M3-02..07, FR-M3-12
-- -----------------------------------------------------------------------------
create table app.buildings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants (id) on delete cascade,
  project_id  uuid not null references app.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  address     text,
  floors      integer check (floors is null or floors between 1 and 200),
  year_built  integer check (year_built is null or year_built between 1000 and 2100),
  constraints text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);
create index buildings_project_idx on app.buildings (project_id, sort_order);
create trigger buildings_touch before update on app.buildings
  for each row execute function app.touch_updated_at();

create table app.dwelling_units (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references app.tenants (id) on delete cascade,
  building_id                   uuid not null references app.buildings (id) on delete cascade,
  name                          text not null check (char_length(name) between 1 and 100),
  floor                         text,
  cadastral                     jsonb,
  unit_type                     text not null default 'DWELLING' check (unit_type in ('DWELLING', 'STUDIO_APARTMENT', 'OTHER')),
  occupants                     integer check (occupants is null or occupants between 1 and 50),
  is_attic                      boolean not null default false,
  regulation_profile_version_id uuid references app.regulation_profile_versions (id),
  sort_order                    integer not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  version                       integer not null default 1
);
create index dwelling_units_building_idx on app.dwelling_units (building_id, sort_order);
create trigger dwelling_units_touch before update on app.dwelling_units
  for each row execute function app.touch_updated_at();

create table app.rooms (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references app.tenants (id) on delete cascade,
  unit_id                uuid not null references app.dwelling_units (id) on delete cascade,
  name                   text not null check (char_length(name) between 1 and 100),
  code                   text,
  use                    text not null,
  floor_area             numeric(9, 3) not null check (floor_area > 0),
  non_computable_area    numeric(9, 3) check (non_computable_area is null or non_computable_area >= 0),
  ceiling                jsonb not null,           -- Ceiling di @aph/rai-engine
  is_windowless          boolean not null default false,
  mechanical_ventilation text not null default 'NONE'
                         check (mechanical_ventilation in ('NONE', 'EXTRACTION', 'MVHR_CENTRAL', 'MVHR_LOCAL')),
  notes                  text,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  version                integer not null default 1,
  check (non_computable_area is null or non_computable_area < floor_area),
  check (ceiling ? 'type')
);
create index rooms_unit_idx on app.rooms (unit_id, sort_order);
create trigger rooms_touch before update on app.rooms
  for each row execute function app.touch_updated_at();

-- Abaco dei serramenti (tipi riutilizzabili nella commessa) — FR-M3-07
create table app.opening_types (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references app.tenants (id) on delete cascade,
  project_id     uuid not null references app.projects (id) on delete cascade,
  label          text not null check (char_length(label) between 1 and 20),
  kind           text not null,
  width          numeric(9, 3) not null check (width > 0),
  height         numeric(9, 3) not null check (height > 0),
  sill_height    numeric(9, 3),
  glass_width    numeric(9, 3),
  glass_height   numeric(9, 3),
  operability    text not null check (operability in ('FULL', 'PARTIAL', 'FIXED')),
  openable_area  numeric(9, 3),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  unique (project_id, label)
);
create trigger opening_types_touch before update on app.opening_types
  for each row execute function app.touch_updated_at();

create table app.openings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references app.tenants (id) on delete cascade,
  room_id               uuid not null references app.rooms (id) on delete cascade,
  opening_type_id       uuid references app.opening_types (id) on delete set null,
  label                 text not null check (char_length(label) between 1 and 30),
  kind                  text not null,
  orientation           text,
  quantity              integer not null default 1 check (quantity between 1 and 50),
  width                 numeric(9, 3) not null check (width > 0),
  height                numeric(9, 3) not null check (height > 0),
  sill_height           numeric(9, 3),
  glass_width           numeric(9, 3),
  glass_height          numeric(9, 3),
  operability           text not null check (operability in ('FULL', 'PARTIAL', 'FIXED')),
  openable_area         numeric(9, 3),
  overhang_depth        numeric(9, 3),
  faces_suitable_space  boolean not null default true,
  notes                 text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  version               integer not null default 1,
  check (operability <> 'PARTIAL' or openable_area is not null)
);
create index openings_room_idx on app.openings (room_id, sort_order);
create trigger openings_touch before update on app.openings
  for each row execute function app.touch_updated_at();

-- Deroghe motivate — FR-M3-12, BR-06 (motivazione ≥ 50 caratteri)
create table app.derogations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references app.tenants (id) on delete cascade,
  room_id          uuid references app.rooms (id) on delete cascade,
  unit_id          uuid references app.dwelling_units (id) on delete cascade,
  code             text not null check (code in ('D-01', 'D-02', 'D-03', 'D-99')),
  covers           text[] not null check (cardinality(covers) >= 1),
  justification    text not null check (char_length(justification) >= 50),
  legal_reference  text,
  created_at       timestamptz not null default now(),
  created_by       uuid references app.user_profiles (id),
  check ((room_id is null) <> (unit_id is null))
);
create index derogations_room_idx on app.derogations (room_id);

-- Snapshot immutabile del calcolo (FR-M3-16, BR-21): base delle relazioni per CILA/SCIA
create table app.rai_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants (id) on delete cascade,
  project_id          uuid not null references app.projects (id) on delete cascade,
  revision            integer not null check (revision >= 0),
  reason              text,
  profile_version_id  uuid not null references app.regulation_profile_versions (id),
  inputs              jsonb not null,
  results             jsonb not null,
  inputs_sha256       text not null check (inputs_sha256 ~ '^[0-9a-f]{64}$'),
  created_at          timestamptz not null default now(),
  created_by          uuid references app.user_profiles (id),
  unique (project_id, revision)
);
create trigger rai_snapshots_append_only before update or delete on app.rai_snapshots
  for each row execute function app.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- RLS (BR-04) e privilegi
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'buildings', 'dwelling_units', 'rooms', 'opening_types', 'openings', 'derogations', 'rai_snapshots'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all to app_api
         using (tenant_id = app.current_tenant_id())
         with check (tenant_id = app.current_tenant_id())', t);
  end loop;
end
$$;

-- Profili: i SYSTEM si leggono da tutti i tenant; i TENANT solo dal proprio.
alter table app.regulation_profiles enable row level security;
alter table app.regulation_profile_versions enable row level security;

create policy read_system_or_own on app.regulation_profiles for select to app_api
  using (tenant_id is null or tenant_id = app.current_tenant_id());
create policy write_own on app.regulation_profiles for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id() and scope = 'TENANT');

create policy read_system_or_own on app.regulation_profile_versions for select to app_api
  using (tenant_id is null or tenant_id = app.current_tenant_id());
create policy write_own on app.regulation_profile_versions for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

grant select, insert, update on app.regulation_profiles to app_api;
grant select, insert, update on app.regulation_profile_versions to app_api;
grant select, insert, update, delete on app.buildings to app_api;
grant select, insert, update, delete on app.dwelling_units to app_api;
grant select, insert, update, delete on app.rooms to app_api;
grant select, insert, update, delete on app.opening_types to app_api;
grant select, insert, update, delete on app.openings to app_api;
grant select, insert, delete on app.derogations to app_api;
grant select, insert on app.rai_snapshots to app_api;
