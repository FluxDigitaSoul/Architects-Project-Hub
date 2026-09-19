-- =============================================================================
-- 1100 — Inviti dei membri dello studio (FR-M0-08)
-- L'Owner invita per email: nasce una membership INVITED con invited_email.
-- Al primo accesso l'utente "rivendica" gli inviti con la propria email verificata (da Supabase Auth).
-- SECURITY DEFINER: si esegue prima che esista un contesto di tenant.
-- =============================================================================

create index if not exists memberships_invited_email_idx
  on app.memberships (lower(invited_email)) where status = 'INVITED';

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

  insert into app.user_profiles (id, email)
  values (p_user_id, lower(p_email))
  on conflict (id) do nothing;

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

revoke all on function app.claim_invitations(uuid, text) from public;
grant execute on function app.claim_invitations(uuid, text) to app_api;
