# 5.1 Modulo 1 — Fascicolo di commessa (Project Management)

**Obiettivo:** la commessa è il contenitore unico di tutto ciò che riguarda un incarico. Da qui si arriva a elaborati, calcoli R.A.I., sopralluoghi, documenti, persone e accessi del committente.

---

## FR-M1-01 — Creazione e anagrafica della commessa · **M**

| Campo | Obbligatorio | Validazione / Note |
|-------|--------------|--------------------|
| Codice commessa | Sì | Proposto dal pattern del tenant (FR-M0-11), modificabile; unico nel tenant (senza distinzione tra maiuscole e minuscole); max 30 caratteri |
| Titolo | Sì | max 150 (es. "Ristrutturazione appartamento Via Verdi 12") |
| Descrizione | No | max 2000 |
| Tipologia di intervento | Sì | enum: nuova costruzione, ristrutturazione edilizia, manutenzione straordinaria, restauro e risanamento conservativo, cambio di destinazione d'uso, frazionamento/accorpamento, recupero sottotetto, interior design, altro |
| Titolo edilizio previsto | No | enum: CILA, SCIA, SCIA alternativa al PdC, PdC, Edilizia libera, Da definire |
| Indirizzo del cantiere | Sì | Via, civico, CAP, comune, provincia. Autocompletamento facoltativo |
| Coordinate geografiche | No | Lat/long ricavate dall'indirizzo o inserite a mano; servono per la mappa e per il meteo (FR-M4-04) |
| Dati catastali | No | Foglio, particella, subalterno, categoria (ripetibile) |
| Comune di riferimento normativo | Sì | Usato per proporre il profilo R.A.I. (FR-M3-01) |
| Altitudine s.l.m. | No | Serve per i profili normativi montani |
| Profilo normativo predefinito | Sì | Proposto dal tenant o dal comune, modificabile |
| Data di inizio incarico | No | — |
| Data di fine prevista | No | ≥ data di inizio |
| Stato | Sì | SM-PROGETTO, predefinito `Attiva` |
| Tag | No | Etichette libere del tenant |
| Immagine di copertina | No | Mostrata in dashboard e nel portale |

### Committenti (ripetibile, almeno 1)

| Campo | Obbligatorio | Note |
|-------|--------------|------|
| Tipo | Sì | Persona fisica / persona giuridica / condominio / ente |
| Nome e cognome, oppure ragione sociale | Sì | — |
| Codice fiscale / P.IVA | No | Validato se presente. Serve nelle relazioni per CILA/SCIA |
| Email | Sì | Destinazione del Magic Link e delle notifiche |
| Telefono | No | — |
| Indirizzo | No | — |
| Ruolo nella commessa | No | Proprietario, comproprietario, amministratore di condominio, delegato, altro |
| Firmatario | Sì (bool) | Predefinito: vero per il primo committente, falso per i successivi |
| Accesso al portale | Sì (bool) | Predefinito: vero |

### Team dello studio

- Assegnazione di uno o più membri, ciascuno con un ruolo di commessa: *Responsabile*, *Progettista*, *Direttore dei Lavori*, *Collaboratore*.
- Può esserci **al massimo un DL attivo** per commessa (`BR-17`). Nella Beta un solo DL; il DL "operativo" o "per le strutture" è fuori perimetro.
- Chi crea la commessa ne diventa Responsabile in automatico.

### Impresa esecutrice (0..n)

Ragione sociale, P.IVA, referente, email, PEC, telefono, categoria di lavori. Un'impresa si può riusare su più commesse dello stesso tenant (rubrica imprese — Should).

---

## FR-M1-02 — Elenco e ricerca delle commesse · **M**

- Viste: **lista** (tabella ordinabile) e **schede** (card con copertina).
- Filtri: stato, tipologia, responsabile, tag, comune, intervallo di date.
- Ricerca testuale su codice, titolo, indirizzo e nome del committente.
- Colonne predefinite: codice, titolo, committente, stato, elaborati in attesa di approvazione, pin aperti, esito R.A.I., ultimo sopralluogo, ultima attività.
- Paginazione lato server, 25 elementi per pagina (max 100).
- Un Collaboratore vede solo le commesse assegnate. Per l'Architetto vedi `Q-04`.

---

## FR-M1-03 — Modifica, sospensione, chiusura, archiviazione · **M**

- Transizioni come da SM-PROGETTO. Ogni transizione chiede una conferma e registra un evento di audit.
- La **chiusura** chiede se revocare subito i Magic Link o dopo il periodo di grazia.
- Si può **duplicare** una commessa (Should): copia di anagrafica, team e profilo normativo; **non** si copiano elaborati, pin, sopralluoghi né committenti.

---

## FR-M1-04 — Dashboard dello stato di avanzamento (vista della commessa) · **M**

Pagina principale della commessa, con i widget:

| Widget | Contenuto | Azione |
|--------|-----------|--------|
| **Approvazioni** | Elaborati per stato (bozza / pubblicato / approvato / superato); elaborati in attesa di approvazione da oltre N giorni | Apre l'elenco filtrato |
| **Pin** | Pin aperti, in attesa di risposta dello studio, risolti; età media dei pin aperti | Apre la vista dei pin |
| **Conformità R.A.I.** | Numero di vani conformi / non conformi / subordinati ad asseverazione / senza dati; totale del deficit in mq | Apre il modulo R.A.I. |
| **Cantiere** | Numero di sopralluoghi, data dell'ultimo, verbali in bozza, difformità aperte (dal blocco 2) | Apre il diario |
| **Richieste di modifica** | Aperte, accettate extra-scope | Apre l'elenco |
| **Attività recente** | Ultimi 20 eventi (upload, commenti, approvazioni, verbali) | Apre l'elemento |
| **Committenti** | Nomi, ultimo accesso al portale, stato del link | Gestione degli accessi |

