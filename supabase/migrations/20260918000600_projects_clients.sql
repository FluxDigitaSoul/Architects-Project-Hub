-- =============================================================================
-- 0600 — Commesse, team, imprese, committenti e accesso al portale (Magic Link)
-- AFU: FR-M1-01..06, FR-M0-11, BR-03, BR-04, BR-17, BR-25, cap. 11.2 "Commessa"
-- =============================================================================

-- Impostazioni operative del tenant (FR-M0-11, BR-03 periodo di grazia, Q-03 OTP nuovo dispositivo)
alter table app.tenants
  add column settings jsonb not null default jsonb_build_object(
    'codePattern', '{YYYY}-{NNN}',
    'graceDays', 30,
    'requireOtpNewDevice', false
  );

-- -----------------------------------------------------------------------------
-- Commessa — FR-M1-01, SM-PROGETTO
-- -----------------------------------------------------------------------------
create table app.projects (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references app.tenants (id) on delete cascade,
  code                   text not null check (char_length(code) between 1 and 30),
  title                  text not null check (char_length(title) between 1 and 150),
  description            text check (description is null or char_length(description) <= 2000),
  intervention_type      text not null check (intervention_type in (
                           'NEW_BUILD', 'RENOVATION', 'EXTRAORDINARY_MAINTENANCE', 'RESTORATION',
                           'CHANGE_OF_USE', 'SPLIT_MERGE', 'ATTIC_RECOVERY', 'INTERIOR_DESIGN', 'OTHER')),
  permit_type            text check (permit_type is null or permit_type in (
                           'CILA', 'SCIA', 'SCIA_ALT_PDC', 'PDC', 'FREE', 'TBD')),
  site_address           jsonb not null,          -- {street, number, zip, city, province}
  municipality           text not null,
  geo                    jsonb,                   -- {lat, lng}
  cadastral              jsonb not null default '[]'::jsonb, -- [{sheet, parcel, sub, category}]
  altitude_m             integer,
  regulation_profile_version_id uuid,             -- FK aggiunta con il modulo R.A.I. (0800)
  start_date             date,
  end_date               date,
  status                 text not null default 'ACTIVE'
                         check (status in ('ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED')),
  tags                   text[] not null default '{}',
  cover_image_key        text,
  is_demo                boolean not null default false,
  closed_at              timestamptz,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  created_by             uuid references app.user_profiles (id),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references app.user_profiles (id),
  version                integer not null default 1,
  check (end_date is null or start_date is null or end_date >= start_date),
  check (jsonb_typeof(cadastral) = 'array')
);
create unique index projects_tenant_code_uq on app.projects (tenant_id, lower(code));
create index projects_tenant_status_idx on app.projects (tenant_id, status, updated_at desc);

create trigger projects_touch before update on app.projects
  for each row execute function app.touch_updated_at();

-- Team di commessa — BR-17: al massimo un DL attivo per commessa
create table app.project_assignments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references app.tenants (id) on delete cascade,
  project_id     uuid not null references app.projects (id) on delete cascade,
  membership_id  uuid not null references app.memberships (id) on delete cascade,
  project_role   text not null check (project_role in ('LEAD', 'DESIGNER', 'SITE_DIRECTOR', 'COLLABORATOR')),
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,
  check (valid_to is null or valid_to > valid_from)
);
create unique index project_assignments_one_director_uq
  on app.project_assignments (project_id) where project_role = 'SITE_DIRECTOR' and valid_to is null;
create unique index project_assignments_active_uq
  on app.project_assignments (project_id, membership_id, project_role) where valid_to is null;
create index project_assignments_membership_idx on app.project_assignments (membership_id) where valid_to is null;

-- Rubrica imprese del tenant e collegamento alle commesse
create table app.contractors (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 150),
  vat_number    text check (vat_number is null or vat_number ~ '^[0-9]{11}$'),
  contact_name  text,
  email         text,
  pec           text,
  phone         text,
  category      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);
create index contractors_tenant_idx on app.contractors (tenant_id, lower(name));
create trigger contractors_touch before update on app.contractors
  for each row execute function app.touch_updated_at();

create table app.project_contractors (
  tenant_id      uuid not null references app.tenants (id) on delete cascade,
  project_id     uuid not null references app.projects (id) on delete cascade,
  contractor_id  uuid not null references app.contractors (id) on delete restrict,
  created_at     timestamptz not null default now(),
  primary key (project_id, contractor_id)
);

-- -----------------------------------------------------------------------------
-- Committenti — FR-M1-01 (ripetibile, almeno 1)
-- -----------------------------------------------------------------------------
create table app.client_contacts (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references app.tenants (id) on delete cascade,
  project_id               uuid not null references app.projects (id) on delete cascade,
  kind                     text not null default 'PERSON'
                           check (kind in ('PERSON', 'COMPANY', 'CONDOMINIUM', 'PUBLIC_BODY')),
  display_name             text not null check (char_length(display_name) between 1 and 150),
  tax_id                   text,
  email                    text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                    text,
  address                  text,
  role_in_project          text check (role_in_project is null or role_in_project in (
                             'OWNER', 'CO_OWNER', 'CONDO_ADMIN', 'DELEGATE', 'OTHER')),
  is_signer                boolean not null default false,
  portal_enabled           boolean not null default true,
  privacy_acknowledged_at  timestamptz,
  email_status             text not null default 'OK' check (email_status in ('OK', 'BOUNCED')),
  removed_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  version                  integer not null default 1
);
create index client_contacts_project_idx on app.client_contacts (project_id) where removed_at is null;
create trigger client_contacts_touch before update on app.client_contacts
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Magic Link — FR-M1-05/06, SM-TOKEN, BR-03. Il token in chiaro non si salva mai.
-- -----------------------------------------------------------------------------
create table app.access_tokens (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references app.tenants (id) on delete cascade,
  project_id         uuid not null references app.projects (id) on delete cascade,
  client_contact_id  uuid not null references app.client_contacts (id) on delete cascade,
  token_hash         bytea not null unique check (octet_length(token_hash) = 32),
  kind               text not null default 'PROJECT' check (kind in ('PROJECT', 'SELF_SERVICE')),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  revoked_by         text,
  revoke_reason      text,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),
  check ((status = 'REVOKED') = (revoked_at is not null))
);
create unique index access_tokens_one_active_uq
  on app.access_tokens (client_contact_id) where status = 'ACTIVE' and kind = 'PROJECT';

