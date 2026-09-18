-- =============================================================================
-- Pulizia dei dati creati dai test end-to-end dell'API (apps/api/test/app.e2e.test.ts).
-- SOLO per il progetto di TEST. Tocca esclusivamente studi con slug 'e2e-%'
-- e utenti con email 'e2e-%@example.com'.
--
-- L'audit è append-only (trigger): per i soli dati di test lo si sospende nella transazione.
-- Eseguire dallo SQL editor di Supabase (ruolo postgres).
-- =============================================================================
begin;
set local session_replication_role = replica;

delete from app.audit_events    where tenant_id in (select id from app.tenants where slug like 'e2e-%');
delete from app.memberships     where tenant_id in (select id from app.tenants where slug like 'e2e-%');
delete from app.subscriptions   where tenant_id in (select id from app.tenants where slug like 'e2e-%');
delete from app.tenant_branding where tenant_id in (select id from app.tenants where slug like 'e2e-%');
delete from app.tenants         where slug like 'e2e-%';
delete from auth.users          where email like 'e2e-%@example.com';

commit;

select (select count(*) from app.tenants where slug like 'e2e-%')  as tenants_left,
       (select count(*) from auth.users  where email like 'e2e-%') as users_left;
