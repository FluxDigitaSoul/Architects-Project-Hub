# Gap analysis — AFU v0.2 vs implementazione

Stato al 2026-09-18. Una riga per requisito della RTM (AFU cap. 9). Serve a sapere **cosa c'è, cosa manca e in che ordine si costruisce**; si aggiorna a ogni step della [ROADMAP](ROADMAP.md).

**Legenda**

| Simbolo | Significato |
|---------|-------------|
| ✅ | Fatto e verificato |
| 🟡 | Solo interfaccia, con dati in memoria (manca il backend o il collegamento) |
| 🔧 | Backend fatto, interfaccia da collegare |
| ⬜ | Da fare |
| ⏸️ | Bloccato da una decisione o da un fornitore esterno (vedi AFU cap. 13) |

Priorità AFU: M = Must, S = Should, C = Could, W = Won't (nella Beta).

---

## Modulo 0 — Multi-tenancy e white-label

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M0-01 | Creazione e ciclo di vita del tenant | M | 🟡 | 🔧 | Provisioning fatto (A8); mancano sospensione/chiusura dal back-office |
| FR-M0-02 | Profilo dello studio (P.IVA con check digit) | M | ⬜ | ⬜ | Endpoint profilo + validazione P.IVA/CF |
| FR-M0-03 | Logo e asset grafici | M | 🟡 | ⬜ | Upload su storage, sanificazione SVG (TC-SEC-06) |
| FR-M0-04 | Palette dinamica | M | ✅ | 🔧 | Token CSS e contrasto automatico fatti; salvataggio via API |
| FR-M0-05 | Anteprima e ripristino branding | S | 🟡 | ⬜ | Cronologia ultime 10 configurazioni |
| FR-M0-06 | Sottodominio predefinito | M | ⬜ | ✅ | API risolve il tenant dal sottodominio; FE da far leggere l'host |
| FR-M0-07 | Dominio personalizzato | S | ⬜ | ⬜ | MS3; richiede infrastruttura |
| FR-M0-08 | Gestione dei membri (inviti, ruoli, BR-12) | M | ⬜ | ⬜ | BR-12 già garantita dal database |
| FR-M0-09 | Identità email white-label | S | ⬜ | ⬜ | Dipende dal fornitore email |
| FR-M0-10 | Wizard di primo avvio | S | ✅ | 🔧 | Da collegare a `POST /onboarding/tenants` |
| FR-M0-11 | Impostazioni documenti (pattern codice) | M | ⬜ | ⬜ | Pattern `{YYYY}-{NNN}` (AC-FR-M0-11-1) |
| FR-M0-12 | Profili normativi dello studio | S | 🟡 | ⬜ | Con FR-M3-01 |
| FR-M0-13 | Quote e utilizzo | S | ⬜ | ⬜ | Contatori di consumo |

## Modulo 1 — Fascicolo di commessa

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M1-01 | Creazione e anagrafica commessa | M | 🟡 | ⬜ | Tabelle commesse, team, DL unico (BR-17) |
| FR-M1-02 | Elenco e ricerca (visibilità per assegnazione) | M | 🟡 | ⬜ | Il Collaboratore vede solo le commesse assegnate |
| FR-M1-03 | Transizioni di stato | M | 🟡 | ⬜ | SM-PROGETTO con audit |
| FR-M1-04 | Dashboard di avanzamento | M | 🟡 | ⬜ | Aggregati via API |
| FR-M1-05 | Magic Link | M | 🟡 | ⬜ | Token SHA-256, mai in chiaro nel DB |
| FR-M1-06 | Revoca e rigenerazione | M | 🟡 | ⬜ | SM-TOKEN |
| FR-M1-07 | Documenti condivisi | S | ⬜ | ⬜ | Con M5 |
| FR-M1-08 | Note interne | C | ⬜ | ⬜ | |

