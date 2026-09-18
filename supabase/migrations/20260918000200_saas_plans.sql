-- =============================================================================
-- 0200 — Piani, abbonamenti, entitlements, consumi, documenti legali
-- AFU: FR-M6-05 (catalogo piani ed entitlements), FR-M6-09 (consumi),
--      FR-M6-17 (accettazioni legali), BR-28, BR-29, BR-30, cap. 11
-- =============================================================================

create type app.subscription_status as enum
  ('TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED', 'PAUSED');
create type app.legal_document_type as enum ('TOS', 'DPA', 'PRIVACY');

-- -----------------------------------------------------------------------------
-- Catalogo piani (globale, non per tenant)
-- -----------------------------------------------------------------------------
create table app.plans (
  code        text primary key check (code ~ '^[A-Z_]{2,32}$'),
  name        text not null,
  is_public   boolean not null default true,
  sort_order  integer not null default 0
);

create table app.plan_versions (
  id                   uuid primary key default gen_random_uuid(),
  plan_code            text not null references app.plans (code),
  version              integer not null check (version > 0),
  -- Forma: { "limits": { "<LimitKey>": number|null }, "features": { "<FeatureKey>": boolean } }
  entitlements         jsonb not null check (
                         jsonb_typeof(entitlements -> 'limits') = 'object'
                         and jsonb_typeof(entitlements -> 'features') = 'object'
                       ),
  price_monthly_cents  integer check (price_monthly_cents >= 0),
  price_yearly_cents   integer check (price_yearly_cents >= 0),
  currency             char(3) not null default 'EUR',
  trial_days           integer check (trial_days between 1 and 365),
  stripe_price_ids     jsonb not null default '{}'::jsonb,
  published_at         timestamptz,
  retired_at           timestamptz,
  unique (plan_code, version)
);

-- Grandfathering: una versione pubblicata non cambia più contenuto né prezzi.
create or replace function app.prevent_published_plan_change() returns trigger
language plpgsql
as $$
begin
  if old.published_at is not null and (
       new.entitlements is distinct from old.entitlements
    or new.price_monthly_cents is distinct from old.price_monthly_cents
    or new.price_yearly_cents is distinct from old.price_yearly_cents
    or new.trial_days is distinct from old.trial_days
    or new.plan_code is distinct from old.plan_code
    or new.version is distinct from old.version
  ) then
    raise exception 'PLAN_VERSION_IMMUTABLE' using errcode = 'P0001',
      detail = 'Una versione di piano pubblicata è immutabile: crea una nuova versione.';
  end if;
  return new;
end
$$;

create trigger plan_versions_immutable before update on app.plan_versions
  for each row execute function app.prevent_published_plan_change();

-- -----------------------------------------------------------------------------
-- Abbonamento corrente del tenant
-- -----------------------------------------------------------------------------
create table app.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null unique references app.tenants (id) on delete cascade,
  plan_version_id         uuid not null references app.plan_versions (id),
  status                  app.subscription_status not null,
  billing_interval        text check (billing_interval in ('MONTHLY', 'YEARLY')),
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  early_adopter_lock      jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  version                 integer not null default 1,
  check (status <> 'TRIALING' or trial_ends_at is not null)
);

create trigger subscriptions_touch before update on app.subscriptions
  for each row execute function app.touch_updated_at();

-- Override dei diritti per singolo tenant (partner Beta, accordi speciali)
create table app.entitlement_overrides (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  reason      text not null check (char_length(reason) >= 5),
  granted_by  uuid references app.user_profiles (id),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index entitlement_overrides_tenant_idx on app.entitlement_overrides (tenant_id);

-- Contatori di consumo (ricalcolabili) — FR-M6-09
create table app.usage_counters (
  tenant_id        uuid not null references app.tenants (id) on delete cascade,
  metric           text not null check (metric in ('SEATS', 'ACTIVE_PROJECTS', 'STORAGE_BYTES', 'AI_MINUTES')),
  period           text not null check (period = 'LIFETIME' or period ~ '^[0-9]{4}-[0-9]{2}$'),
  value            bigint not null default 0 check (value >= 0),
  recalculated_at  timestamptz,
  primary key (tenant_id, metric, period)
);

-- -----------------------------------------------------------------------------
-- Documenti legali e accettazioni (clickwrap) — FR-M6-17
-- -----------------------------------------------------------------------------
create table app.legal_documents (
  type          app.legal_document_type not null,
  version       text not null,
  url           text not null,
  published_at  timestamptz not null default now(),
  primary key (type, version)
);

create table app.legal_acceptances (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references app.user_profiles (id) on delete cascade,
  tenant_id         uuid references app.tenants (id) on delete cascade,
  document_type     app.legal_document_type not null,
  document_version  text not null,
  accepted_at       timestamptz not null default now(),
  ip                inet,
  foreign key (document_type, document_version) references app.legal_documents (type, version)
);

create trigger legal_acceptances_append_only
  before update or delete on app.legal_acceptances
  for each row execute function app.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table app.plans enable row level security;
alter table app.plan_versions enable row level security;
alter table app.subscriptions enable row level security;
alter table app.entitlement_overrides enable row level security;
alter table app.usage_counters enable row level security;
alter table app.legal_documents enable row level security;
alter table app.legal_acceptances enable row level security;

-- Cataloghi pubblici in sola lettura
create policy catalog_read on app.plans for select to app_api using (true);
create policy catalog_read on app.plan_versions for select to app_api using (published_at is not null);
create policy catalog_read on app.legal_documents for select to app_api using (true);

create policy tenant_isolation on app.subscriptions
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy tenant_isolation on app.entitlement_overrides
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy tenant_isolation on app.usage_counters
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy own_acceptances on app.legal_acceptances
  for all to app_api
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id()
              and (tenant_id is null or tenant_id = app.current_tenant_id()));

