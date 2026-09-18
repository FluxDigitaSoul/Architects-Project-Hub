# 5.0 Modulo 0 — Multi-tenancy e motore white-label

**Obiettivo:** ogni studio è un tenant isolato, con un'identità visiva propria che si applica in modo uniforme a interfaccia, portale del cliente, email e PDF.

**Attori:** Platform Admin, Studio Owner (Architetto e Collaboratore in sola lettura)

---

## FR-M0-01 — Creazione e ciclo di vita del tenant · **M**

Il Platform Admin crea un tenant indicando:

| Campo | Tipo | Obbligatorio | Validazione |
|-------|------|--------------|-------------|
| Ragione sociale / denominazione | testo (max 150) | Sì | — |
| Slug | testo | Sì | `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`; unico; non in lista riservata (`www`, `app`, `api`, `admin`, `mail`, `static`, `cdn`, `status`, `help`, `docs`…) |
| Email dell'Owner iniziale | email | Sì | Formato valido |
| Piano | enum (`beta`, `trial`, `standard`…) | Sì | — |
| Numero di posti | intero ≥ 1 | Sì | — |
| Quota di storage | GB | Sì | Predefinito da piano |
| Note interne | testo | No | Visibili solo al Platform Admin |

**Stati del tenant:** `Attivo` → `Sospeso` (es. mancato pagamento: accesso in sola lettura per gli utenti dello studio e portale del committente disattivato con messaggio neutro) → `In chiusura` (periodo di export di 30 giorni) → `Eliminato` (cancellazione dei dati secondo `BR-13` e cap. 12).

---

## FR-M0-02 — Configurazione del profilo dello studio · **M**

| Campo | Obbligatorio | Validazione / Note | Dove appare |
|-------|--------------|--------------------|-------------|
| Denominazione dello studio | Sì | max 150 | Interfaccia, email, PDF |
| Forma giuridica | No | enum: studio individuale, studio associato, STP, società di ingegneria, altro | PDF |
| P.IVA | Sì | 11 cifre + controllo del check digit | PDF (piè di pagina) |
| Codice fiscale | No | 11 o 16 caratteri, con validazione | PDF |
| Sede legale (via, CAP, comune, provincia) | Sì | CAP 5 cifre; provincia sigla a 2 lettere | PDF |
| Sede operativa | No | Come sopra | PDF |
| Telefono | No | E.164 o formato italiano | PDF, portale |
| Email | Sì | — | Portale, rispondi-a delle email |
| PEC | No | Formato email | PDF |
| Sito web | No | URL `https` | Portale, PDF |
| Titolare / legale rappresentante | Sì | — | PDF |
| **Iscrizione all'albo — per professionista** | Sì per chi firma | Ordine (es. "Ordine degli Architetti P.P.C. della Provincia di Milano"), numero, sezione (A/B), settore | Relazioni e verbali (firma) |
| Polizza RC professionale (compagnia, numero) | No | — | Relazioni (facoltativo, `Q-10`) |
| Testo di piè di pagina dei documenti | No | max 300 caratteri | PDF |

**Nota:** l'iscrizione all'albo appartiene al **singolo professionista** (profilo utente), non allo studio. Lo studio può avere più firmatari.

---

## FR-M0-03 — Asset grafici: logo · **M**

- **Formati accettati:** SVG, PNG con trasparenza, JPG (sconsigliato, con avviso), WebP.
- **Dimensioni:** max 2 MB; per i raster, lato minimo di 512 px.
- **Varianti:**
  - *Logo principale* (su sfondo chiaro) — obbligatorio;
  - *Logo per sfondo scuro* — facoltativo; se manca, si usa il principale;
  - *Icona / favicon* (quadrata) — facoltativa; se manca, si ricava dal logo principale con ritaglio centrato;
  - *Logo per stampa* (PDF) — facoltativo; se manca, si usa il principale.
- **Sicurezza SVG:** ogni SVG caricato **deve** essere ripulito lato server (niente `<script>`, gestori `on*`, `<foreignObject>`, riferimenti esterni `xlink:href`/`href` verso URL remoti, entità XML). Se la pulizia modifica il file, l'utente vede un avviso (`NFR-SEC-09`).
- **Elaborazione:** il sistema genera le rasterizzazioni necessarie (favicon 32/180/192/512 px per la PWA, versione per il PDF a 300 dpi).
- **Anteprima:** prima di salvare, l'utente vede il logo nell'intestazione dell'app, nella pagina di accesso del portale, in un'email di esempio e nell'intestazione di un PDF di esempio.

