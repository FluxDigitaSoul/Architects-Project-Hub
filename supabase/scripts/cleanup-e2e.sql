-- =============================================================================
-- Pulizia dei dati creati dai test end-to-end dell'API (apps/api/test/*.e2e.test.ts).
-- SOLO per il progetto di TEST. Tocca esclusivamente studi con slug 'e2e-%'
-- e utenti con email 'e2e-%@example.com'.
--
-- Registri append-only, verbali e documenti definitivi sono protetti da trigger: per i soli
-- dati di test i trigger si sospendono nella transazione (replica). In modalità replica anche
-- le cascade sono disattivate, quindi si cancella tabella per tabella tutto ciò che ha tenant_id.
-- I file dello storage (tenants/{id}/...) li rimuovono i test stessi con la chiave secret.
-- Eseguire dallo SQL editor di Supabase (ruolo postgres).
-- =============================================================================
begin;
-- SET LOCAL al livello della transazione (dentro una funzione il parametro non si può impostare).
set local session_replication_role = replica;

do $$
declare
  ids uuid[];
  t   text;
begin
  select array_agg(id) into ids from app.tenants where slug like 'e2e-%';
  if ids is null then
    return;
  end if;
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'app' and c.column_name = 'tenant_id'
       and tb.table_type = 'BASE TABLE' and c.table_name <> 'tenants'
  loop
    execute format('delete from app.%I where tenant_id = any($1)', t) using ids;
  end loop;
  delete from app.tenants where id = any(ids);
end
$$;

set local session_replication_role = origin;

-- Da qui cascade e trigger normali: auth.users elimina identità, sessioni e profili (app.user_profiles).
delete from auth.users where email like 'e2e-%@example.com';

commit;

select (select count(*) from app.tenants where slug like 'e2e-%')  as tenants_left,
       (select count(*) from auth.users  where email like 'e2e-%') as users_left;
