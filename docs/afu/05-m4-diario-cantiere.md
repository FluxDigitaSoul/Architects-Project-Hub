# 5.4 Modulo 4 — Diario di cantiere mobile e audio AI

**Obiettivo:** il Direttore dei Lavori chiude il verbale di sopralluogo **prima di lasciare il cantiere**, usando solo lo smartphone, anche con una connessione scarsa.

**Contesto d'uso (vincoli di design):** una mano libera (l'altra regge il casco, la cartellina o si appoggia a un ponteggio), guanti leggeri, luce solare diretta, rumore di fondo (macchinari, traffico), polvere, batteria limitata, segnale intermittente o assente (seminterrati, zone rurali).

---

## FR-M4-01 — PWA installabile e mobile-first · **M**

- Installabile sulla schermata home (manifest con icone e colore del tenant — FR-M0-03).
- **Target dispositivi:** iOS Safari ≥ 16.4 e Android Chrome delle ultime 2 versioni principali; viewport di riferimento 360–430 px di larghezza.
- **Ergonomia a una mano:** azioni primarie nella fascia bassa dello schermo (zona del pollice); target di tocco ≥ 48 × 48 px; pulsante principale flottante "＋" con azioni rapide (Foto, Vocale, Nota).
- **Leggibilità all'aperto:** modalità ad alto contrasto attivabile; testo base ≥ 16 px.
- **Nessuna azione distruttiva a portata di un tap accidentale:** le eliminazioni chiedono conferma o sono annullabili (toast "Annulla" per 5 s).

## FR-M4-02 — Lista "I miei cantieri" · **M**

Home mobile con le commesse attive in cui l'utente è DL o assegnato, ordinate per ultimo sopralluogo; ricerca; indicatore dei sopralluoghi in bozza o non sincronizzati; la commessa più vicina alla posizione attuale in evidenza (Could, con permesso di geolocalizzazione).

## FR-M4-03 — Creazione del sopralluogo · **M**

- Un tap da "Nuovo sopralluogo" su una commessa. Funziona **anche offline** (id generato sul dispositivo — UUID v7).
- Data e ora di inizio automatiche (modificabili); ora di fine alla chiusura.
- **Numero del verbale:** assegnato **dal server** alla prima sincronizzazione riuscita, per garantire la progressione senza buchi (`BR-16`). Offline si mostra "N. provvisorio".
- Un solo sopralluogo **in bozza** per commessa e utente alla volta; il sistema propone di riprendere quello esistente (`EC-13`).

## FR-M4-04 — Dati del sopralluogo · **M**

| Campo | Obbligatorio | Note |
|-------|--------------|------|
| Data e ora di inizio / fine | Sì | |
| Tipo | Sì | Ordinario, straordinario, su richiesta del committente, collaudo/verifica finale |
| Presenti | Sì (almeno il DL) | Scelti tra team, committenti e imprese della commessa, più nominativi liberi con qualifica (es. "Mario Bianchi — capocantiere, Impresa Edil Srl") |
| Condizioni meteo | No | Selezione rapida (sereno, nuvoloso, pioggia, neve, vento) + temperatura. **Should:** precompilazione automatica da un servizio meteo in base a coordinate e ora, se c'è rete |
| Fase dei lavori / WBS | No | Testo o scelta da un elenco configurabile |
| Posizione GPS | No | Registrata con il consenso dell'utente, come prova della presenza in cantiere (Should) |

## FR-M4-05 — Acquisizione fotografica · **M**

