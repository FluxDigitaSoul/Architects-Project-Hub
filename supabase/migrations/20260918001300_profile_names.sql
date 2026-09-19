-- =============================================================================
-- 1300 — Nome e cognome nel profilo utente
-- claim_invitations (chiamata da /me al primo accesso) creava il profilo senza nomi e
-- provision_tenant, trovandolo già presente, non li scriveva più: il nome non compariva
-- nel team, nelle firme e nei PDF. Ora entrambe completano i campi mancanti senza
-- sovrascrivere quelli già inseriti dall'utente.
-- =============================================================================

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
  on conflict (id) do update
    set first_name = coalesce(app.user_profiles.first_name, excluded.first_name),
        last_name  = coalesce(app.user_profiles.last_name, excluded.last_name);

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

create or replace function app.claim_invitations(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 0;
  end if;

  -- Nome e cognome dai metadati della registrazione (FR-M6-01), se presenti.
  insert into app.user_profiles (id, email, first_name, last_name)
  select p_user_id, lower(p_email),
         nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
         nullif(trim(u.raw_user_meta_data ->> 'last_name'), '')
    from (select 1) one
    left join auth.users u on u.id = p_user_id
  on conflict (id) do update
    set first_name = coalesce(app.user_profiles.first_name, excluded.first_name),
        last_name  = coalesce(app.user_profiles.last_name, excluded.last_name);

  with claimed as (
    update app.memberships m
       set user_id = p_user_id, status = 'ACTIVE'
     where m.status = 'INVITED'
       and m.user_id is null
       and lower(m.invited_email) = lower(p_email)
       and not exists (
         select 1 from app.memberships x where x.tenant_id = m.tenant_id and x.user_id = p_user_id
       )
    returning m.id, m.tenant_id
  ), audited as (
    insert into app.audit_events (tenant_id, actor_type, actor_id, action, object_type, object_id, details)
    select c.tenant_id, 'USER', p_user_id::text, 'MEMBERSHIP_INVITE_ACCEPTED', 'MEMBERSHIP', c.id::text, '{}'::jsonb
      from claimed c
    returning 1
  )
  select count(*) into v_count from audited;
  return v_count;
end
$$;

-- Profili già creati senza nome: si completano dai metadati di registrazione.
update app.user_profiles p
   set first_name = coalesce(p.first_name, nullif(trim(u.raw_user_meta_data ->> 'first_name'), '')),
       last_name  = coalesce(p.last_name, nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''))
  from auth.users u
 where u.id = p.id and (p.first_name is null or p.last_name is null);