## Modulo 2 — Client Portal e Visual Pinning

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M2-01 | Upload elaborati | M | ⬜ | ⬜ | URL firmati, controllo del tipo reale |
| FR-M2-02 | Elaborazione e anteprime | M | ⬜ | ⬜ | Rasterizzazione PDF nel worker |
| FR-M2-03 | Versionamento (BR-18) | M | 🟡 | ⬜ | Numerazione senza riuso |
| FR-M2-04 | Pubblicazione | M | 🟡 | ⬜ | Una sola email per più tavole |
| FR-M2-05 | Scadenza revisione (BR-19) | S | ⬜ | ⬜ | |
| FR-M2-06 | Zoom, pan | M | ✅ | — | |
| FR-M2-07 | Coordinate percentuali (BR-20) | M | ✅ | ⬜ | Validazione server 0–100 |
| FR-M2-08 | Creazione pin | M | 🟡 | ⬜ | |
| FR-M2-09 | Pin e pannello (cluster) | M | 🟡 | — | Cluster non ancora fatto |
| FR-M2-10 | Thread (BR-14) | M | 🟡 | ⬜ | Modifica entro 15 min |
| FR-M2-11 | Risoluzione e riapertura (BR-11) | M | 🟡 | ⬜ | |
| FR-M2-12 | Notifiche revisione | M | ⬜ | ⬜ | Con FR-MT-06 |
| FR-M2-13 | Trasferimento pin tra versioni | S | ⬜ | ⬜ | |
| FR-M2-14 | Esportazione commenti PDF | S | ⬜ | ⬜ | Con M5 |
| FR-M2-15 | Formal sign-off (BR-10, OTP) | M | 🟡 | ⬜ | OTP simulato nel FE |
| FR-M2-16 | Log di congelamento | M | ⬜ | ⬜ | Dall'audit |
| FR-M2-17 | Richiesta modifica post-approvazione | S | ⬜ | ⬜ | SM-RICHIESTA-MODIFICA |
| FR-M2-18 | Download controllato | M | ⬜ | ⬜ | URL firmati a 5 minuti |

## Modulo 3 — Motore R.A.I.

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M3-01 | Profili normativi | M | 🟡 | ⬜ | Versioni immutabili (BR-21) |
| FR-M3-02 | Fabbricati e unità | M | 🟡 | ⬜ | |
| FR-M3-03 | Anagrafica vani | M | 🟡 | ⬜ | |
| FR-M3-04 | Inserimento rapido | S | 🟡 | — | |
| FR-M3-05 | Superfici e altezze (BR-22) | M | ✅ | ⬜ | Motore fatto (`@aph/rai-engine`); manca persistenza |
| FR-M3-06 | Aperture e infissi | M | ✅ | ⬜ | |
| FR-M3-07 | Abaco serramenti | S | ⬜ | ⬜ | |
| FR-M3-08 | Algoritmo di calcolo | M | ✅ | ⬜ | Stesso motore lato server (TC-R-99) |
| FR-M3-09 | Spiegazione correzioni | M | ✅ | — | |
| FR-M3-10 | Tempo reale e badge | M | ✅ | — | |
| FR-M3-12 | Deroghe (BR-06) | M | ✅ | ⬜ | |
| FR-M3-13 | Vani ciechi | M | ✅ | ⬜ | |
| FR-M3-14 | Verifiche d'insieme unità | M | ✅ | ⬜ | |
| FR-M3-15 | Quadro riepilogativo | M | 🟡 | ⬜ | |
| FR-M3-16 | Snapshot del calcolo | M | ⬜ | ⬜ | Base per la relazione per CILA/SCIA |

## Modulo 4 — Diario di cantiere

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M4-01 | PWA mobile-first | M | 🟡 | — | Manifest + service worker (C6-bis) |
| FR-M4-02 | I miei cantieri | M | 🟡 | ⬜ | |
| FR-M4-03 | Creazione sopralluogo (BR-16) | M | 🟡 | ⬜ | Numero assegnato dal server |
| FR-M4-04 | Dati del sopralluogo | M | 🟡 | ⬜ | |
| FR-M4-05 | Foto | M | 🟡 | ⬜ | Upload, conversione HEIC, rimozione GPS |
| FR-M4-06 | Organizzazione foto | M | ⬜ | ⬜ | |
| FR-M4-08 | Registratore audio | M | ✅ | ⬜ | Upload |
| FR-M4-09 | Trascrizione ASR | M | 🟡 | ⏸️ | Fornitore da scegliere (Q-22) |
| FR-M4-10 | Strutturazione AI (BR-05) | M | 🟡 | ⏸️ | Fornitore da scegliere (Q-22) |
| FR-M4-11 | Nota scritta | M | 🟡 | ⬜ | |
| FR-M4-12 | Editing e validazione | M | 🟡 | ⬜ | |
| FR-M4-13 | Finalizzazione (BR-08/09/23) | M | 🟡 | ⬜ | |
| FR-M4-14 | Offline e sincronizzazione (BR-24) | M | ⬜ | ⬜ | Idempotenza per `clientOpId` |
| FR-M4-15 | Azioni aperte | S | ⬜ | ⬜ | |
| FR-M4-16 | Condivisione | M | ⬜ | ⬜ | Con FR-M5-05 |

