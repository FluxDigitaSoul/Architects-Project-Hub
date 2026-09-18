# ADR-004 — Multi-tenancy con schema condiviso + RLS, migrazioni SQL-first, Kysely

**Stato:** Accettato · **Data:** 2026-09-18 · **Collegato a:** AFU BR-04, BR-26, BR-28, V-03, cap. 11

## Contesto

L'isolamento tra studi è il requisito più importante del prodotto (BR-04): nessun dato di un tenant deve essere visibile a un altro, nemmeno per un bug applicativo. Il database è PostgreSQL gestito su Supabase. Supabase espone di default lo schema `public` tramite le sue Data API (PostgREST), pensate per l'accesso diretto dal browser: nel nostro caso **tutto l'accesso ai dati passa da NestJS**.

## Decisione

### Modello di tenancy
- **Database condiviso, schema condiviso**: ogni tabella di dominio ha `tenant_id uuid not null`.
- **Row-Level Security attiva e forzata** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) su tutte le tabelle con `tenant_id`, con policy basate su `app.current_tenant_id()`, che legge l'impostazione di sessione `app.tenant_id`.
- NestJS apre **una transazione per richiesta** e imposta il tenant con `select set_config('app.tenant_id', $1, true)` (valido solo per la transazione, quindi sicuro anche con il connection pooler in modalità transaction).
- Se `app.tenant_id` non è impostato, **le policy non restituiscono nessuna riga** (fail-closed).

### Schema e ruoli
- Tabelle applicative nello schema **`app`**, **non esposto** dalle Data API di Supabase; `anon` e `authenticated` non hanno alcun privilegio su `app`.
- Ruolo applicativo **`app_api`** (`NOBYPASSRLS`), usato da NestJS per il traffico dei tenant: CRUD sulle tabelle di dominio, **nessun** `UPDATE`/`DELETE` sull'audit log (append-only).
- Le operazioni che per natura attraversano i tenant (provisioning di un nuovo studio, risoluzione del tenant dall'host, console del Platform Admin) passano da **funzioni `SECURITY DEFINER`** dedicate e minimali, con `search_path` fissato, invece di dare privilegi ampi al ruolo applicativo.

### Migrazioni e accesso ai dati
- **SQL-first:** le migrazioni sono file SQL versionati in `supabase/migrations`, applicati con Supabase CLI. RLS, policy, trigger e funzioni sono SQL: scriverli direttamente evita astrazioni che li nasconderebbero.
- **Query dal backend con Kysely** (query builder tipizzato, nessuna "magia" ORM), tipi generati dallo schema.
- Il codice resta **PostgreSQL standard**: niente dipendenze dalle API proprietarie di Supabase per i dati, così una migrazione futura ad Amazon RDS resta possibile.

## Alternative considerate

| Alternativa | Perché no |
|-------------|-----------|
| Un database o uno schema per tenant | Isolamento fisico migliore, ma migrazioni e operatività moltiplicate per ogni studio; sproporzionato per centinaia di piccoli tenant |
| Solo filtro applicativo (`where tenant_id = …`) | Un solo bug basta per un data leak; manca la seconda barriera richiesta da BR-04 |
| Prisma | Supporto a RLS e `SET LOCAL` per transazione scomodo; lo schema Prisma duplicherebbe il SQL delle migrazioni |
| TypeORM | Pattern ORM pesanti, migrazioni generate poco controllabili |
| Drizzle | Valida alternativa a Kysely; scelto Kysely per l'approccio "SQL-first puro" (le migrazioni restano SQL scritto a mano) |
| Accesso diretto dal browser a Supabase (PostgREST + RLS su `auth.uid()`) | Sposterebbe logica di business e controllo degli entitlements nel client/DB; il modello di permessi (ruoli per commessa, committenti senza account) è più chiaro nel backend |

## Conseguenze

- Ogni nuova tabella di dominio **deve** avere `tenant_id`, RLS abilitata e forzata e la policy standard: è un punto della checklist di code review. Un test d'integrazione verifica che non esistano tabelle in `app` con `tenant_id` senza RLS.
- I test di isolamento girano su **Postgres reale** (container Docker in locale e in CI) con uno "shim" minimo degli schemi di Supabase.
- Serve una stringa di connessione dedicata con l'utente `app_api` (non `postgres`, né la service role).
