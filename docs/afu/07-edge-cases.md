# 7. Casi limite e gestione delle eccezioni (Edge Cases)

Formato: **Scenario** → **Rischio** → **Comportamento atteso** → **Requisiti / regole collegati**.

---

## 7.1 Elaborati grafici fuori scala, multipagina o anomali

### EC-01 — PDF molto grandi o con molte pagine
- **Scenario:** PDF di 180 pagine (fascicolo completo) oppure tavola A0 scansionata a 600 dpi (≈ 19.800 × 28.000 px).
- **Rischio:** browser bloccato, memoria esaurita sui tablet, tempi di elaborazione lunghi.
- **Comportamento:**
  - elaborazione asincrona lato server, con avanzamento per pagina ("Pagina 45/180 pronta");
  - il viewer carica **solo la pagina corrente** e le miniature, con caricamento lazy dei tile;
  - oltre 200 pagine o 400 MP: rifiuto con un messaggio chiaro e il suggerimento di dividere il file o ridurre la risoluzione;
  - pagine di dimensioni diverse nello stesso PDF: ogni pagina ha le proprie dimensioni e il proprio sistema di coordinate.
- **Collegati:** FR-M2-01, FR-M2-02, FR-M2-06, NFR-PERF-04.

### EC-02 — PDF vettoriali complessi (tavole CAD con migliaia di entità)
- **Rischio:** rasterizzazione lenta, rendering nel browser pesante.
- **Comportamento:** nessun rendering vettoriale nel browser per le pagine sopra una soglia di complessità: si usano i tile raster generati dal server (qualità stampa a 150–300 dpi secondo il formato). Il download dell'originale resta disponibile.

### EC-03 — File anomali
| Caso | Comportamento |
|------|---------------|
| PDF protetto da password o cifrato | Rifiutato: "Il PDF è protetto. Caricalo senza password." |
| PDF corrotto o troncato | Versione in stato Errore, file non pubblicabile, dettaglio del problema visibile |
| Estensione diversa dal contenuto reale (es. `.pdf` che è un eseguibile) | Rifiutato ed evento di sicurezza registrato |
| Immagine con orientamento EXIF ruotato | Normalizzata all'orientamento corretto prima di calcolare le coordinate |
| PDF con pagine ruotate (attributo `/Rotate`) | Rotazione applicata in modo coerente a visualizzazione e coordinate dei pin |
| Malware rilevato | File in quarantena, mai servito, Owner avvisato |
| Nome file con caratteri speciali o molto lungo | Normalizzato per lo storage; il nome originale resta come metadato |

## 7.2 Audio rumoroso, incomprensibile o problematico

### EC-04 — La trascrizione fallisce
- **Scenario:** servizio ASR non disponibile, audio corrotto o formato non supportato.
- **Comportamento:** 3 tentativi automatici con backoff; poi stato "Trascrizione non riuscita", **l'audio grezzo resta** riproducibile e scaricabile; notifica al DL; pulsante "Riprova"; inserimento manuale del testo sempre disponibile. Il verbale resta **sempre** completabile.

### EC-05 — Trascrizione a bassa confidenza o strutturazione non valida
- **Scenario:** rumore di cantiere (martelli pneumatici, betoniera), vento sul microfono, dialetto marcato, più persone che parlano insieme.
- **Comportamento:**
  - confidenza media sotto la soglia (es. < 0,60) → banner "Trascrizione poco affidabile: verifica con attenzione", segmenti incerti evidenziati, riascolto del segmento con un tap;
  - output AI non conforme allo schema dopo 1 nuovo tentativo → si presenta la **trascrizione grezza** in un unico blocco "Note generali" da smistare a mano;
  - audio senza parlato rilevato (silenzio o solo rumore) → messaggio "Nessuna voce rilevata" e nessuna bozza vuota;
  - suggerimento all'utente: consigli brevi di registrazione (telefono vicino alla bocca, riparo dal vento).

### EC-06 — Interruzione della registrazione
- **Scenario:** telefonata, notifica a schermo intero, blocco dello schermo, batteria scarica, chiusura dell'app, revoca del permesso del microfono.
- **Comportamento:** salvataggio a blocchi ogni 5 s (FR-M4-08); alla riapertura: "Registrazione interrotta alle 10:42 — 3:15 salvati"; l'audio parziale resta utilizzabile.

## 7.3 Vani ciechi o con sola ventilazione meccanica

### EC-09 — Vani senza finestre
- **Comportamento:** vedi FR-M3-13. Riassunto:
  - bagno/WC cieco con aspirazione o VMC → Ventilazione OK, non incide sull'esito complessivo;
  - bagno cieco senza aspirazione → Ventilazione KO (art. 7);
  - disimpegno, ripostiglio, cabina armadio, locale tecnico cieco → "Non richiesto";
  - vano abitabile cieco → Non conforme, salvo deroga ammessa e motivata.
- Il riepilogo del fabbricato elenca a parte i vani ciechi, così **non** abbassano "per errore" l'esito complessivo.

### EC-10 — Vano con sole aperture in falda / lucernari
- **Comportamento:** calcolo con il coefficiente del profilo per le aperture in falda; se il profilo locale prevede una soglia specifica per i sottotetti (es. 1/10 o 1/12), si applica quando l'unità è marcata come sottotetto e il vano ha solo o prevalentemente aperture in falda (criterio di prevalenza definito nel profilo — `Q-11`).

