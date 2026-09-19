# 4. Mappa dei macro-processi (workflow di business)

I diagrammi sono in [Mermaid](https://mermaid.js.org/), visualizzati direttamente da GitHub. Ogni passo riporta tra parentesi quadre gli ID dei requisiti che lo implementano.

## 4.0 Panoramica del ciclo di vita della commessa

```mermaid
flowchart LR
    A[P-00 Onboarding studio] --> B[Creazione commessa<br/>FR-M1-01]
    B --> C[Invito committente<br/>Magic Link FR-M1-05]
    B --> D[P-02 Verifica R.A.I.]
    C --> E[P-01 Revisione e<br/>approvazione elaborati]
    E --> F[P-04 Richieste di modifica<br/>post-approvazione]
    D --> G[Relazione R.A.I.<br/>per CILA/SCIA]
    E --> H[Inizio lavori]
    G --> H
    H --> I[P-03 Sopralluoghi<br/>e verbali]
    I --> J[P-06 Chiusura e<br/>archiviazione commessa]
```

---

## P-00 — Onboarding di un nuovo studio (tenant)

**Attori:** Platform Admin, Studio Owner
**Trigger:** contratto Beta firmato con lo studio

```mermaid
sequenceDiagram
    actor PA as Platform Admin
    participant S as Sistema
    actor OW as Studio Owner
    PA->>S: Crea tenant (ragione sociale, slug, piano, posti) [FR-M0-01]
    S->>S: Riserva sottodominio, crea profilo vuoto
    S-->>OW: Email di invito come Owner (link valido 7 giorni)
    OW->>S: Attiva account (password + MFA facoltativa) [FR-MT-01]
    S-->>OW: Wizard di configurazione [FR-M0-10]
    OW->>S: Dati studio, albo, recapiti [FR-M0-02]
    OW->>S: Logo, colori, anteprima [FR-M0-03..05]
    OW->>S: (Facoltativo) dominio personalizzato [FR-M0-07]
    OW->>S: Invita membri e assegna ruoli [FR-M0-08]
    S-->>OW: Tenant operativo
```

**Esito:** tenant attivo, brandizzato, con almeno un Owner.
**Eccezioni:** invito scaduto → l'Owner chiede un nuovo invito al Platform Admin; slug già in uso → il sistema propone alternative.

---

## P-01 — Flusso di approvazione degli elaborati (Studio → Cliente → Firma)

**Attori:** Architetto, Committente (firmatario e non), Sistema
**Trigger:** l'Architetto ha un elaborato pronto per la revisione del cliente
**Precondizioni:** commessa attiva; almeno un contatto committente con Magic Link attivo

```mermaid
flowchart TD
    A[Architetto carica file<br/>FR-M2-01] --> B{Elaborato nuovo<br/>o nuova versione?}
    B -- Nuovo --> C[Crea elaborato + v1 in bozza]
    B -- Esistente --> D[Crea v n+1 in bozza<br/>FR-M2-03]
    C --> E[Elaborazione file:<br/>anteprime, pagine, tile<br/>FR-M2-02]
    D --> E
    E --> F[Architetto pubblica<br/>FR-M2-04]
    F --> G[Notifica email al committente<br/>FR-MT-06]
    G --> H[Committente apre il Magic Link<br/>FR-M1-05]
    H --> I[Naviga, zoom, pan<br/>FR-M2-06]
    I --> J{Ha osservazioni?}
    J -- Sì --> K[Inserisce pin + commento<br/>FR-M2-08]
    K --> L[Notifica allo studio]
    L --> M[Studio risponde nel thread<br/>FR-M2-10]
    M --> N{Serve una modifica<br/>alla tavola?}
    N -- Sì --> D
    N -- No, chiarimento --> O[Studio marca il pin Risolto<br/>FR-M2-11]
    O --> J
    J -- No --> P{Il contatto è<br/>firmatario?}
    P -- No --> Q[Può solo commentare]
    P -- Sì --> R{Pin aperti sulla<br/>versione?}
    R -- Sì --> S[Avviso: pin aperti.<br/>Approvazione possibile solo<br/>con conferma esplicita BR-10]
    R -- No --> T[Richiede sign-off]
    S --> T
    T --> U[OTP via email<br/>FR-M2-15]
    U --> V[Conferma OTP + dichiarazione]
    V --> W[Versione congelata BR-01<br/>timestamp, hash, IP]
    W --> X[PDF riepilogo di approvazione<br/>FR-M5-10]
    X --> Y[Notifica a studio e committente]
```

**Regole coinvolte:** `BR-01` (immutabilità), `BR-10` (sign-off solo firmatario, solo sull'ultima versione pubblicata), `BR-11` (riapertura dei pin).

**Nota sui pin tra versioni:** quando si pubblica la versione n+1, i pin **aperti** della versione n **non** si copiano automaticamente, perché le coordinate potrebbero non corrispondere più. La versione n resta consultabile con i suoi pin e il pannello della nuova versione mostra "N pin aperti sulla versione precedente", con link. Lo studio può *trasferire* un pin aperto alla nuova versione (azione manuale, Should — `FR-M2-13`).

---

## P-02 — Flusso di verifica e asseverazione R.A.I.

**Attori:** Architetto (o Collaboratore per l'inserimento), Sistema
**Trigger:** progettazione di un intervento che richiede la verifica dei requisiti igienico-sanitari

```mermaid
flowchart TD
    A[Seleziona il profilo normativo<br/>della commessa FR-M3-01] --> B[Crea unità immobiliare /<br/>piano FR-M3-02]
    B --> C[Crea vano: nome, destinazione,<br/>Sp, altezza FR-M3-03]
    C --> D{Destinazione<br/>richiede R.A.I.?}
    D -- No: servizio/accessorio --> E[Verifica della ventilazione:<br/>finestra o aspirazione/VMC<br/>FR-M3-13]
    D -- Sì: abitabile --> F[Inserisce aperture:<br/>dimensioni, tipo, apribilità<br/>FR-M3-06]
    F --> G[Calcolo in tempo reale<br/>Si, Sa, rapporti, delta<br/>FR-M3-08]
    G --> H{Esito}
    H -- Conforme --> I[Badge verde]
    H -- Non conforme --> J{Si applica una<br/>deroga documentata?}
    J -- No --> K[Badge rosso + deficit mq]
    J -- Sì --> L[Badge ambra: conformità<br/>subordinata ad asseverazione<br/>motivazione obbligatoria BR-06]
    E --> M[Quadro riepilogativo<br/>del fabbricato FR-M3-15]
    I --> M
    K --> M
    L --> M
    M --> N{Tutti i vani conformi<br/>o motivati?}
    N -- No --> O[Genera solo la bozza<br/>con filigrana]
    N -- Sì --> P[Architetto abilitato firma<br/>la dichiarazione BR-08]
    P --> Q[PDF relazione tecnica<br/>definitiva FR-M5-20]
```

**Nota:** un vano non conforme **non blocca** la generazione della relazione in bozza. La relazione **definitiva** con asseverazione richiede invece che ogni vano sia *Conforme* o *Subordinato ad asseverazione* con motivazione (`BR-06`). Un vano *Non Conforme* impedisce l'asseverazione di conformità, ma lascia generare un **report di verifica** (non asseverativo) utile in fase di progetto.

---

## P-03 — Flusso del sopralluogo sul campo

**Attori:** Architetto con ruolo DL sulla commessa, Sistema/AI, Committente e Impresa (destinatari)
**Trigger:** visita programmata o straordinaria in cantiere

```mermaid
sequenceDiagram
    actor DL as Architetto (DL)
    participant PWA as PWA mobile
    participant Q as Coda offline (dispositivo)
    participant S as Server
    participant AI as Servizio AI
    DL->>PWA: Apre la commessa → "Nuovo sopralluogo" [FR-M4-03]
    PWA->>Q: Crea sopralluogo in bozza (id generato sul dispositivo)
    DL->>PWA: Presenti, meteo, note [FR-M4-04]
    loop Durante il sopralluogo
        DL->>PWA: Scatta o seleziona foto [FR-M4-05]
        PWA->>Q: Salva in locale + compressione
        DL->>PWA: Registra una nota vocale [FR-M4-08]
        PWA->>Q: Salva l'audio in locale
    end
    Q-->>S: Sincronizzazione quando c'è rete (idempotente) [FR-M4-14]
    S->>AI: Trascrizione (ASR) [FR-M4-09]
    AI-->>S: Testo + confidenza
    S->>AI: Strutturazione in 3 blocchi [FR-M4-10]
    AI-->>S: Bozza strutturata
    S-->>DL: Notifica "Bozza pronta"
    DL->>PWA: Revisiona e corregge il testo [FR-M4-12]
    DL->>PWA: Sceglie e ordina le foto, didascalie [FR-M4-06]
    DL->>PWA: Anteprima PDF [FR-M5-01]
    DL->>S: Finalizza (conferma esplicita) [FR-M4-13]
    S->>S: Genera il PDF definitivo, hash, congela [BR-09]
    S-->>DL: PDF pronto
    DL->>S: Invia a committente e impresa [FR-M5-05]
```

**Fallback AI:** se la trascrizione fallisce o ha confidenza bassa, l'audio grezzo resta disponibile e il DL può scrivere il testo a mano o rilanciare la trascrizione (`EC-04`, `EC-05`). Il sopralluogo si può **sempre** completare anche senza AI.

---

## P-04 — Richiesta di modifica dopo l'approvazione (gestione dello scope creep)

**Attori:** Committente, Architetto
**Trigger:** il committente vuole cambiare un elaborato già approvato

```mermaid
flowchart TD
    A[Committente apre un elaborato approvato] --> B[Pin disabilitati: banner<br/>'Versione approvata il ...' BR-01]
    B --> C[Pulsante 'Richiedi una modifica'<br/>FR-M2-17]
    C --> D[Descrizione + allegato facoltativo<br/>+ riferimento a una posizione]
    D --> E[Notifica allo studio]
    E --> F{Valutazione dello studio}
    F -- In contratto --> G[Accettata: pianifica<br/>una nuova versione]
    F -- Extra contratto --> H[Marcata extra-scope,<br/>eventuale nota economica]
    F -- Rifiutata --> I[Rifiutata con motivazione]
    G --> J[Nuova versione → P-01]
    H --> K{Il committente accetta?}
    K -- Sì --> J
    K -- No --> L[Chiusa]
```

**Valore:** traccia documentale di tutte le richieste arrivate dopo il congelamento, utile per quotare le varianti e in caso di contenzioso sul compenso.

---

## P-05 — Ciclo di vita dell'accesso del committente (Magic Link)

```mermaid
flowchart LR
    A[Contatto creato] --> B[Token generato<br/>FR-M1-05]
    B --> C[Invito inviato via email]
    C --> D[Primo accesso:<br/>accettazione dell'informativa privacy]
    D --> E[Sessione nel browser<br/>durata limitata]
    E --> F{Sessione scaduta?}
    F -- Sì --> G[Riaccesso con lo stesso Magic Link<br/>o link rinnovato via email]
    B --> H{Revoca}
    H -- Manuale dello studio --> I[Token invalidato,<br/>sessioni chiuse FR-M1-06]
    H -- Commessa chiusa/archiviata --> I
    I --> J[Eventuale nuovo token]
```

---

## P-06 — Chiusura e archiviazione della commessa

1. L'Architetto imposta la commessa su **Chiusa**: i Magic Link vengono revocati automaticamente dopo un periodo di grazia configurabile (predefinito 30 giorni) e il portale del committente diventa di sola lettura.
2. Dopo la chiusura si possono ancora consultare ed esportare i documenti.
3. **Archiviazione:** la commessa sparisce dalle liste attive ed è consultabile dal filtro "Archiviate".
4. **Eliminazione definitiva:** solo l'Owner, con doppia conferma. Non è possibile finché è attivo un vincolo di conservazione (`BR-13`).

---

## 4.7 Macchine a stati

### SM-PROGETTO (Commessa)

```mermaid
stateDiagram-v2
    [*] --> Attiva: creazione
    Attiva --> Sospesa: sospendi
    Sospesa --> Attiva: riattiva
    Attiva --> Chiusa: chiudi
    Sospesa --> Chiusa: chiudi
    Chiusa --> Attiva: riapri (Owner/Architetto)
    Chiusa --> Archiviata: archivia
    Archiviata --> Chiusa: ripristina
    Archiviata --> [*]: elimina (solo Owner, BR-13)
```

| Stato | Committente | Nuovi contenuti | Note |
|-------|-------------|-----------------|------|
| Attiva | Accesso completo | Sì | Stato normale |
| Sospesa | Sola lettura | No (tranne note interne) | Es. pratica ferma, contenzioso |
| Chiusa | Sola lettura per il periodo di grazia, poi nessun accesso | No | Lavori finiti o incarico concluso |
| Archiviata | Nessun accesso | No | Esclusa dalle liste e dai conteggi |

### SM-ELABORATO (Versione dell'elaborato)

```mermaid
stateDiagram-v2
    [*] --> InElaborazione: upload
    InElaborazione --> Bozza: elaborazione completata
    InElaborazione --> Errore: file non valido/corrotto
    Errore --> [*]: scartata
    Bozza --> Pubblicata: pubblica
    Bozza --> [*]: elimina (solo le bozze)
    Pubblicata --> Bozza: ritira (solo se nessun pin del committente)
    Pubblicata --> Superata: pubblicata la versione successiva
    Pubblicata --> Approvata: sign-off del firmatario
    Superata --> [*]
    Approvata --> [*]
```

- **Superata:** consultabile, con i suoi pin in sola lettura; non si può approvare.
- **Approvata:** congelata (`BR-01`); non torna mai indietro. Per modificarla si pubblica una nuova versione, che richiede un nuovo sign-off.

### SM-PIN

```mermaid
stateDiagram-v2
    [*] --> Aperto: creato
    Aperto --> InAttesa: lo studio risponde
    InAttesa --> Aperto: il committente risponde
    Aperto --> Risolto: marcato risolto
    InAttesa --> Risolto: marcato risolto
    Risolto --> Aperto: riaperto (BR-11)
    Aperto --> Ritirato: ritirato dall'autore (senza risposte)
    Risolto --> Congelato: versione approvata o superata
    Aperto --> Congelato: versione approvata o superata
    InAttesa --> Congelato: versione approvata o superata
```

### SM-RICHIESTA-MODIFICA

`Inviata → In valutazione → (Accettata in contratto | Accettata extra-scope | Rifiutata) → Chiusa`

### SM-SOPRALLUOGO

```mermaid
stateDiagram-v2
    [*] --> Bozza: creato (anche offline)
    Bozza --> InSincronizzazione: rete disponibile
    InSincronizzazione --> Bozza: parte dei contenuti ancora in coda
    InSincronizzazione --> ElaborazioneAI: audio caricato
    ElaborazioneAI --> DaRevisionare: bozza AI pronta
    ElaborazioneAI --> DaRevisionare: AI fallita (fallback manuale, EC-04)
    Bozza --> DaRevisionare: testo inserito a mano
    DaRevisionare --> Finalizzato: il DL conferma
    Finalizzato --> Inviato: invio ai destinatari
    Finalizzato --> Annullato: annullamento motivato (BR-09)
    Inviato --> Annullato: annullamento motivato (BR-09)
```

Un verbale **Annullato** resta in archivio con filigrana "ANNULLATO". Il verbale sostitutivo porta il riferimento a quello annullato.

### SM-TOKEN (Magic Link)

`Attivo → (Revocato | Scaduto)`. Non si torna indietro: la rigenerazione crea un **nuovo** token.

### SM-DOMINIO (Dominio personalizzato)

`Richiesto → In verifica DNS → Certificato in emissione → Attivo | Errore`; da `Attivo` si può passare a `Rimosso`.

### SM-JOB-AI (Trascrizione e strutturazione)

`In coda → In esecuzione → (Completato | Fallito → In coda [retry fino a 3 volte, con backoff esponenziale] | Fallito definitivamente)`
