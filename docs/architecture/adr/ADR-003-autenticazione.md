# ADR-003 — Autenticazione: Supabase Auth per lo studio, token propri per i committenti

**Stato:** Proposto (da confermare quando arriva l'accesso al progetto Supabase di test) · **Data:** 2026-09-18 · **Collegato a:** AFU FR-MT-01..03, FR-M1-05/06, FR-M6-01, `Q-29`

## Contesto

Ci sono due popolazioni di utenti molto diverse:

1. **Utenti dello studio** (Owner, Architetto, Collaboratore): account veri, password, MFA, registrazione self-service, login con Google/Microsoft (FR-M6-01).
2. **Committenti:** nessuna password; accesso con Magic Link personale e revocabile legato a una commessa (FR-M1-05), OTP per le azioni vincolanti (FR-M2-15).

Il database è PostgreSQL su Supabase (V-03).

## Decisione

1. **Utenti dello studio → Supabase Auth.**
   - Il frontend usa l'SDK di Supabase **solo per l'autenticazione** (login, registrazione, reset, MFA, OAuth).
   - Il backend NestJS riceve il JWT (`Authorization: Bearer`) e lo **verifica con le chiavi pubbliche JWKS** del progetto Supabase (niente segreto condiviso nel backend quando si usano chiavi asimmetriche).
   - Dal token si prende **solo l'identità** (`sub` = id utente, email verificata). **Tenant e ruolo li decide il database applicativo** (`app.memberships`), mai i claim del token, così un cambio di ruolo vale subito e un token non può "portarsi dietro" permessi vecchi.
   - Il tenant corrente si ricava dall'**host** della richiesta (sottodominio o dominio personalizzato) e si verifica che l'utente ne sia membro attivo.
2. **Committenti → token applicativi propri** (tabelle `app.client_access_tokens` e sessioni del portale): 256 bit casuali, salvati solo come hash SHA-256, cookie di sessione `HttpOnly`. Non diventano utenti di Supabase Auth.
3. **Platform Admin → Supabase Auth con MFA obbligatoria** + flag di piattaforma nel database applicativo (`app.platform_admins`).

## Alternative considerate

| Alternativa                           | Perché no                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon Cognito                        | Coerente con AWS, ma aggiunge un secondo fornitore d'identità accanto a Supabase; gestione più complessa degli host multi-tenant e delle callback |
| Autenticazione interna in NestJS      | Massimo controllo, ma molto codice di sicurezza scritto a mano (MFA, reset, OAuth, protezione brute force) da mantenere                           |
| Committenti come utenti Supabase Auth | Mescola identità "leggere" legate a una commessa con account veri; revoca e scadenza per commessa diventano complicate                            |

## Conseguenze

- Il backend dipende da Supabase Auth solo per la **verifica del token** (JWKS): se in futuro si cambia fornitore d'identità, cambia solo l'adapter di verifica.
- Serve una tabella di profilo applicativo (`app.user_profiles`) collegata all'id utente di Supabase Auth.
- Da verificare con il progetto di test: tipo di chiavi JWT (asimmetriche consigliate), URL di redirect per gli host dei tenant, template email di Supabase Auth con il marchio (le email transazionali di login restano con il marchio della piattaforma finché non si configura un SMTP personalizzato).
