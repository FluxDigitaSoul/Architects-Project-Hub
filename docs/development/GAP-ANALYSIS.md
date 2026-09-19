# Gap analysis — AFU v0.2 vs implementazione

Stato al 2026-09-19, dopo il collegamento completo dell'interfaccia alle API (fasi F1–F7). Una riga per requisito della RTM (AFU cap. 9): **cosa c'è, cosa manca e perché**. Si aggiorna a ogni step della [ROADMAP](ROADMAP.md).

**Legenda**

| Simbolo | Significato |
|---------|-------------|
| ✅ | Fatto e verificato (test e2e API e prova nel browser) |
| 🟡 | Fatto in parte (vedi note) |
| 🔧 | Backend fatto, interfaccia da fare |
| ⬜ | Da fare |
| ⏸️ | Bloccato da una decisione o da un fornitore esterno (vedi AFU cap. 13) |
| — | Non applicabile a quel lato |

Priorità AFU: M = Must, S = Should, C = Could, W = Won't (nella Beta).

---

## Modulo 0 — Multi-tenancy e white-label

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M0-01 | Creazione e ciclo di vita del tenant | M | ✅ | 🟡 | Provisioning e trial fatti; sospensione/chiusura dal back-office con la console admin |
| FR-M0-02 | Profilo dello studio (P.IVA/CF con check digit) | M | ✅ | ✅ | Impostazioni › Studio; stessi validatori FE/BE da `@aph/contracts` |
| FR-M0-03 | Logo e asset grafici | M | ✅ | ✅ | Principale, stampa, icona (anche favicon); PNG/JPEG/WebP ≤ 2 MB, niente SVG (TC-SEC-06) |
| FR-M0-04 | Palette dinamica | M | ✅ | ✅ | Colori salvati via API e applicati subito; contrasto automatico WCAG |
| FR-M0-05 | Anteprima, ripristino e testi dei documenti | S | 🟡 | 🟡 | Anteprima dal vivo e testi (dichiarazione, formula di chiusura) fatti; manca la cronologia delle ultime 10 configurazioni |
| FR-M0-06 | Sottodominio predefinito | M | ⬜ | ✅ | L'API risolve il tenant dal sottodominio; il FE usa ancora l'header `X-Tenant-Slug` (serve il DNS wildcard) |
| FR-M0-07 | Dominio personalizzato | S | ⬜ | ⬜ | MS3; richiede infrastruttura |
| FR-M0-08 | Gestione dei membri (inviti, ruoli, BR-12) | M | ✅ | ✅ | Impostazioni › Persone; invito non attivabile a mano, riattivazione entro i posti del piano (BR-28), ultimo Owner protetto dal database |
| FR-M0-09 | Identità email white-label | S | ⬜ | ⬜ | Dipende dal fornitore email di produzione |
| FR-M0-10 | Wizard di primo avvio | S | ✅ | ✅ | |
| FR-M0-11 | Impostazioni operative (pattern codice, giorni di grazia, OTP) | M | ✅ | ✅ | Anteprima del prossimo codice con la stessa funzione del server |
| FR-M0-12 | Profili normativi dello studio | S | 🟡 | 🟡 | Profili di sistema versionati e scelta per commessa; profili personalizzati dallo studio da fare |
| FR-M0-13 | Quote e utilizzo | S | 🟡 | 🟡 | Limiti del piano applicati (es. postazioni); pagina di consumo da fare |

