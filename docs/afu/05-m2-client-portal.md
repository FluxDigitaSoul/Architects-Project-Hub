# 5.2 Modulo 2 — Client Portal e Visual Pinning (Design Review)

**Obiettivo:** sostituire email, screenshot annotati e messaggi con un unico flusso tracciato: pubblicazione → commento puntuale → risposta → risoluzione → approvazione formale con prova digitale.

**Superfici:** *App dello studio* (desktop) e *Portale del committente* (desktop e tablet come target primario, smartphone in consultazione — `NFR-UX-02`).

---

## A. Gestione degli elaborati

### FR-M2-01 — Upload degli elaborati · **M**

| Aspetto | Specifica |
|---------|-----------|
| Formati | PDF (anche multipagina), PNG, JPG/JPEG, WebP. **Should:** TIFF (convertito). **Won't:** DWG/DXF/IFC (fuori perimetro) |
| Dimensione massima | 200 MB per file (configurabile per piano) |
| Risoluzione massima raster | 20.000 × 20.000 px (400 MP); oltre, il sistema rifiuta con un messaggio esplicito (`EC-01`) |
| Pagine massime per PDF | 200; oltre, il sistema chiede di dividere il file (`EC-01`) |
| Upload multiplo | Sì, con drag & drop e barra di avanzamento per ogni file |
| Upload riprendibile | Upload a blocchi (multipart) per i file sopra i 10 MB: se la connessione cade, riprende dal punto in cui si era fermato |
| Controllo del contenuto | Tipo reale del file verificato sui "magic bytes", non sull'estensione; PDF cifrati o protetti da password rifiutati con un messaggio; scansione antimalware prima della pubblicazione (`NFR-SEC-08`) |

**Metadati dell'elaborato:**

| Campo | Obbligatorio | Note |
|-------|--------------|------|
| Titolo | Sì | Precompilato dal nome del file |
| Codice tavola | No | es. `A-101`, unico per commessa se presente |
| Categoria | Sì | Rilievo, Stato di fatto, Progetto, Comparativa, Render, Esecutivo, Particolare costruttivo, Altro |
| Fase | No | Studio di fattibilità, Preliminare, Definitivo, Esecutivo, Variante, As-built |
| Scala | No | es. `1:100`, `1:50` (solo informativa) |
| Note per il committente | No | Testo mostrato nel portale sopra il viewer |
| Download consentito al committente | Sì (bool) | Predefinito: vero |

### FR-M2-02 — Elaborazione dei file e anteprime · **M**

Dopo l'upload il sistema, in modo asincrono:
1. estrae le pagine dai PDF (una `DrawingPage` per pagina, con dimensioni e rotazione);
2. genera le **miniature** (lato lungo 400 px) e un'**anteprima** (lato lungo 2.048 px) per pagina;
3. per le pagine molto grandi (lato > 4.096 px dopo la rasterizzazione a 150 dpi) genera una **piramide di tile** (deep zoom) per navigare fluidamente;
4. calcola l'**hash SHA-256** del file originale (serve per il sign-off);
5. aggiorna lo stato della versione (SM-ELABORATO), con notifica all'autore quando è pronta o in errore.

**Tempi obiettivo:** PDF di 1 pagina A0 vettoriale ≤ 20 s; PDF di 50 pagine ≤ 2 min (`NFR-PERF-04`).

### FR-M2-03 — Versionamento progressivo · **M**

- Ogni nuovo upload su un elaborato esistente crea la versione `v(n+1)`. La numerazione è **per elaborato**, progressiva, senza buchi e senza riuso: una bozza eliminata lascia il suo numero "bruciato" e registrato nel log (`BR-18`).
- Per ogni versione si registrano: numero, autore, data, nota di revisione ("cosa è cambiato" — obbligatoria da v2 in poi), hash, numero di pagine.
- **Cronologia delle versioni:** elenco di tutte le versioni con stato, numero di pin e approvazione.
- **Confronto tra versioni (Should):** vista affiancata sincronizzata (stesso zoom e pan) e **sovrapposizione con dissolvenza** (slider di opacità) tra due versioni della stessa pagina.

### FR-M2-04 — Pubblicazione al committente · **M**

