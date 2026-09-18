# 9. Matrice di tracciabilità dei requisiti (RTM) e criteri di accettazione

## 9.1 Come si usa la RTM

- **Una riga per requisito.** Ogni ticket di sviluppo cita l'`ID`; ogni test automatico o manuale cita il `TC`.
- **Stato di collaudo:** `Da testare` → `Superato` / `Fallito` / `Bloccato`. Si aggiorna a ogni ciclo di test della Beta (cap. 10).
- **Criterio di completamento di un requisito ("Definition of Done"):**
  1. tutti gli AC collegati superati;
  2. le BR collegate hanno almeno un test negativo automatico;
  3. i requisiti NFR applicabili sono verificati;
  4. revisione del codice fatta;
  5. documentazione utente aggiornata, se serve.
- **Formula dei criteri di accettazione:** *Dato* (contesto) — *Quando* (azione) — *Allora* (risultato osservabile e verificabile).

I criteri di accettazione dettagliati si trovano nel capitolo di ciascun modulo (sezione "Criteri di accettazione chiave"). Qui sotto ci sono la matrice completa e i criteri aggiuntivi per i requisiti che non ne hanno uno nel modulo.

---

## 9.2 Matrice

**Legenda milestone:** MS1 = Scheletro e white-label · MS2 = Calcolatore R.A.I. · MS3 = Revisione con il committente · MS4 = Test sul campo (vedi cap. 10).

### Modulo 0 — Multi-tenancy e white-label

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M0-01 | Creazione e ciclo di vita del tenant | M | BR-04, BR-13 | AC-FR-M0-01-1 | TC-001 | MS1 |
| FR-M0-02 | Profilo dello studio | M | BR-08 | AC-FR-M0-02-1 | TC-002 | MS1 |
| FR-M0-03 | Logo e asset grafici | M | — | AC-FR-M0-03-1 | TC-003, TC-SEC-06 | MS1 |
| FR-M0-04 | Palette cromatica dinamica | M | — | AC-FR-M0-04-1/2 | TC-004 | MS1 |
| FR-M0-05 | Anteprima e ripristino del branding | S | — | AC-FR-M0-05-1 | TC-005 | MS1 |
| FR-M0-06 | Sottodominio predefinito | M | BR-04 | AC-FR-M0-06-1 | TC-006 | MS1 |
| FR-M0-07 | Dominio personalizzato (CNAME) | S | — | AC-FR-M0-07-1 | TC-007 | MS3 |
| FR-M0-08 | Gestione dei membri | M | BR-12 | AC-FR-M0-08-1/2 | TC-008 | MS1 |
| FR-M0-09 | Identità email white-label | S | — | AC-FR-M0-09-1 | TC-009 | MS3 |
| FR-M0-10 | Wizard di primo avvio | S | — | — (test esplorativo) | TC-010 | MS1 |
| FR-M0-11 | Impostazioni dei documenti | M | BR-16 | AC-FR-M0-11-1 | TC-011 | MS2 |
| FR-M0-12 | Profili normativi dello studio | S | BR-21 | vedi FR-M3-01 | TC-012 | MS2 |
| FR-M0-13 | Quote e utilizzo | S | — | AC-FR-M0-13-1 | TC-013 | MS4 |

### Modulo 1 — Fascicolo di commessa

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M1-01 | Creazione e anagrafica della commessa | M | BR-17 | AC-FR-M1-01-1 | TC-020 | MS1 |
| FR-M1-02 | Elenco e ricerca delle commesse | M | BR-04 | AC-FR-M1-02-1 | TC-021 | MS1 |
| FR-M1-03 | Transizioni di stato della commessa | M | BR-13 | AC-FR-M1-03-1 | TC-022 | MS1 |
| FR-M1-04 | Dashboard di avanzamento | M | — | AC-FR-M1-04-1 | TC-023 | MS3 |
| FR-M1-05 | Generazione del Magic Link | M | BR-03, BR-04, BR-25 | AC-FR-M1-05-1/2 | TC-024, TC-SEC-02 | MS3 |
| FR-M1-06 | Revoca e rigenerazione | M | BR-03 | AC-FR-M1-06-1 | TC-025 | MS3 |
| FR-M1-07 | Documenti condivisi | S | BR-25 | AC-FR-M1-07-1 | TC-026 | MS4 |
| FR-M1-08 | Note interne | C | BR-25 | — | TC-027 | — |

