# Roadmap di sviluppo — backend first

Piano operativo che traduce l'AFU ([docs/afu](../afu/README.md)) in step di sviluppo verificabili. Ogni step:

- chiude un insieme preciso di requisiti (ID dell'AFU);
- si conclude con **test verdi** e un **commit dedicato** (Conventional Commits);
- aggiorna lo stato in questa pagina.

**Legenda stato:** ⬜ da fare · 🟨 in corso · ✅ fatto · ⏸️ in attesa di input (es. credenziali)

---

## Fase A — Fondamenta backend e database

| Step   | Contenuto                                                                                                                                                                                                                                                        | Requisiti AFU                                        | Stato              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------ |
| **A0** | AFU v0.2 (SaaS self-service, Modulo 6, business), ADR iniziali, questa roadmap                                                                                                                                                                                   | cap. 15, M6, ADR-001/003/004                         | ✅                 |
| **A1** | Monorepo npm workspaces, TypeScript strict, lint/format, test runner, CI GitHub Actions; scheletro NestJS `apps/api` con config validata, health check, log strutturati, id di richiesta, formato d'errore uniforme                                              | NFR-OBS-01, NFR-MAINT-05, NFR-SEC-10, FR-MT-18       | ✅ (CI GitHub Actions ancora da fare) |
| **A2** | `packages/rai-engine`: motore di calcolo R.A.I. puro, aritmetica decimale, corpus di regressione TC-R-01..18                                                                                                                                                     | FR-M3-05/08/10/12/13/14, BR-02, BR-22                | ✅                 |
| **A3** | `packages/contracts`: codici d'errore delle BR, enum di dominio, chiavi degli entitlements                                                                                                                                                                       | cap. 6, FR-M6-05                                     | ✅                 |
| **A4** | Migrazioni DB di base (applicate al progetto cloud il 2026-09-18, linter di sicurezza pulito): schema `app`, ruoli, tenant, profili utente, membership, piani/versioni/abbonamenti/override/consumi, accettazioni legali, audit append-only, RLS, funzione di provisioning atomico, seed dei piani; test di isolamento su Postgres reale | BR-04, BR-12, BR-26, BR-28, FR-M6-02/05/17, FR-MT-07 | ✅                 |
| **A5** | Accesso ai dati in NestJS: pool Postgres, transazione per richiesta con contesto tenant (`SET LOCAL`), modulo `database`                                                                                                                                         | BR-04, ADR-004                                       | ✅ |
| **A6** | Autenticazione: verifica JWT Supabase (JWKS), risoluzione del tenant dall'host, guard di membership e ruolo (RBAC/ABAC)                                                                                                                                          | FR-MT-01..03, cap. 2                                 | ✅ (JWKS ES256, tenant da sottodominio o header `X-Tenant-Slug`, 404 per chi non è membro) |
| **A7** | Modulo `entitlements` (servizio + guard), contatori di consumo                                                                                                                                                                                                   | FR-M6-05/09, BR-28/29                                | ✅ servizio (`EntitlementsService`); contatori di consumo con B1 |
| **A8** | Onboarding: `POST /onboarding/tenants` (provisioning), `GET /public/tenant-context` (branding per host), accettazione dei termini                                                                                                                                | FR-M6-02/17, FR-M0-02..06, NFR-BRAND-03              | ✅ onboarding, `/me`, contesto pubblico; registrazione accettazione termini da completare |
| **A9** | Audit log applicativo (interceptor + servizio), console Platform Admin (API): tenant, piani, override, trial                                                                                                                                                     | FR-MT-07/15, FR-M6-14                                | ⬜                 |

## Fase B — Dominio della commessa

| Step | Contenuto                                                                                 | Requisiti AFU                 | Stato                      |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- |
| B1   | Commesse, team, imprese; stati; limiti di piano                                           | FR-M1-01..03, BR-17           | ⬜                         |
| B2   | Committenti, Magic Link (token hash), sessioni del portale, OTP, revoca                   | FR-M1-05/06, BR-03            | ⬜                         |
| B3   | Storage file: upload diretto S3 con URL firmati, quarantena, antimalware                  | FR-M2-01, NFR-SEC-03/04/08    | ⏸️ account AWS             |
| B4   | Elaborati, versioni, pagine, pin, commenti, sign-off, richieste di modifica               | FR-M2-*, BR-01/10/11/14/18/20 | ⬜                         |
| B5   | R.A.I. persistente: fabbricati, unità, vani, aperture, abaco, profili normativi, snapshot | FR-M3-*, BR-06/21             | ⬜                         |
| B6   | Sopralluoghi, foto, audio, API di sincronizzazione offline idempotente                    | FR-M4-*, BR-16/23/24          | ⬜                         |
| B7   | Worker: code, trascrizione e strutturazione AI                                            | FR-M4-09/10, BR-05            | ⏸️ scelta fornitori (Q-22) |
| B8   | Worker: generazione PDF (verbale, relazione, approvazione)                                | FR-M5-*, NFR-PERF-01          | ⬜                         |

## Fase C — Frontend (Angular 20/21)

| Step | Contenuto | Requisiti AFU | Stato |
|------|-----------|---------------|-------|
| C1 | Scheletro Angular 21 (zoneless, signals, lazy routes), design system white-label con token CSS e contrasto automatico, shell (sidebar + topbar), deploy Vercel (`apps/web/vercel.json`) | FR-M0-04, NFR-BRAND-*, NFR-UX-01 | ✅ (dati in memoria) |
| C2 | Login, wizard di onboarding con anteprima dal vivo, impostazioni branding | FR-M6-02, FR-M0-03/05, FR-MT-01 | ✅ (auth mock, in attesa di Supabase Auth) |
| C3 | Dashboard, elenco commesse con filtri e ricerca, fascicolo commessa (panoramica, elaborati, sopralluoghi) | FR-M1-02/04 | ✅ (dati in memoria) |
| C5 | Modulo R.A.I.: vani, aperture, profili, calcolo in tempo reale con `@aph/rai-engine`, pannello esiti | FR-M3-03..10, 13 | ✅ (persistenza in arrivo con B5) |
| C4 | Revisione tavole: viewer (zoom, pan, pinch, pin in coordinate %), thread, risoluzione/riapertura, approvazione con dichiarazione e OTP, portale del committente con Magic Link, finestre Nuova commessa e Accesso committenti | FR-M2-06..16, FR-M1-01/05/06, BR-01/10/11/20/25 | ✅ (dati in memoria, OTP simulato) |
| C6 | Diario di cantiere mobile: presenti, meteo, foto da fotocamera, note vocali (MediaRecorder), bozza AI in 3 blocchi (simulata), editing, finalizzazione con blocchi BR-05 | FR-M4-02..13, BR-05/09/16 | ✅ (AI simulata; offline/IndexedDB e service worker in C6-bis) |
| C6-bis | PWA installabile, coda offline in IndexedDB, sincronizzazione idempotente | FR-M4-01/14, BR-24 | ⬜ (richiede le API di B6) |
| C7 | Back-office FDS | FR-M6-14 | ⬜ |
| C8 | Collegamento alle API reali (adapter HTTP negli store), Supabase Auth | A5–A8 | ⬜ (API A5–A8 pronte) |

## Fase D — Commercializzazione

D1 Stripe (Checkout, Customer Portal, webhook) · D2 fatturazione elettronica SDI · D3 trial, coupon, email del ciclo di vita · D4 progetto demo · D5 lead magnet.

---

## Ambienti

| Ambiente | Dove | Note |
|----------|------|------|
| **Database di test (cloud)** | Supabase, progetto **"depasquale687-star's Project"** — ref **`fwftucqnfkuzlnriyzja`** — regione **eu-west-1** (Irlanda) — https://fwftucqnfkuzlnriyzja.supabase.co | Unico database in uso. Migrazioni `supabase/migrations/0100…0500` applicate. L'API si collega con il ruolo `app_api` dal pooler `aws-1-eu-west-1.pooler.supabase.com:6543` (utente `app_api.fwftucqnfkuzlnriyzja`). |
| Credenziali | File `.env` nella radice (ignorato da git) | Mai nel repository. La `SUPABASE_SECRET_KEY` è stata condivisa in chat: **rigenerarla prima della produzione**. |
| Storage file | Bucket privato **`project-files`** su Supabase Storage | ⚠️ **Temporaneo al posto di Amazon S3** (vedi sotto). |

### Migrazione storage a S3 (da fare prima del lancio)

Per la Beta i file stanno nel bucket Supabase `project-files` (migrazione `0400`). Il backend accede allo storage solo tramite l'interfaccia `FileStorage`: per passare ad Amazon S3 (AFU cap. 14, NFR-SEC-03/04) basta un nuovo adapter S3 + copia degli oggetti mantenendo le stesse chiavi (`tenants/{tenantId}/…`).

## Cosa serve dal committente, e quando

| Input                                                                      | Serve per                      | Stato        |
| -------------------------------------------------------------------------- | ------------------------------ | ------------ |
| Progetto Supabase di **test** (URL, chiavi, stringa di connessione del DB) | A4 (applicazione), A5, A6      | ⏸️ in attesa |
| Account AWS (o sotto-account di test)                                      | B3, B7, B8, deploy             | ⏸️           |
| Risposte al questionario dello studio partner                              | B5 (profili normativi), B6, B4 | ⏸️           |
| Account Stripe (modalità test)                                             | D1                             | Più avanti   |

> **Credenziali:** non vanno mai nel repository. Si mettono in `.env` locale (ignorato da git; vedi `.env.example`) e, per la CI, nei secret di GitHub.

## Come si lavora in locale

Vedi il [README principale](../../README.md).