## Modulo 1 — Fascicolo di commessa

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M1-01 | Creazione e anagrafica commessa | M | ✅ | ✅ | Team con DL unico (BR-17), committenti, imprese, dati catastali |
| FR-M1-02 | Elenco e ricerca (visibilità per assegnazione) | M | ✅ | ✅ | Il Collaboratore vede solo le commesse assegnate |
| FR-M1-03 | Transizioni di stato | M | ✅ | ✅ | SM-PROGETTO con audit; commesse archiviate in sola lettura |
| FR-M1-04 | Dashboard di avanzamento | M | ✅ | ✅ | Dashboard dello studio e della commessa |
| FR-M1-05 | Magic Link | M | ✅ | ✅ | Token SHA-256, mai in chiaro; invio o copia del link |
| FR-M1-06 | Revoca e rigenerazione | M | ✅ | ✅ | La revoca chiude subito la sessione del portale |
| FR-M1-07 | Documenti condivisi | S | ✅ | ✅ | Condivisione per documento, visibili nel portale |
| FR-M1-08 | Note interne | C | ⬜ | ⬜ | |

## Modulo 2 — Client Portal e Visual Pinning

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M2-01 | Upload elaborati | M | ✅ | ✅ | URL firmati, verifica del tipo reale dopo il caricamento |
| FR-M2-02 | Elaborazione e anteprime | M | ✅ | 🟡 | PDF resi nel browser con pdf.js in un worker; niente rasterizzazione lato server |
| FR-M2-03 | Versionamento (BR-18) | M | ✅ | ✅ | Numerazione senza riuso, ritiro e scarto |
| FR-M2-04 | Pubblicazione | M | ✅ | ✅ | Una sola email per più tavole |
| FR-M2-05 | Scadenza revisione (BR-19) | S | ✅ | ✅ | Promemoria ai firmatari 2 giorni prima e il giorno stesso (job `review-reminders`); ritardi in dashboard; mai approvazione automatica |
| FR-M2-06 | Zoom, pan | M | ✅ | — | |
| FR-M2-07 | Coordinate percentuali (BR-20) | M | ✅ | ✅ | |
| FR-M2-08 | Creazione pin | M | ✅ | ✅ | |
| FR-M2-09 | Pin e pannello | M | 🟡 | — | Cluster dei pin vicini da fare |
| FR-M2-10 | Thread (BR-14) | M | ✅ | ✅ | Modifica entro 15 minuti |
| FR-M2-11 | Risoluzione e riapertura (BR-11) | M | ✅ | ✅ | |
| FR-M2-12 | Notifiche revisione | M | ✅ | ✅ | Pin, risposte, risoluzioni e riaperture raggruppati per destinatario e commessa; il committente sceglie dal portale (subito / giornaliero / nessuna) |
| FR-M2-13 | Trasferimento pin tra versioni | S | ✅ | ✅ | |
| FR-M2-14 | Esportazione commenti PDF | S | ⬜ | ⬜ | |
| FR-M2-15 | Formal sign-off (BR-10, OTP) | M | ✅ | ✅ | Dichiarazione versionata, OTP via email, riepilogo PDF |
| FR-M2-16 | Log di congelamento | M | ✅ | ✅ | |
| FR-M2-17 | Richiesta modifica post-approvazione | S | ✅ | ✅ | Valutazione in/extra incarico con importo |
| FR-M2-18 | Download controllato | M | ✅ | ✅ | URL firmati a scadenza breve, solo se lo studio lo consente |

## Modulo 3 — Motore R.A.I.

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M3-01 | Profili normativi | M | ✅ | ✅ | Versioni immutabili (BR-21), scelta per commessa, quota |
| FR-M3-02 | Fabbricati e unità | M | ✅ | ✅ | |
| FR-M3-03 | Anagrafica vani | M | ✅ | ✅ | |
| FR-M3-04 | Inserimento rapido | S | 🟡 | — | Form per vano; inserimento tabellare da fare |
| FR-M3-05 | Superfici e altezze (BR-22) | M | ✅ | ✅ | Stesso motore `@aph/rai-engine` su FE e BE |
| FR-M3-06 | Aperture e infissi | M | ✅ | ✅ | |
| FR-M3-07 | Abaco serramenti | S | 🔧 | ✅ | API dei tipi di apertura pronte; interfaccia da fare |
| FR-M3-08 | Algoritmo di calcolo | M | ✅ | ✅ | Il server ricalcola, il client mostra (TC-R-99) |
| FR-M3-09 | Spiegazione correzioni | M | ✅ | — | |
| FR-M3-10 | Tempo reale e badge | M | ✅ | — | |
| FR-M3-12 | Deroghe (BR-06) | M | ✅ | ✅ | Solo le deroghe ammesse dal profilo |
| FR-M3-13 | Vani ciechi | M | ✅ | ✅ | |
| FR-M3-14 | Verifiche d'insieme unità | M | ✅ | ✅ | |
| FR-M3-15 | Quadro riepilogativo | M | ✅ | ✅ | |
| FR-M3-16 | Snapshot del calcolo | M | ✅ | ✅ | Revisioni numerate con motivo, base della relazione |