### Modulo 2 — Client Portal e Visual Pinning

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M2-01 | Upload degli elaborati | M | — | AC-FR-M2-01-1 | TC-040, TC-SEC-05 | MS3 |
| FR-M2-02 | Elaborazione e anteprime | M | — | AC-FR-M2-02-1 | TC-041 | MS3 |
| FR-M2-03 | Versionamento | M | BR-18 | AC-FR-M2-03-1 | TC-042 | MS3 |
| FR-M2-04 | Pubblicazione | M | BR-25 | AC-FR-M2-04-1 | TC-043 | MS3 |
| FR-M2-05 | Scadenza di revisione | S | BR-19 | AC-FR-M2-05-1 | TC-044 | MS3 |
| FR-M2-06 | Zoom, pan, navigazione | M | — | AC-FR-M2-06-1 | TC-045 | MS3 |
| FR-M2-07 | Coordinate percentuali | M | BR-20 | AC-FR-M2-07-1 | TC-046 | MS3 |
| FR-M2-08 | Creazione dei pin | M | BR-01 | AC-FR-M2-08-1 | TC-047 | MS3 |
| FR-M2-09 | Visualizzazione dei pin e pannello | M | — | AC-FR-M2-09-1 | TC-048 | MS3 |
| FR-M2-10 | Thread di discussione | M | BR-14 | AC-FR-M2-10-1 | TC-049, TC-SEC-03 | MS3 |
| FR-M2-11 | Risoluzione e riapertura | M | BR-11 | AC-FR-M2-11-1 | TC-050 | MS3 |
| FR-M2-12 | Notifiche della revisione | M | — | vedi FR-MT-06 | TC-051 | MS3 |
| FR-M2-13 | Trasferimento dei pin tra versioni | S | — | AC-FR-M2-13-1 | TC-052 | MS3 |
| FR-M2-14 | Esportazione dei commenti in PDF | S | — | AC-FR-M2-14-1 | TC-053 | MS3 |
| FR-M2-15 | Formal sign-off | M | BR-01, BR-10, BR-19 | AC-FR-M2-15-1/2/3/4 | TC-054..057 | MS3 |
| FR-M2-16 | Log di congelamento | M | BR-01 | AC-FR-M2-16-1 | TC-058 | MS3 |
| FR-M2-17 | Richiesta di modifica post-approvazione | S | BR-01 | AC-FR-M2-17-1 | TC-059 | MS3 |
| FR-M2-18 | Download controllato | M | BR-04 | AC-FR-M2-18-1 | TC-060, TC-SEC-04 | MS3 |

### Modulo 3 — Motore R.A.I.

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M3-01 | Profili normativi | M | BR-21 | AC-FR-M3-01-1 | TC-070 | MS2 |
| FR-M3-02 | Fabbricati e unità | M | — | AC-FR-M3-02-1 | TC-071 | MS2 |
| FR-M3-03 | Anagrafica dei vani | M | — | AC-FR-M3-03-1 | TC-072 | MS2 |
| FR-M3-04 | Inserimento rapido | S | — | — (test esplorativo) | TC-073 | MS2 |
| FR-M3-05 | Superfici computabili e altezze | M | BR-22 | AC-FR-M3-05-1 | TC-R-10..12 | MS2 |
| FR-M3-06 | Aperture e infissi | M | — | AC-FR-M3-06-1 | TC-074 | MS2 |
| FR-M3-07 | Abaco dei serramenti | S | — | AC-FR-M3-07-1 | TC-075 | MS2 |
| FR-M3-08 | Algoritmo di calcolo | M | BR-02, BR-22 | AC-FR-M3-08-1..7 | TC-R-01..09 | MS2 |
| FR-M3-09 | Spiegazione delle correzioni | M | — | AC-FR-M3-09-1 | TC-076 | MS2 |
| FR-M3-10 | Tempo reale e badge | M | — | AC-FR-M3-10-1 | TC-077, TC-R-99 | MS2 |
| FR-M3-11 | Suggerimenti di adeguamento | C | — | — | TC-078 | — |
| FR-M3-12 | Deroghe | M | BR-06 | AC-FR-M3-12-1/2 | TC-R-13..15 | MS2 |
| FR-M3-13 | Vani ciechi e di servizio | M | — | AC-FR-M3-13-1 | TC-R-16..17 | MS2 |
| FR-M3-14 | Verifiche d'insieme dell'unità | M | — | AC-FR-M3-14-1 | TC-R-18 | MS2 |
| FR-M3-15 | Quadro riepilogativo del fabbricato | M | BR-06 | AC-FR-M3-15-1 | TC-079 | MS2 |
| FR-M3-16 | Snapshot del calcolo | M | BR-21 | AC-FR-M5-04-1 | TC-080 | MS2 |