**Dashboard dello studio (Should):** vista aggregata su tutte le commesse con gli stessi indicatori e un elenco "cose da fare" (pin in attesa di risposta, verbali da finalizzare, approvazioni scadute).

---

## FR-M1-05 — Generazione del Magic Link · **M**

1. Quando si crea un contatto committente con accesso al portale, il sistema genera un **token personale** legato a (tenant, commessa, contatto).
2. **Caratteristiche del token:**
   - almeno 256 bit di entropia, generati con un generatore crittograficamente sicuro;
   - salvato **solo come hash** (SHA-256) nel database; il valore in chiaro esiste solo nel link inviato;
   - URL nella forma `https://{host-tenant}/portal/access/{token}`: il token sta nel **path**, non in un parametro di query, e la pagina imposta `Referrer-Policy: no-referrer`.
3. **Primo accesso:** il committente vede la pagina di benvenuto con il marchio dello studio, l'informativa privacy da prendere visione (e registrare) e i termini d'uso del portale.
4. **Scambio con una sessione:** al primo uso il token viene scambiato con una sessione del browser (cookie `HttpOnly`, `Secure`, `SameSite=Lax`) valida 30 giorni con rinnovo a ogni utilizzo. Il token **resta valido** per accessi successivi, anche da altri dispositivi, come previsto da `BR-03` (validità per la durata della commessa).
5. **Mitigazione della validità lunga:**
   - ogni accesso da un **nuovo dispositivo** (nuovo browser senza cookie di sessione) richiede un OTP inviato all'email del contatto — **Should**, configurabile dal tenant (`Q-03`);
   - le azioni vincolanti (sign-off) richiedono **sempre** l'OTP (FR-M2-15);
   - il pannello "Accessi" mostra allo studio data, ora, dispositivo e IP (troncato) degli ultimi 20 accessi di ogni contatto.
6. **Invio:** email di invito con il marchio dello studio. Lo studio può anche **copiare il link** per inviarlo con altri canali (es. WhatsApp), ma vede un avviso sui rischi di inoltro.
7. **Richiesta di un nuovo link self-service:** dalla pagina `/portal` il committente inserisce la propria email. Se corrisponde a un contatto attivo, il sistema invia un nuovo link di accesso (a durata breve, 24 ore) **senza rivelare** se l'email esiste (risposta sempre identica) — Should.

---

## FR-M1-06 — Revoca e rigenerazione del Magic Link · **M**

- **Revoca:** il token non vale più e **tutte** le sessioni collegate si chiudono entro 60 secondi.
- **Rigenerazione:** revoca del token esistente + nuovo token + invio facoltativo di una nuova email.
- **Revoca automatica:** quando la commessa è chiusa (dopo il periodo di grazia) o archiviata, quando il contatto è rimosso o perde l'accesso al portale, quando il tenant è sospeso.
- Ogni revoca registra motivo, autore e data.
- Un token revocato mostra una pagina neutra ("Il link non è più valido. Contatta lo studio.") con il marchio dello studio e **senza** dettagli sulla commessa.

---

## FR-M1-07 — Documenti condivisi con il committente · **S**

Sezione "Documenti" del portale in cui lo studio pubblica esplicitamente i PDF generati (verbali, relazioni, riepiloghi di approvazione) o altri file (contratti, preventivi — solo upload). Ogni condivisione è esplicita e revocabile; il committente vede solo ciò che è condiviso.

---

## FR-M1-08 — Note interne della commessa · **C**

Note riservate al team dello studio, mai visibili al committente, con menzioni `@membro` e notifica.

---

## Criteri di accettazione chiave del Modulo 1

- **AC-FR-M1-01-1** — *Dato* un tenant in cui esiste la commessa `2026-014`, *quando* un Architetto crea una commessa con codice `2026-014`, *allora* il sistema rifiuta con "Codice già in uso" e propone il primo codice libero secondo il pattern.
- **AC-FR-M1-05-1** — *Dato* un contatto committente appena creato con accesso al portale, *quando* l'Architetto salva, *allora* il database contiene solo l'hash del token, il committente riceve un'email con il link e aprendolo accede al portale della sola commessa associata.
- **AC-FR-M1-05-2** — *Dato* un Magic Link valido per la commessa A, *quando* il committente modifica a mano l'URL per aprire la commessa B dello stesso studio, *allora* il sistema risponde 404 (non 403, per non rivelare che la risorsa esiste) e registra il tentativo nell'audit log.
- **AC-FR-M1-06-1** — *Dato* un committente con una sessione aperta nel portale, *quando* lo studio revoca il suo Magic Link, *allora* entro 60 secondi qualsiasi azione del committente viene rifiutata e lui vede la pagina "Il link non è più valido".
- **AC-FR-M1-04-1** — *Data* una commessa con 3 vani conformi, 1 non conforme (deficit 0,40 mq) e 1 senza aperture inserite, *quando* l'Architetto apre la dashboard, *allora* il widget R.A.I. mostra "3 conformi · 1 non conforme · 1 incompleto" e "Deficit totale 0,40 mq".