---

## FR-M0-04 — Palette cromatica dinamica · **M**

| Campo | Obbligatorio | Formato | Default |
|-------|--------------|---------|---------|
| Colore primario | Sì | HEX `#RRGGBB` | Colore neutro della piattaforma |
| Colore secondario (accento) | No | HEX | Derivato dal primario |
| Tema del portale del committente | No | `chiaro` / `scuro` / `automatico` | `chiaro` |

**Regole di applicazione:**
1. Il sistema ricava dai colori scelti una scala di tonalità (50–900) e i colori di testo "on-primary" / "on-secondary".
2. **Contrasto WCAG 2.2 AA:** il testo su colore primario deve avere un rapporto di contrasto ≥ 4.5:1 (≥ 3:1 per testo grande e componenti dell'interfaccia). Se il colore scelto non lo permette, il sistema sceglie in automatico il testo bianco o nero con contrasto migliore e, se neanche così si raggiunge la soglia, mostra un avviso bloccante con un colore alternativo suggerito.
3. I **colori semantici** (verde conforme, rosso non conforme, ambra subordinato ad asseverazione, blu informativo) **non** sono personalizzabili: servono a leggere in modo univoco esiti normativi e stati.
4. L'applicazione è istantanea: dopo il salvataggio, tutte le sessioni aperte si aggiornano al successivo caricamento di pagina, senza deploy.
5. Nei PDF il colore primario si usa solo per elementi decorativi (filetti, intestazioni di tabella), mai per testo che deve restare leggibile in stampa in bianco e nero.

---

## FR-M0-05 — Anteprima e ripristino del branding · **S**

- Anteprima dal vivo su 4 superfici: app dello studio, portale del committente (desktop e mobile), email, PDF.
- Pulsante "Ripristina valori predefiniti".
- Cronologia delle ultime 10 configurazioni con possibilità di ripristino.

---

## FR-M0-06 — Sottodominio predefinito · **M**

- Ogni tenant è raggiungibile da `https://{slug}.{dominio-piattaforma}` fin dalla creazione, con certificato TLS wildcard.
- Il **portale del committente** e l'**app dello studio** stanno sullo stesso host; il routing distingue le aree (es. `/portal/...` per il committente, `/app/...` per lo studio).
- Il cambio di slug è possibile solo tramite Platform Admin. Il vecchio sottodominio fa redirect 301 per 90 giorni, così i Magic Link già inviati continuano a funzionare (`EC-15`).

---

## FR-M0-07 — Dominio personalizzato (CNAME) · **S**

**Procedura:**
1. L'Owner inserisce il dominio (es. `progetti.studiorossi.it`). Sono ammessi **solo sottodomini**, non domini apex (`studiorossi.it`), perché i domini apex non supportano CNAME in tutti i DNS.
2. Il sistema mostra i record DNS da creare: CNAME verso l'host di destinazione della piattaforma, più l'eventuale record di validazione del certificato.
3. Il sistema verifica il DNS in automatico ogni 5 minuti per 72 ore (e con il pulsante "Verifica ora").
4. Superata la verifica, il sistema emette il certificato TLS gestito e attiva il dominio (SM-DOMINIO).
5. Con il dominio attivo, **tutti** i nuovi link (Magic Link, email) usano il dominio personalizzato. Il sottodominio predefinito resta attivo come fallback.
6. Rinnovo del certificato automatico. Se il DNS viene rimosso dallo studio, dopo 3 verifiche fallite consecutive il sistema avvisa l'Owner e torna al sottodominio predefinito.

**Vincoli:** un solo dominio personalizzato per tenant nella Beta.

---

## FR-M0-08 — Gestione dei membri dello studio · **M**

- **Invito:** email + ruolo (Owner, Architetto, Collaboratore). Il link d'invito vale 7 giorni, è monouso e si può rinviare o revocare.
- **Controllo dei posti:** non si può invitare oltre il numero di posti della licenza. Gli inviti pendenti occupano un posto.
- **Profilo del membro:** nome, cognome, titolo (Arch., Ing., Geom., Pian., Dott.), iscrizione all'albo (vedi FR-M0-02), telefono, **immagine della firma** facoltativa (PNG trasparente, usata nei PDF — `Q-06`).
- **Cambio di ruolo:** solo l'Owner. Non si può declassare l'ultimo Owner (`BR-12`).
- **Sospensione / rimozione:** vedi cap. 2, "Regole trasversali".
- **Trasferimento di proprietà:** un Owner può nominarne un altro e poi declassarsi.
- **Un utente in più studi:** la stessa email può appartenere a più tenant. Dopo il login l'utente sceglie lo studio; i dati restano rigorosamente separati (`BR-04`).

---

## FR-M0-09 — Identità email white-label · **S**

- **Nella Beta (default):** le email partono da un indirizzo della piattaforma con **nome visualizzato** dello studio (es. `Studio Rossi <notifiche@{dominio-piattaforma}>`) e **Reply-To** uguale all'email dello studio.
- **Should:** mittente con il dominio dello studio (es. `notifiche@studiorossi.it`), dopo la verifica del dominio con record SPF, DKIM (CNAME) e DMARC mostrati dal sistema e verificati come in FR-M0-07.
- I modelli email usano logo e colori del tenant e non riportano il marchio della piattaforma, salvo un piè di pagina minimo richiesto per legge o dal contratto (`Q-07`).

---

## FR-M0-10 — Wizard di primo avvio · **S**

Percorso guidato al primo accesso dell'Owner: (1) dati dello studio → (2) logo e colori → (3) il mio profilo professionale → (4) invita il team → (5) crea la prima commessa. Si può saltare e riprendere; un indicatore di completamento resta in dashboard finché il profilo è incompleto.

---

## FR-M0-11 — Impostazioni dei documenti (carta intestata) · **M**

- Posizione del logo nell'intestazione (sinistra, centro, destra).
- Dati da mostrare nell'intestazione e nel piè di pagina (scelta tra i campi di FR-M0-02).
- Formato della pagina: A4 verticale (fisso nella Beta).
- **Pattern del codice commessa** (es. `{YYYY}-{NNN}`), con contatore annuale.
- **Numerazione dei verbali:** per commessa (`VS-{codiceCommessa}-{NN}`), progressiva e senza buchi (`BR-16`).

---

## FR-M0-12 — Profili normativi dello studio · **S**

Vedi il dettaglio in [M3 — FR-M3-01](05-m3-rai.md#fr-m3-01--profili-normativi--m). L'Owner può creare profili personalizzati (es. "Regolamento edilizio Comune di Bergamo 2024") partendo da un profilo di sistema e marcarne uno come predefinito per le nuove commesse.

---

## FR-M0-13 — Quote e utilizzo · **S**

Dashboard dell'Owner con: posti usati/disponibili, storage usato/quota, numero di commesse attive, minuti di audio trascritti nel mese. Avvisi via email all'80% e al 100% della quota. Al 100% dello storage si bloccano i **nuovi upload**, ma non la consultazione né la finalizzazione dei verbali già in corso (`EC-17`).

---

## Criteri di accettazione chiave del Modulo 0

- **AC-FR-M0-01-1** — *Dato* uno slug già usato da un altro tenant, *quando* il Platform Admin prova a creare il tenant, *allora* il sistema rifiuta con "Slug non disponibile" e propone 3 alternative libere.
- **AC-FR-M0-03-1** — *Dato* un SVG che contiene `<script>alert(1)</script>` e un attributo `onload`, *quando* l'Owner lo carica come logo, *allora* il file salvato non contiene né lo script né l'attributo e l'Owner vede l'avviso "Il file è stato ripulito da contenuti non sicuri".
- **AC-FR-M0-04-1** — *Dato* un colore primario `#FFEB3B` (giallo chiaro), *quando* l'Owner lo salva, *allora* il testo sui pulsanti primari viene impostato in automatico a nero (contrasto ≥ 4.5:1) e l'anteprima lo mostra.
- **AC-FR-M0-04-2** — *Dato* un nuovo colore primario salvato, *quando* il committente ricarica il portale, *allora* vede il nuovo colore senza alcun intervento tecnico e senza svuotare la cache.
- **AC-FR-M0-07-1** — *Dato* un CNAME configurato correttamente, *quando* la verifica automatica lo rileva, *allora* entro 30 minuti il dominio risulta `Attivo` con certificato valido e i nuovi Magic Link usano il dominio personalizzato.
- **AC-FR-M0-08-1** — *Dato* un tenant con 3 posti, 2 membri attivi e 1 invito pendente, *quando* l'Owner prova a invitare un quarto membro, *allora* il sistema blocca l'invito e indica come liberare un posto o aumentarne il numero.
- **AC-FR-M0-08-2** — *Dato* un tenant con un solo Owner, *quando* quell'Owner prova a declassarsi ad Architetto, *allora* il sistema blocca l'operazione citando `BR-12`.