### Modulo 4 — Diario di cantiere

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M4-01 | PWA mobile-first | M | — | AC-FR-M4-01-1 | TC-090 | MS4 |
| FR-M4-02 | I miei cantieri | M | BR-04 | AC-FR-M4-02-1 | TC-091 | MS4 |
| FR-M4-03 | Creazione del sopralluogo | M | BR-16 | AC-FR-M4-03-1 | TC-092 | MS4 |
| FR-M4-04 | Dati del sopralluogo | M | — | AC-FR-M4-04-1 | TC-093 | MS4 |
| FR-M4-05 | Acquisizione fotografica | M | — | AC-FR-M4-05-1 | TC-094 | MS4 |
| FR-M4-06 | Organizzazione delle foto | M | — | AC-FR-M4-06-1 | TC-095 | MS4 |
| FR-M4-07 | Galleria del cantiere | S | — | — | TC-096 | MS4 |
| FR-M4-08 | Registratore audio | M | — | AC-FR-M4-08-1 | TC-097 | MS4 |
| FR-M4-09 | Trascrizione ASR | M | — | AC-FR-M4-09-1 | TC-098 | MS4 |
| FR-M4-10 | Strutturazione AI | M | BR-05 | AC-FR-M4-10-1 | TC-099, TC-AI-01..30 | MS4 |
| FR-M4-11 | Nota scritta | M | — | — | TC-100 | MS4 |
| FR-M4-12 | Editing e validazione | M | BR-05 | AC-FR-M4-12-1 | TC-101 | MS4 |
| FR-M4-13 | Finalizzazione | M | BR-08, BR-09, BR-23 | AC-FR-M4-13-1 | TC-102 | MS4 |
| FR-M4-14 | Offline e sincronizzazione | M | BR-23, BR-24 | AC-FR-M4-14-1/2 | TC-103..106 | MS4 |
| FR-M4-15 | Registro delle azioni aperte | S | — | AC-FR-M4-15-1 | TC-107 | MS4 |
| FR-M4-16 | Condivisione | M | — | vedi FR-M5-05 | TC-108 | MS4 |

### Modulo 5 — Documentale

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-M5-00 | Regole di impaginazione | M | — | AC-FR-M5-00-1 | TC-110 | MS2 |
| FR-M5-01 | Verbale di sopralluogo | M | BR-08, BR-09 | AC-FR-M5-01-1 | TC-111 | MS4 |
| FR-M5-02 | Firma dei documenti | M | BR-08 | AC-FR-M5-02-1 | TC-112 | MS2 |
| FR-M5-03 | Archivio documenti | M | BR-09 | AC-FR-M5-03-1 | TC-113 | MS2 |
| FR-M5-04 | Determinismo | M | BR-21 | AC-FR-M5-04-1 | TC-114 | MS2 |
| FR-M5-05 | Invio dei documenti | M | — | AC-FR-M5-05-1 | TC-115 | MS4 |
| FR-M5-10 | Riepilogo di approvazione | M | BR-01 | AC-FR-M5-10-1 | TC-116 | MS3 |
| FR-M5-20 | Relazione tecnica R.A.I. | M | BR-06, BR-08 | AC-FR-M5-20-1 | TC-117 | MS2 |
| FR-M5-21 | Varianti della relazione | M | BR-06 | AC-FR-M5-20-1 | TC-118 | MS2 |
| FR-M5-22 | Revisioni della relazione | M | BR-21 | AC-FR-M5-22-1 | TC-119 | MS2 |