## Modulo 4 — Diario di cantiere

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M4-01 | PWA mobile-first | M | ✅ | — | Installabile (manifest, icone, service worker Angular in produzione); l'app si apre anche senza rete |
| FR-M4-02 | I miei cantieri | M | ✅ | ✅ | |
| FR-M4-03 | Creazione sopralluogo (BR-16) | M | ✅ | ✅ | Id generato dal client, numero assegnato dal server |
| FR-M4-04 | Dati del sopralluogo | M | ✅ | ✅ | Tipo, fase, meteo, orari, presenti con DL |
| FR-M4-05 | Foto | M | ✅ | ✅ | Ogni foto è ricodificata in JPEG sul dispositivo: via EXIF e GPS (PRIV-11), HEIC dell'iPhone convertito; coda offline |
| FR-M4-06 | Organizzazione foto | M | ✅ | ✅ | Didascalia, sezione, inclusione nel verbale |
| FR-M4-08 | Registratore audio | M | ✅ | ✅ | Upload con coda offline |
| FR-M4-09 | Trascrizione ASR | M | ⏸️ | ⏸️ | Fornitore da scegliere (Q-22); le note restano ascoltabili |
| FR-M4-10 | Strutturazione AI (BR-05) | M | ⏸️ | ⏸️ | Fornitore da scegliere (Q-22); stati e origine delle voci già pronti |
| FR-M4-11 | Nota scritta | M | ✅ | ✅ | Voci per sezione |
| FR-M4-12 | Editing e validazione | M | ✅ | ✅ | |
| FR-M4-13 | Finalizzazione (BR-08/09/23) | M | ✅ | ✅ | Solo con DL iscritto all'albo |
| FR-M4-14 | Offline e sincronizzazione (BR-24) | M | ✅ | ✅ | Sopralluogo avviabile senza rete (numero alla sincronizzazione); voci, dati, presenti, foto e audio in coda IndexedDB e inviati in ordine al ritorno della rete; copia locale di cantieri, commessa e sopralluogo; finalizzazione solo a coda vuota (BR-23) |
| FR-M4-15 | Azioni aperte | S | ✅ | ✅ | Difformità da verificare, chiuse alla finalizzazione |
| FR-M4-16 | Condivisione | M | ✅ | ✅ | Invio del verbale e condivisione nel portale |

## Modulo 5 — Documentale (PDF, firma, invio)

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M5-00 | Regole di impaginazione | M | — | ✅ | Carta intestata dal profilo e dal logo dello studio |
| FR-M5-01 | Verbale di sopralluogo | M | ✅ | ✅ | Formula di chiusura dalle impostazioni dello studio |
| FR-M5-02 | Firma PAdES esterna + ricaricamento | M | ✅ | ✅ | Il PDF firmato deve corrispondere al generato (SIGNATURE_MISMATCH) |
| FR-M5-03 | Archivio documenti (BR-09) | M | ✅ | ✅ | Pagina Documenti con filtri e promemoria "da firmare"; annullamento con motivo |
| FR-M5-04 | Determinismo | M | — | ✅ | Relazioni dallo snapshot: stessi valori a ogni rigenerazione |
| FR-M5-05 | Invio dei documenti via email | M | ✅ | ✅ | Storico degli invii; in sviluppo le email vanno nel log |
| FR-M5-10 | Riepilogo di approvazione | M | ✅ | ✅ | |
| FR-M5-20 | Relazione tecnica R.A.I. | M | ✅ | ✅ | Asseverativa solo se BR-06; testo della dichiarazione personalizzabile (da validare, Q-16) |
| FR-M5-21 | Varianti della relazione | M | ✅ | ✅ | Asseverativa / report di verifica |
| FR-M5-22 | Revisioni della relazione | M | ✅ | ✅ | Rev. n con motivo |

