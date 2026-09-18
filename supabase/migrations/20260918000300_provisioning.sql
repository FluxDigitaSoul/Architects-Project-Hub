-- =============================================================================
-- 0300 — Funzioni SECURITY DEFINER per le operazioni che attraversano i tenant
-- AFU: FR-M6-02 / BR-26 (provisioning atomico), FR-MT-03 (selezione tenant),
--      NFR-BRAND-03 (contesto pubblico per host)
-- Regole: search_path fissato, input validati, output minimali, EXECUTE solo ad app_api.
-- =============================================================================

create or replace function app.is_reserved_slug(p_slug text) returns boolean
language sql immutable
as $$
  select p_slug = any (array[
    'www', 'app', 'api', 'admin', 'mail', 'static', 'cdn', 'status', 'help', 'docs',
    'portal', 'auth', 'billing', 'support'
  ])
$$;

-- -----------------------------------------------------------------------------
-- Provisioning di un nuovo studio (self-service o dal back-office) — BR-26
-- Crea in un'unica transazione: profilo utente (se manca), tenant, branding,
-- membership Owner, abbonamento (trial o piano indicato), evento di audit.
-- Errori: SLUG_INVALID, SLUG_UNAVAILABLE, PLAN_NOT_AVAILABLE (SQLSTATE P0001).
-- -----------------------------------------------------------------------------
create or replace function app.provision_tenant(
  p_user_id      uuid,
  p_email        text,
  p_first_name   text,
  p_last_name    text,
  p_studio_name  text,
  p_slug         text,
  p_plan_code    text default 'TRIAL',
  p_request_id   text default null
) returns uuid
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  v_tenant_id     uuid := gen_random_uuid();
  v_plan_version  app.plan_versions%rowtype;
begin
  if p_slug is null
     or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'
     or app.is_reserved_slug(p_slug) then
    raise exception 'SLUG_INVALID' using errcode = 'P0001';
  end if;

  if exists (select 1 from app.tenants where slug = p_slug) then
    raise exception 'SLUG_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select pv.* into v_plan_version
  from app.plan_versions pv
  where pv.plan_code = p_plan_code
    and pv.published_at is not null
    and pv.retired_at is null
  order by pv.version desc
  limit 1;

  if not found then
    raise exception 'PLAN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into app.user_profiles (id, email, first_name, last_name)
  values (p_user_id, p_email, p_first_name, p_last_name)
  on conflict (id) do nothing;

  begin
    insert into app.tenants (id, slug, name) values (v_tenant_id, p_slug, p_studio_name);
  exception when unique_violation then
    raise exception 'SLUG_UNAVAILABLE' using errcode = 'P0001';
  end;

  insert into app.tenant_branding (tenant_id) values (v_tenant_id);

  insert into app.memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, p_user_id, 'OWNER', 'ACTIVE');

  insert into app.subscriptions (tenant_id, plan_version_id, status, trial_ends_at)
  values (
    v_tenant_id,
    v_plan_version.id,
    case when v_plan_version.trial_days is not null then 'TRIALING' else 'ACTIVE' end::app.subscription_status,
    case when v_plan_version.trial_days is not null
         then now() + make_interval(days => v_plan_version.trial_days) end
  );

  insert into app.audit_events (tenant_id, actor_type, actor_id, action, object_type, object_id, request_id, details)
  values (
    v_tenant_id, 'USER', p_user_id::text, 'TENANT_PROVISIONED', 'TENANT', v_tenant_id::text, p_request_id,
    jsonb_build_object('slug', p_slug, 'plan', p_plan_code, 'planVersion', v_plan_version.version)
  );

  return v_tenant_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Contesto pubblico del tenant per host/slug (pagine di accesso, branding) — NFR-BRAND-03
-- Restituisce SOLO dati pubblici; NULL se il tenant non esiste o non è servibile.
-- -----------------------------------------------------------------------------
create or replace function app.public_tenant_context(p_slug text) returns jsonb
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select jsonb_build_object(
    'tenantId', t.id,
    'slug', t.slug,
    'name', t.name,
    'status', t.status,
    'branding', jsonb_build_object(
      'logoKeys', b.logo_keys,
      'primaryColor', b.primary_color,
      'secondaryColor', b.secondary_color,
      'portalTheme', b.portal_theme
    )
  )
  from app.tenants t
  join app.tenant_branding b on b.tenant_id = t.id
  where t.slug = p_slug
    and t.status in ('ACTIVE', 'SUSPENDED')
$$;

-- -----------------------------------------------------------------------------
-- Studi di cui l'utente è membro attivo (selezione del tenant) — FR-MT-03
-- -----------------------------------------------------------------------------
create or replace function app.list_user_tenants(p_user_id uuid)
returns table (tenant_id uuid, slug text, name text, role app.membership_role)
language sql stable
security definer
set search_path = app, pg_temp
as $$
  select t.id, t.slug, t.name, m.role
  from app.memberships m
  join app.tenants t on t.id = m.tenant_id
  where m.user_id = p_user_id
    and m.status = 'ACTIVE'
    and t.status in ('ACTIVE', 'SUSPENDED')
  order by t.name
$$;

revoke all on function app.provision_tenant(uuid, text, text, text, text, text, text, text) from public;
revoke all on function app.public_tenant_context(text) from public;
revoke all on function app.list_user_tenants(uuid) from public;
revoke all on function app.is_reserved_slug(text) from public;

grant execute on function app.provision_tenant(uuid, text, text, text, text, text, text, text) to app_api;
grant execute on function app.public_tenant_context(text) to app_api;
grant execute on function app.list_user_tenants(uuid) to app_api;