### Modulo 6 — SaaS self-service e servizi FDS

**Legenda milestone aggiuntiva:** MS5 = Commercializzazione self-service (cap. 10). Le parti marcate "Beta" nel Modulo 6 si realizzano già nelle milestone precedenti.

| ID | Descrizione | Pri (Beta/Lancio) | BR | AC | TC | MS |
|----|-------------|-------------------|----|----|----|----|
| FR-M6-01 | Registrazione self-service | S/M | — | — | TC-160 | MS5 |
| FR-M6-02 | Provisioning automatico del tenant | M/M | BR-26 | AC-FR-M6-02-1/2 | TC-161 | MS1 |
| FR-M6-03 | Progetto demo | S/M | — | — | TC-162 | MS5 |
| FR-M6-04 | Trial | C/M | BR-27, BR-29 | AC-FR-M6-04-1 | TC-163 | MS5 |
| FR-M6-05 | Piani ed entitlements | M/M | BR-28, BR-29 | AC-FR-M6-05-1/2 | TC-164 | MS1 |
| FR-M6-06 | Abbonamento Stripe | W/M | BR-30 | AC-FR-M6-06-1 | TC-165 | MS5 |
| FR-M6-07 | Fatturazione elettronica SDI | W/M | BR-30 | AC-FR-M6-07-1 | TC-166 | MS5 |
| FR-M6-08 | Cambio piano | W/M | BR-29 | — | TC-167 | MS5 |
| FR-M6-09 | Consumi e quote | M/M | BR-29 | vedi AC-FR-M0-13-1 | TC-168 | MS1 |
| FR-M6-10 | Servizi FDS (concierge) | S/M | BR-15 | AC-FR-M6-10-1 | TC-169 | MS3 |
| FR-M6-11 | Coupon ed early adopter | W/M | BR-30 | — | TC-170 | MS5 |
| FR-M6-12 | Referral | W/C | — | — | TC-171 | — |
| FR-M6-13 | Badge "Redatto con" | C/S | BR-28 | AC-FR-M6-13-1 | TC-172 | MS5 |
| FR-M6-14 | Back-office commerciale | S/M | BR-15 | — | TC-173 | MS1 |
| FR-M6-15 | Metriche di attivazione | S/M | — | — | TC-174 | MS3 |
| FR-M6-16 | Disdetta | W/M | BR-13, BR-29 | — | TC-175 | MS5 |
| FR-M6-17 | Termini e DPA | M/M | — | — | TC-176 | MS1 |
| FR-M6-18 | Email del ciclo di vita | C/S | — | — | TC-177 | MS5 |
| FR-M6-19 | Lead magnet | W/C | — | — | TC-178 | — |

### Funzioni trasversali

| ID | Descrizione | Pri | BR | AC | TC | MS |
|----|-------------|-----|----|----|----|----|
| FR-MT-01 | Autenticazione | M | — | AC-FR-MT-01-1 | TC-130, TC-SEC-07 | MS1 |
| FR-MT-02 | Sessioni | M | — | AC-FR-MT-02-1 | TC-131 | MS1 |
| FR-MT-03 | Selezione del tenant | M | BR-04 | AC-FR-MT-03-1 | TC-132, TC-SEC-01 | MS1 |
| FR-MT-04 | Profilo personale | M | BR-08 | — | TC-133 | MS1 |
| FR-MT-05 | Centro notifiche | S | — | — | TC-134 | MS3 |
| FR-MT-06 | Notifiche email | M | — | AC-FR-MT-06-1 | TC-135 | MS3 |
| FR-MT-07 | Audit log | M | BR-15 | AC-FR-MT-07-1 | TC-136 | MS1 |
| FR-MT-08 | Ricerca globale | S | BR-04 | AC-FR-MT-08-1 | TC-137 | MS3 |
| FR-MT-09 | Esportazione dei dati del tenant | M | BR-13 | AC-FR-MT-09-1 | TC-138 | MS4 |
| FR-MT-10 | Diritti degli interessati | M | BR-13 | — (procedura) | TC-139 | MS4 |
| FR-MT-11 | Aiuto e onboarding | S | — | — | TC-140 | MS3 |
| FR-MT-12 | Predisposizione i18n | M | — | AC-FR-MT-12-1 | TC-141 | MS1 |
| FR-MT-13 | Accessibilità | M | — | vedi NFR-UX-04 | TC-142 | MS3 |
| FR-MT-14 | Sessione di supporto | S | BR-15 | AC-FR-MT-14-1 | TC-143 | MS4 |
| FR-MT-15 | Console del Platform Admin | M | BR-15 | — | TC-144 | MS1 |
| FR-MT-16 | Feedback della Beta | M | — | — | TC-145 | MS1 |
| FR-MT-17 | Banner di manutenzione | S | — | — | TC-146 | MS3 |
| FR-MT-18 | Errori lato utente | M | — | AC-FR-MT-18-1 | TC-147 | MS1 |
| FR-MT-19 | Cookie e tracciamento | M | — | — (revisione legale) | TC-148 | MS1 |