grant select on app.plans, app.plan_versions, app.legal_documents to app_api;
-- BR-30: lo stato dell'abbonamento cambia solo tramite eventi verificati gestiti dal backend.
grant select, update on app.subscriptions to app_api;
grant select on app.entitlement_overrides to app_api;
grant select, insert, update on app.usage_counters to app_api;
grant select, insert on app.legal_acceptances to app_api;

-- -----------------------------------------------------------------------------
-- Catalogo iniziale (AFU cap. 15.2, valori da confermare in Q-24)
-- -----------------------------------------------------------------------------
insert into app.plans (code, name, is_public, sort_order) values
  ('TRIAL',        'Prova gratuita',                 false, 0),
  ('SOLO',         'Architetto Solo',                true,  10),
  ('PRO',          'Studio Pro',                     true,  20),
  ('ENTERPRISE',   'Studio Enterprise / Multi-sede', true,  30),
  ('BETA_PARTNER', 'Partner Beta',                   false, 99);

insert into app.plan_versions
  (plan_code, version, entitlements, price_monthly_cents, price_yearly_cents, trial_days, published_at)
values
  ('TRIAL', 1, '{
     "limits":   {"seats.max": 3, "projects.active.max": null, "storage.bytes.max": 5368709120,
                  "ai.minutes.month.max": 60, "clients.per_project.max": 10},
     "features": {"whitelabel.full": true, "custom_domain": false, "email_sender_domain": false,
                  "rai.module": true, "ai.transcription": true, "advanced_roles": true,
                  "badge.removable": false, "support.priority": false}
   }', 0, 0, 30, now()),
  ('SOLO', 1, '{
     "limits":   {"seats.max": 1, "projects.active.max": 3, "storage.bytes.max": 10737418240,
                  "ai.minutes.month.max": 60, "clients.per_project.max": 5},
     "features": {"whitelabel.full": false, "custom_domain": false, "email_sender_domain": false,
                  "rai.module": true, "ai.transcription": true, "advanced_roles": false,
                  "badge.removable": false, "support.priority": false}
   }', 4900, 49000, null, now()),
  ('PRO', 1, '{
     "limits":   {"seats.max": 3, "projects.active.max": null, "storage.bytes.max": 53687091200,
                  "ai.minutes.month.max": 300, "clients.per_project.max": 20},
     "features": {"whitelabel.full": true, "custom_domain": false, "email_sender_domain": true,
                  "rai.module": true, "ai.transcription": true, "advanced_roles": true,
                  "badge.removable": true, "support.priority": false}
   }', 9900, 99000, null, now()),
  ('ENTERPRISE', 1, '{
     "limits":   {"seats.max": null, "projects.active.max": null, "storage.bytes.max": 214748364800,
                  "ai.minutes.month.max": 1000, "clients.per_project.max": null},
     "features": {"whitelabel.full": true, "custom_domain": true, "email_sender_domain": true,
                  "rai.module": true, "ai.transcription": true, "advanced_roles": true,
                  "badge.removable": true, "support.priority": true}
   }', 19900, null, null, now()),
  ('BETA_PARTNER', 1, '{
     "limits":   {"seats.max": null, "projects.active.max": null, "storage.bytes.max": 107374182400,
                  "ai.minutes.month.max": 1000, "clients.per_project.max": null},
     "features": {"whitelabel.full": true, "custom_domain": true, "email_sender_domain": true,
                  "rai.module": true, "ai.transcription": true, "advanced_roles": true,
                  "badge.removable": true, "support.priority": true}
   }', 0, 0, null, now());
