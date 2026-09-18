-- =============================================================================
-- 0100 — Fondamenta multi-tenant (ADR-004)
-- AFU: BR-04 (isolamento), BR-12 (almeno un Owner), FR-MT-07 (audit), cap. 11
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is 'Tabelle applicative del Project Hub. NON esposto dalle Data API di Supabase.';

-- -----------------------------------------------------------------------------
-- Ruolo applicativo usato da NestJS. Soggetto a RLS (NOBYPASSRLS).
-- La password/login si imposta fuori dalle migrazioni (vedi README, sezione Database):
--   alter role app_api with login password '...';
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api nologin nobypassrls;
  end if;
end
$$;

revoke all on schema app from public;
grant usage on schema app to app_api;

-- Le Data API di Supabase usano i ruoli anon/authenticated: nessun accesso allo schema app.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema app from authenticated';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Contesto di sessione: impostato da NestJS per transazione con
--   select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)
-- Se non impostato → NULL → le policy non restituiscono righe (fail-closed).
-- -----------------------------------------------------------------------------
create or replace function app.current_tenant_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app.current_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Tipi enumerati (allineati a @aph/contracts)
-- -----------------------------------------------------------------------------
create type app.tenant_status as enum ('ACTIVE', 'SUSPENDED', 'CLOSING', 'DELETED');
create type app.membership_role as enum ('OWNER', 'ARCHITECT', 'COLLABORATOR');
create type app.membership_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- -----------------------------------------------------------------------------
-- Tenant (studio) — FR-M0-01/02
-- -----------------------------------------------------------------------------
create table app.tenants (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                        check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
  name                  text not null check (char_length(name) between 1 and 150),
  status                app.tenant_status not null default 'ACTIVE',
  legal_form            text,
  vat_number            text check (vat_number is null or vat_number ~ '^[0-9]{11}$'),
  tax_code              text,
  legal_address         jsonb,
  email                 text,
  pec                   text,
  phone                 text,
  website               text,
  legal_representative  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  version               integer not null default 1
);
comment on table app.tenants is 'Studi (tenant). Unità di isolamento dei dati (BR-04).';

create trigger tenants_touch before update on app.tenants
  for each row execute function app.touch_updated_at();

-- Branding white-label — FR-M0-03/04
create table app.tenant_branding (
  tenant_id        uuid primary key references app.tenants (id) on delete cascade,
  logo_keys        jsonb not null default '{}'::jsonb,
  primary_color    text not null default '#1F2937' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color  text check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  portal_theme     text not null default 'LIGHT' check (portal_theme in ('LIGHT', 'DARK', 'AUTO')),
  document_settings jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  version          integer not null default 1
);

create trigger tenant_branding_touch before update on app.tenant_branding
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Profili utente (utenti dello studio). L'identità è di Supabase Auth (ADR-003).
-- -----------------------------------------------------------------------------
create table app.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  first_name  text,
  last_name   text,
  title       text,
  phone       text,
  locale      text not null default 'it-IT',
  timezone    text not null default 'Europe/Rome',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create trigger user_profiles_touch before update on app.user_profiles
  for each row execute function app.touch_updated_at();

-- Membership utente ↔ tenant con ruolo — FR-M0-08, cap. 2
create table app.memberships (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references app.tenants (id) on delete cascade,
  user_id                uuid references app.user_profiles (id) on delete restrict,
  role                   app.membership_role not null,
  status                 app.membership_status not null default 'INVITED',
  invited_email          text,
  invited_at             timestamptz,
  professional_order     text,
  registration_number    text,
  registration_section   text,
  signature_image_key    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  version                integer not null default 1,
  unique (tenant_id, user_id),
  check (user_id is not null or invited_email is not null)
);
create index memberships_user_idx on app.memberships (user_id);

create trigger memberships_touch before update on app.memberships
  for each row execute function app.touch_updated_at();