## Modulo 6 — SaaS

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-M6-02 | Provisioning automatico | M | ✅ | ✅ | |
| FR-M6-05 | Piani ed entitlements | M | 🟡 | ✅ | Limiti applicati dal server; nel FE solo trial e postazioni |
| FR-M6-09 | Consumi e quote | M | ⬜ | 🟡 | Tabelle pronte, contatori da completare |
| FR-M6-17 | Termini e DPA | M | ✅ | ✅ | Accettazione registrata al provisioning |
| FR-M6-01/03/04/06/07/08/11/13/16/18 | Commercializzazione (Stripe, SDI, demo, trial) | S/W | ⬜ | ⬜ | Fase D, dopo la Beta |
| FR-M6-10/14/15 | Concierge, back-office, metriche | S | ⬜ | ⬜ | |

## Funzioni trasversali

| ID | Requisito | Pri | FE | BE | Note / cosa manca |
|----|-----------|-----|----|----|-------------------|
| FR-MT-01 | Autenticazione | M | ✅ | ✅ | Supabase Auth (solo il client di Auth nel browser) |
| FR-MT-02 | Sessioni | M | ✅ | ✅ | |
| FR-MT-03 | Selezione del tenant | M | ✅ | ✅ | |
| FR-MT-04 | Profilo personale (iscrizione albo, BR-08) | M | ✅ | ✅ | Impostazioni › Il mio profilo; abilita la firma |
| FR-MT-05/06 | Notifiche in app ed email (digest 10 min) | S/M | 🟡 | ✅ | Email raggruppate in finestre di 10 minuti o riepilogo alle 18, con preferenza nel profilo; manca il centro notifiche in app (FR-MT-05, Should) e l'header `List-Unsubscribe` |
| FR-MT-07 | Audit log | M | — | ✅ | |
| FR-MT-08 | Ricerca globale | S | 🟡 | 🟡 | La barra in alto cerca tra le commesse |
| FR-MT-09 | Esportazione dati tenant | M | ⬜ | ⬜ | MS4 |
| FR-MT-12 | i18n | M | ⬜ | — | Testi in italiano nei template |
| FR-MT-14/15 | Supporto e console admin | S/M | ⬜ | ⬜ | |
| FR-MT-18 | Errori lato utente | M | ✅ | ✅ | Formato uniforme con codice di riferimento; errori per campo nei moduli |

---

## Cosa resta, in ordine

1. ✅ **Automazione** (2026-09-19): notifiche raggruppate, promemoria di revisione, conservazione dei dati — vedi [README](../../README.md#automazione).
2. **Infrastruttura** (serve accesso agli account): rewrite `/api` su Vercel, DNS wildcard per i sottodomini, fornitore email di produzione, migrazione dello storage su S3. ✅ CI GitHub Actions (`.github/workflows/ci.yml`).
3. ✅ **Cantiere** (2026-09-19): PWA installabile, lavoro offline anche sui testi, foto senza EXIF/GPS e HEIC convertito.
4. **Should/Could**: abaco serramenti nel FE, cluster dei pin, cronologia del branding, esportazione dei commenti, note interne, consumi.
5. **Decisioni esterne ⏸️**: trascrizione e AI (Q-22); validazione legale dei testi di dichiarazione e approvazione (Q-16).