- **Scatto diretto** dalla fotocamera (input nativo, fotocamera posteriore) e **selezione multipla** dalla galleria.
- **Scatto a raffica guidato:** dopo ogni scatto l'app torna subito in modalità fotocamera, senza passaggi intermedi.
- **Compressione sul dispositivo** prima dell'upload: lato lungo 2.560 px, JPEG qualità 0,82 (circa 0,5–1,5 MB). L'originale **non** viene caricato, salvo opzione "Alta qualità" (`Q-12`).
- **Metadati:** data e ora di scatto (dall'EXIF o dal dispositivo), coordinate GPS se presenti e autorizzate, orientamento corretto. **I dati EXIF sensibili vengono rimossi** prima della condivisione esterna (`NFR-PRIV-03`).
- **HEIC/HEIF (iOS):** convertito in JPEG sul dispositivo se il browser lo supporta, altrimenti lato server.
- **Limiti:** 200 foto per sopralluogo; 20 MB per singolo file prima della compressione.

## FR-M4-06 — Organizzazione delle foto · **M**

- Ordinamento automatico per ora di scatto, modificabile con trascinamento → **numero progressivo** (Foto 1, 2, …) usato nel verbale.
- **Didascalia** per foto (max 300 caratteri), con dettatura tramite la tastiera del sistema operativo.
- **Collegamento a un blocco** del verbale: Avanzamento / Difformità / Disposizioni / Generale (Should).
- Selezione di quali foto includere nel PDF (predefinito: tutte).
- **Annotazione sulla foto (Could):** freccia, cerchio, testo, salvati come una nuova immagine derivata, mantenendo l'originale.

## FR-M4-07 — Galleria del cantiere · **S**

Vista cronologica di tutte le foto della commessa, raggruppate per data e sopralluogo, con filtro per blocco e ricerca nelle didascalie.

## FR-M4-08 — Registratore audio in-app · **M**

- Pulsante grande "Tieni premuto per registrare" **oppure** tap per avviare e tap per fermare (preferenza utente); indicatore del livello di ingresso e del tempo trascorso.
- **Più note vocali** per sopralluogo, ognuna al massimo di 10 minuti (`Q-13`); avviso a 9 minuti.
- **Formato:** quello nativo del browser (tipicamente `audio/mp4`/AAC su iOS, `audio/webm`/Opus su Android), mono, circa 32–64 kbps.
- **Robustezza:** l'audio si salva **a blocchi in locale durante la registrazione** (ogni 5 s), così una chiamata in arrivo, il blocco dello schermo o la chiusura dell'app non fanno perdere la registrazione (`EC-06`).
- Riascolto, eliminazione (prima della finalizzazione), rinomina.
- **Wake lock:** lo schermo resta acceso durante la registrazione, se il browser lo supporta.
- Richiesta del permesso del microfono con una spiegazione chiara; se viene negato, si mostra una guida per riattivarlo e si offre l'inserimento manuale del testo.

## FR-M4-09 — Trascrizione (ASR) · **M**

- Parte in automatico quando l'audio è sincronizzato sul server.
- Lingua: **italiano** (`it-IT`). Vocabolario personalizzato con i termini edilizi più frequenti (massetto, cappotto, getto, pilastro, solaio, controtelaio, impermeabilizzazione, DURC, POS, PSC, ponteggio, SAL…) più un glossario del tenant (Should).
- Output: testo con punteggiatura, marcatori temporali per segmento e **confidenza per segmento**.
- Stato del job visibile (SM-JOB-AI). Tempo obiettivo: ≤ 60 s per 5 minuti di audio (`NFR-PERF-06`).

## FR-M4-10 — Normalizzazione e strutturazione AI · **M**

Un modello linguistico riceve la trascrizione e il **contesto della commessa** (titolo, indirizzo, imprese, presenti, data) e produce una **bozza strutturata** in tre blocchi:

| Blocco | Contenuto atteso | Formato di output |
|--------|------------------|-------------------|
| 1. **Avanzamento e lavorazioni in corso** | Lavori eseguiti dall'ultimo sopralluogo, lavorazioni in corso, stato generale | Elenco puntato di frasi complete |
| 2. **Difformità, non conformità e fermi di cantiere** | Scostamenti dal progetto, vizi, problemi di sicurezza, sospensioni | Elenco di voci con: descrizione, localizzazione (se detta), gravità proposta (bassa/media/alta) |
| 3. **Disposizioni e ordini di servizio all'impresa** | Istruzioni impartite | Elenco di voci con: destinatario (impresa), azione, **termine** (data o "entro N giorni", se detto) |

**Vincoli per il modello (istruzioni di sistema, verificate nei test):**
1. **Non inventare fatti:** ogni voce deve derivare dalla trascrizione. Niente misure, date, nomi o quantità non presenti nell'audio.
2. Correggere la forma (grammatica, ripetizioni, intercalari come "ehm", "allora", "cioè") mantenendo il significato.
3. Uniformare la terminologia tecnica e scrivere i numeri in cifre con le unità di misura.
4. Se un'informazione è ambigua, segnalarla con il marcatore `[DA VERIFICARE: …]` invece di interpretarla.
5. Ciò che non rientra in nessun blocco va in "Note generali" (quarto blocco facoltativo), non va scartato.
6. Output in **JSON validato contro uno schema**. Se la risposta non rispetta lo schema: un nuovo tentativo, poi fallback (`EC-05`).
7. Stile: terza persona impersonale, registro tecnico-formale (es. "Si dispone all'impresa di…").

**Tracciabilità:** per ogni bozza si salvano la versione del prompt, il modello usato, la data, la trascrizione di partenza e il testo generato (`NFR-AI-02`).

**Trasparenza:** la bozza è marcata in interfaccia come "Generata con AI — da verificare" (`BR-05`, AI Act art. 50 — vedi cap. 12).

## FR-M4-11 — Nota scritta rapida · **M**

In alternativa o in aggiunta all'audio, testo libero (anche con la dettatura della tastiera). Il testo entra nella strutturazione AI insieme alle trascrizioni, oppure si inserisce direttamente in un blocco.

## FR-M4-12 — Editing e validazione rapida · **M**

- Editor dei tre blocchi ottimizzato per mobile: ogni voce è una card modificabile, eliminabile e riordinabile, con la possibilità di spostarla in un altro blocco.
- Le voci con `[DA VERIFICARE]` sono evidenziate e **bloccano la finalizzazione** finché non vengono risolte (modificate o confermate) (`BR-05`).
- Le parti a bassa confidenza della trascrizione sono sottolineate; con un tap si ascolta il segmento audio corrispondente (Should).
- **Cronologia delle modifiche:** si conservano la bozza AI originale e le modifiche umane (per KPI-02 e per la tracciabilità).
- **Rigenera** la bozza AI (con conferma, se ci sono già modifiche manuali, che andrebbero perse).

## FR-M4-13 — Finalizzazione · **M**

Precondizioni: utente DL della commessa (o Owner); almeno un presente; nessuna voce `[DA VERIFICARE]` aperta; tutte le foto e gli audio sincronizzati (`BR-23`).

Effetti:
1. Conferma esplicita: "Finalizzando, il verbale n. X non sarà più modificabile".
2. Genera il PDF definitivo (FR-M5-01) con numero definitivo, hash e marca temporale del server.
3. Stato → **Finalizzato**. Testo, foto incluse e audio collegati diventano immutabili (`BR-09`).
4. Le difformità del blocco 2 e le disposizioni del blocco 3 con termine entrano nel **registro delle azioni aperte** della commessa (FR-M4-15).

## FR-M4-14 — Funzionamento offline e sincronizzazione · **M**

Vedi anche `EC-07`.

| Funzione | Offline |
|----------|---------|
| Aprire le commesse già consultate (anagrafica, presenti possibili, imprese) | ✅ (cache) |
| Creare un sopralluogo, compilare i dati | ✅ |
| Scattare e organizzare foto, didascalie | ✅ |
| Registrare audio | ✅ |
| Scrivere note e modificare i blocchi | ✅ |
| Trascrizione e strutturazione AI | ❌ (in coda) |
| Finalizzazione e PDF definitivo | ❌ (serve il server per numero, hash e timestamp) |
| Anteprima PDF | ⚠️ Solo come bozza semplificata generata sul dispositivo (Could) |

**Regole di sincronizzazione:**
- **Coda locale persistente** (IndexedDB) di operazioni e file; sopravvive a chiusura dell'app e riavvio del telefono.
- **Upload idempotenti:** ogni operazione porta un id generato sul client. Il server ignora i duplicati (`BR-24`).
- **Upload a blocchi riprendibili** per foto e audio sopra 1 MB.
- **Ritentativi** con backoff esponenziale (1 s, 2 s, 4 s… fino a 5 minuti), ripartenza immediata al ritorno della rete (`online`) e all'apertura dell'app.
- **iOS:** Safari non supporta la Background Sync API, quindi la sincronizzazione avviene **solo con l'app aperta**. L'interfaccia deve dirlo chiaramente: "3 elementi in attesa di invio — tieni l'app aperta" (`EC-08`).
- **Indicatore di stato sempre visibile:** "Tutto sincronizzato" / "N elementi in attesa" / "Offline" / "Errore di sincronizzazione", con dettaglio per elemento e pulsante "Riprova".
- **Spazio del dispositivo:** stima della quota disponibile (Storage API) e avviso sotto i 200 MB. Viene richiesta la persistenza dello storage (`navigator.storage.persist()`) per evitare che il browser lo liberi.
- **Conflitti:** la bozza di un sopralluogo appartiene a un solo utente e dispositivo. Se lo stesso sopralluogo viene modificato da due dispositivi, vince l'ultima scrittura **per singolo campo**, e un avviso mostra la versione sovrascritta, recuperabile per 7 giorni (`EC-14`).
- **Nessuna perdita silenziosa:** un elemento si rimuove dalla coda locale **solo** dopo la conferma del server (`BR-24`).

## FR-M4-15 — Registro delle azioni aperte (difformità e disposizioni) · **S**

Elenco per commessa delle difformità e degli ordini di servizio emersi nei verbali, con stato (Aperta / Risolta / Superata), termine, verbale di origine e verbale di chiusura. Nel sopralluogo successivo il sistema propone le voci aperte da verificare ("Verificata risolta?"), così nasce la catena di tracciabilità tra i verbali.

## FR-M4-16 — Condivisione del sopralluogo · **M**

Vedi FR-M5-05 (invio del PDF).

---

## Criteri di accettazione chiave del Modulo 4

- **AC-FR-M4-08-1** — *Data* una registrazione in corso da 2 minuti, *quando* arriva una telefonata e l'utente risponde, *allora* al ritorno nell'app almeno i primi 1:55 di audio sono salvati e riproducibili, e l'utente può avviare una nuova registrazione.
- **AC-FR-M4-10-1** — *Data* la trascrizione "Allora, il massetto al primo piano è finito. Ehm, ho visto che il bagno ha lo scarico spostato di venti centimetri rispetto al progetto. Dico all'impresa di rifarlo entro venerdì.", *quando* la strutturazione AI è completata, *allora* il blocco 1 contiene una voce sul completamento del massetto al primo piano; il blocco 2 una difformità sullo scarico del bagno spostato di 20 cm rispetto al progetto; il blocco 3 una disposizione all'impresa di ripristinare la posizione dello scarico con termine "venerdì" risolto in una data se la data del sopralluogo è nota, altrimenti marcato `[DA VERIFICARE]`; e nessun blocco contiene fatti assenti dalla trascrizione.
- **AC-FR-M4-12-1** — *Data* una bozza con una voce `[DA VERIFICARE]`, *quando* il DL preme "Finalizza", *allora* il sistema blocca e porta alla voce da verificare.
- **AC-FR-M4-14-1** — *Dato* uno smartphone in modalità aereo, *quando* il DL crea un sopralluogo, scatta 15 foto, registra 2 note vocali e chiude l'app, poi la riapre con la rete attiva, *allora* tutti i 17 elementi vengono caricati una volta sola (nessun duplicato sul server), la trascrizione parte da sola e l'indicatore passa a "Tutto sincronizzato".
- **AC-FR-M4-14-2** — *Dato* un upload di foto interrotto al 60% da una perdita di rete, *quando* la rete torna, *allora* l'upload riprende dal blocco interrotto e non ricomincia da zero.
- **AC-FR-M4-13-1** — *Dato* un verbale finalizzato, *quando* un qualsiasi utente prova a modificarne il testo o a eliminarne una foto inclusa (anche tramite API), *allora* il server rifiuta con `409 REPORT_FINALIZED`.