## Modulo 5 — Documentale (PDF, firma, invio)

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M5-00 | Regole di impaginazione | M | ⬜ | ⬜ | Carta intestata dal branding |
| FR-M5-01 | Verbale di sopralluogo | M | ⬜ | ⬜ | |
| FR-M5-02 | Firma dei documenti (PAdES esterna + ricaricamento) | M | ⬜ | ⬜ | Verifica che il PDF firmato corrisponda |
| FR-M5-03 | Archivio documenti (BR-09) | M | ⬜ | ⬜ | Annullamento con filigrana |
| FR-M5-04 | Determinismo | M | ⬜ | ⬜ | Stessi input → stesso PDF |
| FR-M5-05 | Invio dei documenti via email | M | ⬜ | ⬜ | Allegato o link a 7 giorni se > 10 MB |
| FR-M5-10 | Riepilogo di approvazione | M | ⬜ | ⬜ | |
| FR-M5-20 | Relazione tecnica R.A.I. (CILA/SCIA/PdC) | M | ⬜ | ⬜ | Asseverativa solo se BR-06 |
| FR-M5-21 | Varianti della relazione | M | ⬜ | ⬜ | Asseverativa / report di verifica |
| FR-M5-22 | Revisioni della relazione | M | ⬜ | ⬜ | Rev. n con motivo |

## Modulo 6 — SaaS

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M6-02 | Provisioning automatico | M | 🟡 | ✅ | |
| FR-M6-05 | Piani ed entitlements | M | ⬜ | ✅ | FE deve riflettere i limiti |
| FR-M6-09 | Consumi e quote | M | ⬜ | ⬜ | |
| FR-M6-17 | Termini e DPA | M | 🟡 | ⬜ | Registrazione dell'accettazione |
| FR-M6-01/03/04/06/07/08/11/13/16/18 | Commercializzazione (Stripe, SDI, demo, trial) | S/W | ⬜ | ⬜ | MS5, dopo la Beta |
| FR-M6-10/14/15 | Concierge, back-office, metriche | S | ⬜ | ⬜ | |

## Funzioni trasversali

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-MT-01 | Autenticazione | M | 🟡 | ✅ | FE usa ancora l'auth simulata |
| FR-MT-02 | Sessioni | M | ⬜ | ✅ | Gestite da Supabase Auth |
| FR-MT-03 | Selezione del tenant | M | ⬜ | ✅ | |
| FR-MT-04 | Profilo personale (iscrizione albo, BR-08) | M | ⬜ | ⬜ | Serve per firmare |
| FR-MT-05/06 | Notifiche in app ed email (digest 10 min) | S/M | ⬜ | ⬜ | |
| FR-MT-07 | Audit log | M | — | 🔧 | Tabella fatta; manca il servizio applicativo |
| FR-MT-08 | Ricerca globale | S | 🟡 | ⬜ | |
| FR-MT-09 | Esportazione dati tenant | M | ⬜ | ⬜ | MS4 |
| FR-MT-12 | i18n | M | ⬜ | — | Testi ancora nei template |
| FR-MT-14/15 | Supporto e console admin | S/M | ⬜ | ⬜ | |
| FR-MT-18 | Errori lato utente | M | 🟡 | ✅ | Formato uniforme con requestId |

---

## Ordine di costruzione

Il backend si completa **prima** del collegamento dell'interfaccia, un dominio alla volta, ognuno con migrazione, API e test:

1. **B1 Commesse** — commesse, team (BR-17), committenti, imprese, stati, codice progressivo, audit applicativo.
2. **B2 Accesso committenti** — Magic Link (hash), sessioni del portale, OTP, revoca; API del portale separate da quelle dello studio.
3. **B3 Storage** — interfaccia `FileStorage` con adapter Supabase Storage (URL firmati), controllo del tipo reale.
4. **B4 Revisione** — elaborati, versioni, pin, commenti, approvazioni (BR-01/10/11/14/18/19/20), richieste di modifica.
5. **B5 R.A.I. persistente** — profili, fabbricati, unità, vani, aperture, abaco, deroghe, calcolo lato server, snapshot.
6. **B6 Cantiere** — sopralluoghi numerati, presenti, foto, audio, voci, finalizzazione, idempotenza.
7. **B8 Documenti** — PDF (verbale, relazione R.A.I., riepilogo approvazione), archivio, annullamento, firma PAdES con ricaricamento, invio email.
8. **C8 Collegamento FE** — Supabase Auth, adapter HTTP negli store, portale reale.

Restano esterni e ⏸️: trascrizione e AI (Q-22), dominio personalizzato, Stripe/SDI, fornitore email di produzione (in sviluppo si usa un adapter che scrive su log).