---

## 9.3 Criteri di accettazione aggiuntivi

- **AC-FR-M0-02-1** — *Data* una P.IVA `12345678901` con check digit errato, *quando* l'Owner salva il profilo, *allora* il campo è segnato come non valido e il salvataggio è bloccato.
- **AC-FR-M0-05-1** — *Dato* un branding modificato 3 volte, *quando* l'Owner ripristina la penultima configurazione dalla cronologia, *allora* logo e colori tornano quelli di quella configurazione.
- **AC-FR-M0-06-1** — *Dato* il tenant `studio-rossi`, *quando* un committente apre `https://studio-rossi.{dominio}/portal`, *allora* vede logo e colori dello Studio Rossi senza alcun elemento di un altro tenant, anche durante il caricamento (`NFR-BRAND-03`).
- **AC-FR-M0-09-1** — *Dato* il nome dello studio "Studio Rossi Architetti", *quando* parte una notifica al committente, *allora* il mittente visualizzato è "Studio Rossi Architetti", il Reply-To è l'email dello studio e l'email non contiene loghi della piattaforma.
- **AC-FR-M0-11-1** — *Dato* il pattern `{YYYY}-{NNN}` e l'ultima commessa del 2026 con codice `2026-014`, *quando* si crea una nuova commessa nel 2026, *allora* il codice proposto è `2026-015`; per la prima commessa del 2027 è `2027-001`.
- **AC-FR-M0-13-1** — *Dato* uno storage al 100% della quota, *quando* un architetto carica un nuovo elaborato, *allora* l'upload è bloccato con un messaggio; *quando* invece un DL sincronizza le foto di un sopralluogo già iniziato, *allora* l'upload è accettato entro la tolleranza del 5%.
- **AC-FR-M1-02-1** — *Dato* un Collaboratore assegnato a 2 commesse su 10, *quando* apre l'elenco o fa una ricerca, *allora* vede e trova solo quelle 2.
- **AC-FR-M1-03-1** — *Data* una commessa Chiusa con periodo di grazia di 30 giorni, *quando* sono passati 31 giorni, *allora* i Magic Link dei committenti sono revocati in automatico e l'audit log registra la revoca con attore `system`.
- **AC-FR-M1-07-1** — *Dato* un verbale non condiviso, *quando* il committente apre "Documenti", *allora* non lo vede; *dopo* la condivisione esplicita, *allora* lo vede e lo scarica tramite un URL firmato.
- **AC-FR-M2-01-1** — *Dato* un file `tavola.pdf` che in realtà è un PNG rinominato, *quando* viene caricato, *allora* il sistema lo riconosce come PNG e lo elabora come immagine; *dato* un file `.pdf` che è un eseguibile, *allora* è rifiutato ed è registrato un evento di sicurezza.
- **AC-FR-M2-02-1** — *Dato* un PDF di 50 pagine A3, *quando* viene caricato, *allora* entro 2 minuti tutte le pagine hanno la miniatura e sono navigabili, e l'autore riceve la notifica "Elaborato pronto".
- **AC-FR-M2-04-1** — *Date* 5 bozze selezionate, *quando* l'architetto le pubblica insieme con un messaggio, *allora* il committente riceve **una sola** email che elenca le 5 tavole con il messaggio.
- **AC-FR-M2-05-1** — *Data* una scadenza di revisione passata senza risposta, *allora* l'elaborato resta "Pubblicato — in attesa" e non viene mai approvato in automatico (`BR-19`).
- **AC-FR-M2-06-1** — *Dato* un iPad con una tavola A0 aperta, *quando* il committente fa pinch-zoom fino al 400% e pan, *allora* la navigazione resta fluida (≥ 30 fps percepiti) e i dettagli si caricano progressivamente senza schermate bianche oltre 1 s.
- **AC-FR-M2-09-1** — *Dati* 3 pin a meno di 20 px di distanza a zoom 25%, *quando* l'utente guarda la tavola, *allora* vede un cluster "3"; *quando* ingrandisce, *allora* vede i 3 pin separati.
- **AC-FR-M2-11-1** — *Dato* un pin Risolto su una versione Pubblicata, *quando* il committente autore lo riapre con un commento, *allora* torna Aperto e lo studio riceve una notifica; *dato* un pin su una versione Superata, *allora* il pulsante di riapertura non c'è.
- **AC-FR-M2-13-1** — *Dati* 4 pin aperti sulla v2, *quando* lo studio li trasferisce alla v3, *allora* sulla v3 ci sono 4 pin nelle stesse coordinate percentuali con il link all'originale, e sulla v2 risultano "Congelato — trasferito".
- **AC-FR-M2-14-1** — *Data* una versione con 12 pin, *quando* lo studio esporta i commenti, *allora* il PDF contiene la tavola con 12 marker numerati e l'elenco dei 12 thread completi.
- **AC-FR-M2-16-1** — *Data* una versione approvata, *quando* l'Owner apre il log di congelamento, *allora* vede la cronologia completa in ordine cronologico e può scaricarla, e nessun evento risulta modificabile.
- **AC-FR-M2-17-1** — *Data* una versione approvata, *quando* il committente invia una richiesta di modifica e lo studio la marca "Extra contratto", *allora* la richiesta compare nel widget "Richieste di modifica" come extra-scope e il committente vede l'esito.
- **AC-FR-M2-18-1** — *Dato* un URL firmato di download generato 6 minuti prima, *quando* qualcuno lo apre, *allora* riceve un errore di link scaduto.
- **AC-FR-M3-02-1** — *Data* un'unità immobiliare con 3 abitanti e vani abitabili per 38 mq totali, *allora* la verifica per abitanti risulta Non conforme (minimo 42 mq); con 45 mq risulta Conforme.
- **AC-FR-M3-03-1** — *Data* la destinazione "Ripostiglio", *allora* il vano non mostra la sezione R.A.I. e ha esito "Non richiesto"; *cambiando* la destinazione in "Camera singola", *allora* compare la sezione aperture e l'esito diventa "Dati incompleti".
- **AC-FR-M3-06-1** — *Data* un'apertura con apribilità "Parziale" senza `Sa`, *quando* si salva, *allora* il campo `Sa` è segnato come obbligatorio.
- **AC-FR-M3-07-1** — *Dato* il tipo W1 usato in 6 vani, *quando* se ne cambia la larghezza, *allora* il sistema mostra "6 vani saranno ricalcolati" e, dopo la conferma, tutti gli esiti si aggiornano.
- **AC-FR-M3-09-1** — *Data* un'apertura ridotta dalla quota di esclusione, *allora* la riga mostra l'icona informativa con il testo che quantifica la riduzione e il riferimento del profilo.
- **AC-FR-M3-14-1** — *Data* un'unità di tipo monostanza di 24 mq senza deroga, *allora* l'esito della monostanza è Non conforme (minimo 28 mq); con D-01 attiva e motivata, *allora* è "Subordinato ad asseverazione" (minimo 20 mq per 1 persona).
- **AC-FR-M3-15-1** — *Dato* un fabbricato con 2 unità e 11 vani, *allora* il quadro riepilogativo riporta subtotali per unità e totali che coincidono con la somma dei valori dei singoli vani (verifica automatica di coerenza).
- **AC-FR-M4-01-1** — *Dato* un iPhone con iOS supportato, *quando* l'utente aggiunge la PWA alla schermata home, *allora* l'icona e il nome sono quelli dello studio e l'app si apre a schermo intero.
- **AC-FR-M4-02-1** — *Dato* un DL assegnato a 3 commesse attive, *quando* apre la PWA, *allora* vede le 3 commesse ordinate per ultimo sopralluogo, con i badge dei dati da sincronizzare.
- **AC-FR-M4-03-1** — *Dato* un dispositivo offline, *quando* il DL crea un sopralluogo, *allora* vede "N. provvisorio"; alla sincronizzazione riceve il numero definitivo progressivo della commessa.
- **AC-FR-M4-04-1** — *Dato* un sopralluogo senza presenti oltre al DL, *quando* il DL prova a finalizzare, *allora* la finalizzazione è consentita (il DL basta); *dato* un sopralluogo senza DL tra i presenti, *allora* è bloccata.
- **AC-FR-M4-05-1** — *Data* una foto HEIC da 8 MB scattata con iPhone, *quando* viene caricata, *allora* sul server c'è un JPEG ≤ 1,5 MB, orientato correttamente, con data di scatto preservata; nei PDF destinati a terzi non ci sono coordinate GPS nei metadati.
- **AC-FR-M4-06-1** — *Date* 10 foto, *quando* il DL sposta la foto 8 in prima posizione, *allora* la numerazione nel verbale diventa coerente (la ex 8 diventa Foto 1) e i rimandi "vedi Foto n" nei blocchi si aggiornano.
- **AC-FR-M4-09-1** — *Data* una nota vocale di 3 minuti in italiano registrata in ambiente silenzioso, *allora* la trascrizione è disponibile entro 60 s con un tasso d'errore sulle parole ≤ 10% sul corpus di riferimento.
- **AC-FR-M4-15-1** — *Data* una difformità aperta nel verbale n. 2, *quando* il DL crea il sopralluogo n. 3, *allora* il sistema propone la voce da verificare; se il DL la segna "risolta", nel verbale n. 3 compare "Difformità 2.1 del verbale n. 2: risolta".
- **AC-FR-M5-02-1** — *Dato* un architetto senza numero di iscrizione all'albo, *quando* prova a finalizzare un verbale o una relazione asseverativa, *allora* il sistema blocca con `SIGNER_NOT_QUALIFIED` e porta al profilo.
- **AC-FR-M5-03-1** — *Dato* un documento definitivo, *quando* un Owner prova a eliminarlo, *allora* c'è solo l'opzione "Annulla con motivazione" e il documento resta in archivio con filigrana.
- **AC-FR-M5-05-1** — *Dato* un verbale di 14 MB, *quando* viene inviato, *allora* l'email contiene un link di download con scadenza a 7 giorni invece dell'allegato, e l'esito della consegna è registrato.
- **AC-FR-M5-22-1** — *Data* una relazione Rev. 0 emessa, *quando* l'architetto genera la Rev. 1, *allora* deve indicare il motivo della revisione e la Rev. 0 resta consultabile e invariata.
- **AC-FR-MT-01-1** — *Dati* 10 tentativi di login falliti in 15 minuti, *allora* l'account è bloccato per 30 minuti, l'utente riceve un'email e l'evento compare nell'audit log.
- **AC-FR-MT-02-1** — *Dato* un utente con sessioni su 3 dispositivi, *quando* sceglie "Esci da tutti gli altri dispositivi", *allora* le altre 2 sessioni vengono invalidate entro 60 s.
- **AC-FR-MT-03-1** — *Dato* un utente membro dei tenant A e B, *quando* passa da A a B, *allora* nessun dato di A resta visibile (cache compresa) e ogni chiamata successiva opera solo su B.
- **AC-FR-MT-06-1** — *Dati* 6 commenti del committente in 5 minuti sulla stessa commessa, *allora* il team riceve **una** email riepilogativa (finestra di 10 minuti) e non 6.
- **AC-FR-MT-07-1** — *Data* un'approvazione, *allora* l'audit log contiene un evento con attore, versione, IP, user agent ed esito, e non esiste alcuna API o interfaccia per modificarlo o eliminarlo.
- **AC-FR-MT-08-1** — *Data* la parola "massetto" presente in verbali dei tenant A e B, *quando* un utente di A cerca "massetto", *allora* trova solo i risultati di A.
- **AC-FR-MT-09-1** — *Dato* un tenant con 3 commesse, *quando* l'Owner chiede l'esportazione, *allora* riceve entro 1 ora un link a uno ZIP con tutti i file originali e i dati in JSON/CSV, e il README descrive la struttura.
- **AC-FR-MT-12-1** — *Data* la build dell'applicazione, *quando* un controllo automatico cerca stringhe di interfaccia non esternalizzate nei template, *allora* non ne trova.
- **AC-FR-MT-14-1** — *Data* una sessione di supporto di 2 ore in sola lettura, *quando* l'operatore prova a modificare un dato, *allora* l'operazione è rifiutata; *alla scadenza*, *allora* l'accesso termina e l'Owner riceve l'email di chiusura.
- **AC-FR-MT-18-1** — *Dato* un errore interno del server, *allora* l'utente vede un messaggio in italiano con un codice di riferimento e nessun dettaglio tecnico, e il log contiene l'errore completo con lo stesso id.

