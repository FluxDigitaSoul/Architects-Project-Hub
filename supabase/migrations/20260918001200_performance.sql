-- =============================================================================
-- 1200 — Prestazioni (Supabase performance advisor)
-- - indice su tenant_id per ogni tabella del tenant: serve sia alle FK sia al filtro RLS (BR-04);
-- - indici sulle FK usate nelle join e nelle cancellazioni a cascata;
-- - una sola policy permissiva per azione sui profili normativi.
-- =============================================================================

do $$
declare
  t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'app' and c.column_name = 'tenant_id' and tb.table_type = 'BASE TABLE'
       and not exists (
         select 1 from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
          where i.indrelid = format('app.%I', c.table_name)::regclass and a.attname = 'tenant_id'
       )
  loop
    execute format('create index if not exists %I on app.%I (tenant_id)', t || '_tenant_idx', t);
  end loop;
end
$$;

create index if not exists access_tokens_project_idx          on app.access_tokens (project_id);
create index if not exists approvals_contact_idx               on app.approvals (client_contact_id);
create index if not exists approvals_otp_idx                   on app.approvals (otp_challenge_id);
create index if not exists change_requests_contact_idx         on app.change_requests (client_contact_id);
create index if not exists derogations_unit_idx                on app.derogations (unit_id) where unit_id is not null;
create index if not exists documents_source_idx                on app.documents (source_type, source_id);
create index if not exists documents_signer_idx                on app.documents (signer_membership_id) where signer_membership_id is not null;
create index if not exists dwelling_units_profile_idx          on app.dwelling_units (regulation_profile_version_id) where regulation_profile_version_id is not null;
create index if not exists open_actions_source_item_idx        on app.open_actions (source_item_id);
create index if not exists open_actions_resolved_visit_idx     on app.open_actions (resolved_in_visit_id) where resolved_in_visit_id is not null;
create index if not exists openings_type_idx                   on app.openings (opening_type_id) where opening_type_id is not null;
create index if not exists pins_page_idx                       on app.pins (page_id);
create index if not exists pins_transferred_from_idx           on app.pins (transferred_from_pin_id) where transferred_from_pin_id is not null;
create index if not exists project_contractors_contractor_idx  on app.project_contractors (contractor_id);
create index if not exists projects_profile_version_idx        on app.projects (regulation_profile_version_id) where regulation_profile_version_id is not null;
create index if not exists rai_snapshots_profile_idx           on app.rai_snapshots (profile_version_id);
create index if not exists site_visits_director_idx            on app.site_visits (director_membership_id);
create index if not exists site_visits_replaces_idx            on app.site_visits (replaces_visit_id) where replaces_visit_id is not null;
create index if not exists structured_drafts_visit_idx         on app.structured_drafts (visit_id);
create index if not exists subscriptions_plan_version_idx      on app.subscriptions (plan_version_id);
create index if not exists visit_photos_derived_idx            on app.visit_photos (derived_from_photo_id) where derived_from_photo_id is not null;
create index if not exists legal_acceptances_user_idx          on app.legal_acceptances (user_id);
create index if not exists legal_acceptances_document_idx      on app.legal_acceptances (document_type, document_version);

-- Profili normativi: lettura con una sola policy; scrittura con policy separate per insert/update/delete.
drop policy if exists write_own on app.regulation_profiles;
create policy insert_own on app.regulation_profiles for insert to app_api
  with check (tenant_id = app.current_tenant_id() and scope = 'TENANT');
create policy update_own on app.regulation_profiles for update to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id() and scope = 'TENANT');
create policy delete_own on app.regulation_profiles for delete to app_api
  using (tenant_id = app.current_tenant_id());

drop policy if exists write_own on app.regulation_profile_versions;
create policy insert_own on app.regulation_profile_versions for insert to app_api
  with check (tenant_id = app.current_tenant_id());
create policy update_own on app.regulation_profile_versions for update to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy delete_own on app.regulation_profile_versions for delete to app_api
  using (tenant_id = app.current_tenant_id());
