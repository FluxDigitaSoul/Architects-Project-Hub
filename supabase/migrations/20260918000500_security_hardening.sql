-- =============================================================================
-- 0500 — Hardening dopo i controlli di sicurezza di Supabase (database linter)
-- - search_path fisso su tutte le funzioni dello schema app (lint 0011)
-- - nessun EXECUTE per anon/authenticated su funzioni SECURITY DEFINER di piattaforma (lint 0028/0029)
-- =============================================================================

alter function app.current_tenant_id() set search_path = app, pg_temp;
alter function app.current_user_id() set search_path = app, pg_temp;
alter function app.touch_updated_at() set search_path = app, pg_temp;
alter function app.enforce_last_owner() set search_path = app, pg_temp;
alter function app.prevent_audit_mutation() set search_path = app, pg_temp;
alter function app.prevent_published_plan_change() set search_path = app, pg_temp;
alter function app.is_reserved_slug(text) set search_path = app, pg_temp;

-- Funzione creata dalla piattaforma Supabase per l'attivazione automatica di RLS:
-- è usata da un event trigger e non deve essere richiamabile via /rest/v1/rpc.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end
$$;