---

## 9.4 Casi di test di sicurezza trasversali

| TC | Scenario | Risultato atteso |
|----|----------|------------------|
| TC-SEC-01 | Per **ogni** endpoint: utente del tenant A con ID di risorse del tenant B | 404, nessun dato, evento di sicurezza (`BR-04`) |
| TC-SEC-02 | Magic Link della commessa X usato per risorse della commessa Y dello stesso tenant | 404 |
| TC-SEC-03 | Payload XSS in tutti i campi di testo (commenti, didascalie, nomi, note, dati dello studio) mostrati in interfaccia, email e PDF | Mostrati come testo, nessuna esecuzione |
| TC-SEC-04 | Riutilizzo di un URL firmato scaduto o manomesso | Rifiutato |
| TC-SEC-05 | Upload di file malevoli (polyglot, zip bomb, PDF con JavaScript) | Rifiutati o neutralizzati |
| TC-SEC-06 | SVG con script, gestori di eventi, riferimenti esterni, entità XML (XXE) | Sanificato, nessuna richiesta esterna |
| TC-SEC-07 | Brute force su login, OTP e token | Limitato secondo `NFR-SEC-05` |
| TC-SEC-08 | Committente che chiama API riservate allo studio (es. pubblicazione, R.A.I.) | 403/404 |
| TC-SEC-09 | Manipolazione degli ID nelle chiamate di sincronizzazione offline (id di un altro tenant) | Rifiutata |
| TC-SEC-10 | Chiamata diretta all'API per approvare una versione Superata o Approvata | 409 |