- Solo Owner e Architetto (non il Collaboratore).
- Si possono pubblicare più versioni in un unico invio ("Pubblica 5 tavole"), con **una sola** email riepilogativa al committente.
- Messaggio facoltativo per il committente allegato alla pubblicazione.
- Pubblicare `v(n+1)` porta `v(n)` nello stato **Superata**, a meno che `v(n)` non sia già Approvata.
- **Ritiro della pubblicazione:** possibile solo finché il committente non ha inserito pin su quella versione. Altrimenti si pubblica una nuova versione.

### FR-M2-05 — Scadenza di revisione (Should)

Lo studio può indicare una data entro cui chiede un riscontro. Il committente riceve un promemoria 2 giorni prima e il giorno stesso; la dashboard segnala i ritardi. La scadenza **non** blocca nulla e non vale come approvazione tacita (`BR-19`).

---

## B. Viewer e interfaccia di annotazione

### FR-M2-06 — Navigazione, zoom e pan · **M**

| Funzione | Desktop | Tablet / smartphone |
|----------|---------|---------------------|
| Zoom | Rotella + pulsanti +/−; da 10% a 800% (o fino alla risoluzione nativa × 4) | Pinch |
| Pan | Trascinamento col mouse; barra spaziatrice + trascinamento | Trascinamento con un dito |
| Adatta alla pagina / alla larghezza | Pulsanti + tasto `0` | Doppio tap |
| Cambio pagina (multipagina) | Barra delle miniature laterale + tasti ← → | Striscia delle miniature in basso + swipe (quando lo zoom è al minimo) |
| Rotazione della vista | 90° (solo visualizzazione, non modifica il file) | Idem |
| Schermo intero | Sì | Sì |
| Mini-mappa | Sì, oltre il 200% | No |
| Livelli di pin | Mostra/nascondi pin risolti, filtro per stato e autore | Idem |

Rendering progressivo: prima l'anteprima a bassa risoluzione, poi i tile ad alta risoluzione della zona visibile. Obiettivo: prima visualizzazione ≤ 2 s con connessione 4G (`NFR-PERF-02`).

### FR-M2-07 — Sistema di coordinate dei pin · **M**