### EC-11 — Aperture su spazi non idonei
- **Scenario:** finestra su cavedio, chiostrina, veranda chiusa o loggia molto profonda.
- **Comportamento:** l'utente segna "Su spazio esterno idoneo = No"; l'apertura resta elencata ma **non computata**, con una nota esplicativa in relazione. Il sistema non tenta di valutare da solo l'idoneità.

### EC-12 — Dati geometrici incoerenti
| Caso | Comportamento |
|------|---------------|
| Somma delle aperture > superficie delle pareti plausibile (es. `Si > 2 × Sp`) | Avviso non bloccante "Valori insolitamente alti: verifica le unità di misura" |
| Misure evidentemente in cm invece che in m (es. L = 120) | Rifiutate dalla validazione (L ≤ 20 m) con il suggerimento "Intendevi 1,20 m?" |
| `Sa > A` (apribile maggiore della superficie) | Errore di validazione |
| Soffitto inclinato con `Hmin > Hmax` | Errore di validazione |
| `Sp` = 0 o superficie non computabile ≥ `Sp` | Errore di validazione (divisione per zero impossibile per costruzione) |
| Quota di esclusione sopra la sommità dell'apertura | `Hi = 0`, nota "Apertura interamente sotto la quota di computo" |

## 7.4 Connettività debole in cantiere

### EC-07 — Segnale intermittente o assente
- **Comportamento:** vedi FR-M4-14. Riassunto: tutto ciò che serve per documentare funziona offline; coda persistente; upload riprendibili e idempotenti; indicatore di stato sempre visibile; nessuna perdita silenziosa.

### EC-08 — iOS e sincronizzazione in background
- **Rischio:** su iOS, se l'utente chiude la PWA prima della sincronizzazione, i dati restano sul dispositivo finché non la riapre.
- **Comportamento:** avviso esplicito ("Tieni l'app aperta finché la sincronizzazione non è completa"); notifica locale di promemoria alla riapertura; nella lista delle commesse, badge "Da sincronizzare" su quelle con dati in coda.

### EC-13 — Più bozze di sopralluogo
- **Comportamento:** alla creazione di un nuovo sopralluogo su una commessa con una bozza aperta dello stesso utente, il sistema propone "Riprendi la bozza del {data}" oppure "Crea nuovo" (con conferma).

### EC-14 — Modifiche concorrenti da due dispositivi
- **Comportamento:** vedi FR-M4-14 (vince l'ultima scrittura per campo, versione sovrascritta recuperabile, avviso).

## 7.5 Altri casi limite (integrazioni)

### EC-15 — Magic Link dopo il cambio di dominio o di slug
- **Comportamento:** i vecchi URL fanno redirect 301 al nuovo host per 90 giorni; il token resta valido perché è legato al contatto, non all'host.

### EC-16 — Email del committente errata o che rimbalza
- **Comportamento:** hard bounce → contatto marcato "Email non valida", avviso nella dashboard della commessa, possibilità di correggere l'email e reinviare (rigenerando il token).

### EC-17 — Quota di storage superata a metà sopralluogo
- **Comportamento:** gli upload dei sopralluoghi **già iniziati** vengono comunque accettati con una tolleranza del 5% oltre la quota, per non perdere i dati di campo; i nuovi elaborati sono bloccati; l'Owner viene avvisato.

### EC-18 — Membro rimosso durante un sopralluogo in bozza
- **Comportamento:** la sessione del dispositivo viene revocata; i dati in coda locale **non** si sincronizzano più (l'utente non è autorizzato); l'Owner vede "Il sopralluogo in bozza di {utente} non è stato sincronizzato". **Nessun dato viene esfiltrato**: al logout forzato la cache locale del tenant si cancella (`Q-18`: valutare l'esportazione locale dei dati prima della cancellazione).

### EC-19 — Firmatario rimosso dopo l'approvazione
- **Comportamento:** l'approvazione resta valida e visibile nello storico (dato storico, BR-09); il contatto perde l'accesso.

### EC-20 — Commessa chiusa con pin aperti o verbali in bozza
- **Comportamento:** alla chiusura un avviso elenca pin aperti, verbali in bozza e approvazioni mancanti; la chiusura è comunque possibile, con conferma.

### EC-21 — Fuso orario e ora legale
- **Comportamento:** tutti i timestamp si salvano in UTC e si mostrano in Europa/Roma, gestendo il cambio d'ora; nei documenti c'è l'ora locale con indicazione del fuso (es. "10:42 CEST").

### EC-22 — Doppio clic o doppio invio di azioni vincolanti
- **Comportamento:** approvazione, finalizzazione, pubblicazione e invio sono idempotenti (chiave di idempotenza per richiesta); il pulsante si disabilita durante l'elaborazione.

### EC-23 — Servizio AI non disponibile per molte ore
- **Comportamento:** i job restano in coda (fino a 72 ore) e ripartono quando il servizio torna; banner "Trascrizioni temporaneamente in ritardo" per gli utenti dello studio.

### EC-24 — Committente con dispositivo datato o browser non supportato
- **Comportamento:** pagina di compatibilità con l'elenco dei browser supportati; il **download del PDF** degli elaborati resta disponibile come alternativa, così il committente può almeno consultare il documento.