## 9.5 Corpus di regressione del motore R.A.I. (TC-R)

Il corpus è un **file di dati versionato nel repository** (input → output atteso), eseguito automaticamente in CI sia contro la libreria di calcolo lato client sia contro quella lato server (`FR-M3-10`).

| TC | Contenuto |
|----|-----------|
| TC-R-01..07 | I casi AC-FR-M3-08-1..7 |
| TC-R-08 | Vano con 3 aperture miste (verticale, in falda, fissa) |
| TC-R-09 | Aperture con quantità > 1 |
| TC-R-10..12 | Altezze: piano, inclinato, montano |
| TC-R-13..15 | Deroghe D-01, D-03, D-99 |
| TC-R-16..17 | Vani ciechi con e senza aspirazione |
| TC-R-18 | Verifiche d'insieme dell'unità (monostanza, abitanti) |
| TC-R-20..40 | **Casi reali dello studio partner** (almeno 3 progetti completi), con esiti validati a mano dal professionista (KPI-04) |
| TC-R-99 | Equivalenza dei risultati client e server su tutto il corpus (differenza = 0) |

## 9.6 Corpus di valutazione AI (TC-AI)

Da 30 a 50 registrazioni di cantiere (reali, con consenso, o recitate in cantiere reale) con la **strutturazione attesa annotata** dallo studio partner. Metriche: correttezza del blocco assegnato, completezza (voci attese presenti), **fatti inventati = 0**, tasso d'errore sulle parole della trascrizione. Soglie in `NFR-AI-01`.