-- BR-12: ogni tenant attivo deve avere almeno un Owner attivo.
-- Constraint trigger differito: permette il passaggio di proprietà nella stessa transazione.
create or replace function app.enforce_last_owner() returns trigger
language plpgsql
as $$
declare
  v_tenant uuid := coalesce(old.tenant_id, new.tenant_id);
begin
  if exists (select 1 from app.tenants t where t.id = v_tenant and t.status = 'ACTIVE')
     and not exists (
       select 1 from app.memberships m
       where m.tenant_id = v_tenant and m.role = 'OWNER' and m.status = 'ACTIVE'
     ) then
    raise exception 'LAST_OWNER' using errcode = 'P0001',
      detail = 'Ogni studio deve avere almeno un Owner attivo (BR-12).';
  end if;
  return null;
end
$$;

create constraint trigger memberships_last_owner
  after update or delete on app.memberships
  deferrable initially deferred
  for each row execute function app.enforce_last_owner();

-- Operatori della piattaforma (Platform Admin) — ACT-01
create table app.platform_admins (
  user_id    uuid primary key references app.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Audit log append-only — FR-MT-07
-- -----------------------------------------------------------------------------
create table app.audit_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid references app.tenants (id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  actor_type    text not null check (actor_type in ('USER', 'CLIENT', 'SYSTEM', 'PLATFORM_ADMIN')),
  actor_id      text,
  on_behalf_of  text,
  action        text not null,
  object_type   text,
  object_id     text,
  outcome       text not null default 'SUCCESS' check (outcome in ('SUCCESS', 'FAILURE', 'DENIED')),
  ip            inet,
  user_agent    text,
  request_id    text,
  details       jsonb not null default '{}'::jsonb
);
create index audit_events_tenant_time_idx on app.audit_events (tenant_id, occurred_at desc);

create or replace function app.prevent_audit_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDIT_APPEND_ONLY' using errcode = 'P0001',
    detail = 'Il registro di audit non si modifica né si cancella (FR-MT-07).';
end
$$;

create trigger audit_events_append_only
  before update or delete on app.audit_events
  for each row execute function app.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- Row-Level Security (BR-04)
-- RLS abilitata (non forzata): il proprietario delle tabelle è solo il ruolo delle
-- migrazioni/funzioni SECURITY DEFINER; l'API usa app_api, sempre soggetto alle policy.
-- -----------------------------------------------------------------------------
alter table app.tenants enable row level security;
alter table app.tenant_branding enable row level security;
alter table app.user_profiles enable row level security;
alter table app.memberships enable row level security;
alter table app.platform_admins enable row level security;
alter table app.audit_events enable row level security;

create policy tenant_isolation on app.tenants
  for all to app_api
  using (id = app.current_tenant_id())
  with check (id = app.current_tenant_id());

create policy tenant_isolation on app.tenant_branding
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy tenant_isolation on app.memberships
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy tenant_isolation on app.audit_events
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- Profili: il proprio, e quelli dei membri del tenant corrente (per mostrare il team).
create policy own_or_same_tenant on app.user_profiles
  for select to app_api
  using (
    id = app.current_user_id()
    or exists (
      select 1 from app.memberships m
      where m.user_id = user_profiles.id and m.tenant_id = app.current_tenant_id()
    )
  );

create policy own_profile_write on app.user_profiles
  for update to app_api
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

create policy self_lookup on app.platform_admins
  for select to app_api
  using (user_id = app.current_user_id());

-- -----------------------------------------------------------------------------
-- Privilegi del ruolo applicativo
-- -----------------------------------------------------------------------------
grant select, update on app.tenants to app_api;
grant select, insert, update on app.tenant_branding to app_api;
grant select, update on app.user_profiles to app_api;
grant select, insert, update, delete on app.memberships to app_api;
grant select on app.platform_admins to app_api;
grant select, insert on app.audit_events to app_api;
grant execute on function app.current_tenant_id(), app.current_user_id() to app_api;