- Il pin si salva come `(pageId, x%, y%)` con `x%` e `y%` ∈ [0, 100], in **decimali con 4 cifre** (es. `43.2178`). È una precisione sub-pixel anche su una tavola A0 a 300 dpi.
- L'origine è l'angolo **in alto a sinistra** della pagina **nel suo orientamento nativo**. La rotazione della vista (FR-M2-06) si applica sia alla pagina sia ai pin, quindi i pin restano al loro posto.
- Le coordinate si riferiscono al **riquadro della pagina** (MediaBox/CropBox del PDF oppure dimensioni in pixel dell'immagine), non al contenitore a schermo: così sono indipendenti da zoom, dimensione dello schermo e dispositivo (`BR-20`).
- Un pin fuori dall'intervallo [0, 100] viene rifiutato dal server.

### FR-M2-08 — Creazione di un pin · **M**

1. L'utente attiva la modalità "Commenta" (tasto `C` o pulsante), poi fa clic o tap su un punto della tavola.
2. Si apre il box del primo commento, **obbligatorio** (min 1, max 5.000 caratteri).
3. **Campi facoltativi del pin:**
   - *Categoria:* Domanda, Modifica richiesta, Errore/Refuso, Approvato localmente, Nota — per il committente l'elenco è ridotto a Domanda / Modifica / Nota;
   - *Allegati:* fino a 5 immagini (JPG/PNG/HEIC convertito, max 10 MB ciascuna) — Should;
   - *Area (Could):* invece di un punto, un rettangolo, salvato come due punti in percentuale.
4. Il pin riceve un **numero progressivo** per versione (#1, #2…) e un colore per stato.
5. **Precisione su touch:** sugli schermi touch, dopo il tap compare una lente di ingrandimento con mirino per affinare la posizione prima di confermare.

### FR-M2-09 — Visualizzazione dei pin e del pannello laterale · **M**

- Marker numerati sulla tavola, colorati per stato: Aperto (colore primario del tenant), In attesa (ambra), Risolto (grigio, nascosto per default), Congelato (grigio con lucchetto).
- Pannello laterale con l'elenco dei pin della pagina o dell'intera versione, ordinabile per numero, data e stato. Un clic sull'elenco porta la vista sul pin (pan + zoom) e viceversa.
- Pin molto vicini tra loro vengono raggruppati (cluster con numero) sotto una soglia di zoom.
- Indicatore di "non letto" per i pin con nuove risposte dall'ultima visita dell'utente.

### FR-M2-10 — Thread di discussione · **M**

- Commenti in ordine cronologico con autore, ruolo ("Studio" / "Committente"), data e ora.
- Testo semplice con interruzioni di riga e link automatici. **Niente HTML**: tutto il contenuto utente è codificato in output (`NFR-SEC-07`).
- Menzioni `@` dei membri dello studio (solo i commenti dello studio) — Should.
- Modifica di un commento: vedi la nota 3 della matrice CRUD (15 minuti, nessuna risposta successiva, cronologia salvata, etichetta "modificato").
- **Nessuna eliminazione fisica** dei commenti. L'autore può *ritirare* un commento entro 15 minuti; al suo posto resta "Commento ritirato dall'autore".

### FR-M2-11 — Risoluzione e riapertura dei pin · **M**

- **Risolvere:** Owner, Architetto, Collaboratore. Un commento di chiusura è facoltativo.
- **Riaprire:** il committente autore del pin e lo studio, finché la versione non è approvata o superata (`BR-11`).
- **Operazioni di massa (Should):** "Segna come risolti tutti i pin selezionati".

### FR-M2-12 — Notifiche della revisione · **M**

Vedi FR-MT-06. Eventi: nuova versione pubblicata, nuovo pin, nuova risposta, pin risolto o riaperto, approvazione ricevuta, richiesta di modifica. Il committente può scegliere tra invio immediato e **riepilogo giornaliero**.

### FR-M2-13 — Trasferimento dei pin aperti a una nuova versione · **S**

Dalla nuova versione, lo studio vede i pin aperti della precedente e può trasferirli (singolarmente o in blocco). Il pin trasferito:
- viene creato sulla nuova versione nella **stessa posizione in percentuale**, con la possibilità di spostarlo;
- porta con sé il thread in sola lettura, più un link al pin originale;
- il pin originale passa a "Congelato — trasferito a v(n+1) #k".

### FR-M2-14 — Esportazione dei commenti · **S**

Esportazione in PDF della tavola con i marker numerati sovrapposti, seguita dall'elenco dei pin con i thread completi. Utile come allegato per il cliente o per l'archivio.

---

## C. Formal Sign-off

### FR-M2-15 — Approvazione formale vincolante · **M**

**Precondizioni (`BR-10`):**
- chi approva è un contatto committente con flag *firmatario* e Magic Link attivo;
- la versione è nello stato **Pubblicata** ed è **l'ultima pubblicata** dell'elaborato;
- la commessa è Attiva.

**Flusso:**
1. Il committente preme **"Approva questa versione"**.
2. **Schermata di riepilogo** prima della conferma:
   - titolo e codice della tavola, numero di versione, data di pubblicazione;
   - miniatura di ogni pagina;
   - pin: totale, risolti, **aperti** (se ce ne sono, avviso evidente: "Ci sono N osservazioni ancora aperte. Approvando accetti la versione così com'è.");
   - **testo della dichiarazione** (configurabile dal tenant, con testo predefinito), es.: *"Io sottoscritto/a {nome}, in qualità di {ruolo}, dichiaro di aver preso visione dell'elaborato {codice} {titolo} versione {n} e di approvarlo. Sono consapevole che eventuali successive richieste di modifica potranno essere considerate variazioni rispetto all'incarico."*;
   - casella di spunta obbligatoria "Ho letto e accetto".
3. **Verifica OTP:** il sistema invia all'email del contatto un codice di 6 cifre valido 10 minuti. Massimo 5 tentativi; poi blocco di 15 minuti (`NFR-SEC-05`).
4. Con l'OTP corretto il sistema, **in una sola transazione atomica**:
   - crea il record `Approval` con: contatto, versione, timestamp del server (UTC, sincronizzato NTP), IP, user agent, hash SHA-256 del file approvato, testo della dichiarazione nella versione esatta mostrata, id della verifica OTP;
   - porta la versione nello stato **Approvata** e imposta `frozenAt` (`BR-01`);
   - porta tutti i pin della versione nello stato **Congelato**.
5. Genera il **PDF del riepilogo di approvazione** (FR-M5-10) e lo invia al committente e allo studio.
6. Mostra al committente la **schermata di chiusura**: "Approvazione registrata il {data e ora} — codice di verifica {id breve}", con il link al PDF.

**Più firmatari (`Q-05`):** con la regola "tutti i firmatari", la versione resta **Pubblicata — approvazione parziale (1/2)** finché tutti non hanno approvato. Il congelamento scatta all'ultima approvazione, ma nuovi pin sono bloccati già dalla prima (`BR-01` esteso).

**Revoca dell'approvazione:** **non prevista** per il committente. Se l'approvazione è stata data per errore, lo studio pubblica una nuova versione (anche identica) e la precedente resta approvata nello storico. L'eventuale "annullamento amministrativo" da parte dello studio richiede motivazione, resta tracciato e non cancella il record (`Q-08`).

### FR-M2-16 — Log di congelamento · **M**

Per ogni versione approvata, un registro consultabile dallo studio e scaricabile, con: cronologia completa (upload, pubblicazione, pin, commenti, risoluzioni, approvazione), dati di prova dell'approvazione e hash. Il log è **append-only**.

### FR-M2-17 — Richiesta di modifica su una versione approvata · **S**

Vedi P-04. Campi: descrizione (obbligatoria), riferimento facoltativo a un punto della tavola (salvato come coordinate percentuali ma **non** come pin), allegati. Lo studio la valuta: *In contratto* / *Extra contratto* (con nota ed eventuale importo indicativo, visibile o no al committente) / *Rifiutata*.

### FR-M2-18 — Download controllato · **M**

- Il committente scarica il file originale solo se lo studio lo consente (FR-M2-01).
- Il download passa sempre da un **URL firmato** a scadenza breve (≤ 5 minuti), generato dopo il controllo dei permessi (`NFR-SEC-04`).
- **Filigrana dinamica (Could):** nome del committente, data e "Copia per revisione" sulle versioni non approvate.

---

## Criteri di accettazione chiave del Modulo 2

- **AC-FR-M2-07-1** — *Dato* un pin creato a `(x=25.0000, y=50.0000)` su un iPad in orizzontale, *quando* lo stesso pin viene aperto su un monitor 4K a zoom 300% e su uno smartphone in verticale, *allora* il marker cade sullo stesso punto grafico della tavola, con una tolleranza visiva di ±2 px dello schermo.
- **AC-FR-M2-08-1** — *Dato* un elaborato nello stato **Approvata**, *quando* il committente o un membro dello studio prova a creare un pin (anche chiamando direttamente l'API), *allora* il server risponde con errore `409 VERSION_FROZEN` e nessun pin viene creato (`BR-01`).
- **AC-FR-M2-10-1** — *Dato* un commento che contiene `<img src=x onerror=alert(1)>`, *quando* viene salvato e poi visualizzato, *allora* compare come testo letterale e nessuno script viene eseguito.
- **AC-FR-M2-15-1** — *Dato* un firmatario sulla v3 (ultima pubblicata) con 0 pin aperti, *quando* completa il sign-off con l'OTP corretto, *allora* la v3 diventa Approvata, il record `Approval` contiene l'hash del file uguale a quello calcolato all'upload, lui riceve via email il PDF di riepilogo e lo studio riceve la notifica.
- **AC-FR-M2-15-2** — *Dato* un contatto committente **non** firmatario, *quando* apre una versione pubblicata, *allora* il pulsante "Approva" non c'è e una chiamata diretta all'endpoint di approvazione restituisce `403`.
- **AC-FR-M2-15-3** — *Data* la v2 nello stato Superata perché è stata pubblicata la v3, *quando* un firmatario prova ad approvare la v2 (es. da un link vecchio), *allora* il sistema rifiuta e lo porta alla v3.
- **AC-FR-M2-15-4** — *Dato* un OTP inserito sbagliato 5 volte, *quando* il committente prova la sesta volta, *allora* il sistema blocca i tentativi per 15 minuti e avvisa lo studio.
- **AC-FR-M2-03-1** — *Dato* un elaborato con v1 approvata, *quando* l'Architetto carica un nuovo file, *allora* nasce la v2 in bozza, la v1 resta Approvata e congelata e la nota di revisione è obbligatoria.