-- SM-TOKEN: un token revocato o scaduto non torna mai attivo.
create or replace function app.prevent_token_reactivation() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if old.status <> 'ACTIVE' and new.status = 'ACTIVE' then
    raise exception 'TOKEN_NOT_REACTIVABLE' using errcode = 'P0001';
  end if;
  if new.token_hash <> old.token_hash then
    raise exception 'TOKEN_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger access_tokens_no_reactivation before update on app.access_tokens
  for each row execute function app.prevent_token_reactivation();

-- Sessioni del portale: cookie HttpOnly, 30 giorni con rinnovo (FR-M1-05 punto 4)
create table app.client_sessions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references app.tenants (id) on delete cascade,
  access_token_id  uuid not null references app.access_tokens (id) on delete cascade,
  session_hash     bytea not null unique check (octet_length(session_hash) = 32),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  ip_truncated     text,
  user_agent       text,
  revoked_at       timestamptz
);
create index client_sessions_token_idx on app.client_sessions (access_token_id) where revoked_at is null;

-- OTP per sign-off e nuovo dispositivo — max 5 tentativi, 10 minuti
create table app.otp_challenges (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references app.tenants (id) on delete cascade,
  client_contact_id  uuid not null references app.client_contacts (id) on delete cascade,
  purpose            text not null check (purpose in ('SIGN_OFF', 'NEW_DEVICE')),
  code_hash          bytea not null,
  expires_at         timestamptz not null,
  attempts           integer not null default 0 check (attempts between 0 and 5),
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index otp_challenges_contact_idx on app.otp_challenges (client_contact_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Risoluzione del committente senza contesto di tenant (il token arriva dal link).
-- SECURITY DEFINER: restituisce SOLO gli identificativi necessari per impostare il contesto.
-- Un token è utilizzabile se: token ACTIVE e non scaduto, contatto non rimosso e con accesso,
-- tenant ACTIVE/SUSPENDED, commessa ACTIVE/SUSPENDED oppure CLOSED entro il periodo di grazia.
-- -----------------------------------------------------------------------------
create or replace function app.resolve_portal_token(p_token_hash bytea)
returns table (token_id uuid, tenant_id uuid, project_id uuid, client_contact_id uuid)
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select a.id, a.tenant_id, a.project_id, a.client_contact_id
  from app.access_tokens a
  join app.client_contacts c on c.id = a.client_contact_id
  join app.projects p on p.id = a.project_id
  join app.tenants t on t.id = a.tenant_id
  where a.token_hash = p_token_hash
    and a.status = 'ACTIVE'
    and (a.expires_at is null or a.expires_at > now())
    and c.removed_at is null
    and c.portal_enabled
    and t.status in ('ACTIVE', 'SUSPENDED')
    and (
      p.status in ('ACTIVE', 'SUSPENDED')
      or (p.status = 'CLOSED' and p.closed_at
            + make_interval(days => coalesce((t.settings ->> 'graceDays')::int, 30)) > now())
    )
$$;

create or replace function app.resolve_portal_session(p_session_hash bytea)
returns table (session_id uuid, token_id uuid, tenant_id uuid, project_id uuid, client_contact_id uuid)
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select s.id, r.token_id, r.tenant_id, r.project_id, r.client_contact_id
  from app.client_sessions s
  join app.access_tokens a on a.id = s.access_token_id
  cross join lateral app.resolve_portal_token(a.token_hash) r
  where s.session_hash = p_session_hash
    and s.revoked_at is null
    and s.expires_at > now()
$$;

revoke all on function app.resolve_portal_token(bytea) from public;
revoke all on function app.resolve_portal_session(bytea) from public;
grant execute on function app.resolve_portal_token(bytea), app.resolve_portal_session(bytea) to app_api;

-- -----------------------------------------------------------------------------
-- RLS (BR-04) e privilegi
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'project_assignments', 'contractors', 'project_contractors',
    'client_contacts', 'access_tokens', 'client_sessions', 'otp_challenges'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all to app_api
         using (tenant_id = app.current_tenant_id())
         with check (tenant_id = app.current_tenant_id())', t);
  end loop;
end
$$;

grant select, insert, update on app.projects to app_api;
grant select, insert, update on app.project_assignments to app_api;
grant select, insert, update on app.contractors to app_api;
grant select, insert, delete on app.project_contractors to app_api;
grant select, insert, update on app.client_contacts to app_api;
grant select, insert, update on app.access_tokens to app_api;
grant select, insert, update on app.client_sessions to app_api;
grant select, insert, update on app.otp_challenges to app_api;
