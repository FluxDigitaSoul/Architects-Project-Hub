# 5.T Funzioni trasversali

Funzioni che non appartengono a un singolo modulo ma sono necessarie a tutti.

---

## A. Identità e accesso

### FR-MT-01 — Autenticazione degli utenti dello studio · **M**

- **Login con email e password.** Policy: minimo 12 caratteri; controllo contro gli elenchi di password compromesse; nessun obbligo di caratteri speciali (linee guida NIST SP 800-63B); nessuna scadenza periodica forzata.
- **MFA:** TOTP (app di autenticazione) facoltativa per Architetto e Collaboratore, **fortemente consigliata** per l'Owner (obbligatoria se il tenant lo imposta), **obbligatoria** per il Platform Admin. Codici di recupero monouso (10) generati all'attivazione.
- **Login senza password via email (Should):** link monouso valido 15 minuti, alternativo alla password.
- **Recupero password:** link monouso valido 60 minuti; risposta identica che l'email esista o no; tutte le sessioni vengono revocate dopo il cambio.
- **Protezione brute force:** dopo 5 tentativi falliti in 15 minuti, ritardo progressivo + CAPTCHA non invasivo; dopo 10, blocco dell'account per 30 minuti ed email all'utente.
- **SSO Google/Microsoft:** Could (molti studi usano Google Workspace o Microsoft 365).

### FR-MT-02 — Gestione delle sessioni · **M**

- Sessione dell'app dello studio: scadenza per inattività dopo 8 ore; durata massima 30 giorni con "Ricordami" sul dispositivo, altrimenti 24 ore.
- **PWA di cantiere:** sessione lunga (30 giorni) per non chiedere il login in cantiere; le azioni sensibili (cambio email, MFA, gestione membri) richiedono una nuova autenticazione.
- Pagina "Dispositivi e sessioni" con revoca singola o di tutte le altre sessioni.

### FR-MT-03 — Selezione del tenant · **M**

Un utente membro di più studi, dopo il login sceglie lo studio (o viene portato direttamente se ne ha uno solo). Lo studio corrente resta sempre visibile nell'intestazione. Cambiare studio **ricarica** completamente il contesto dell'applicazione (niente dati residui in cache del tenant precedente) (`BR-04`).

### FR-MT-04 — Profilo e preferenze personali · **M**

Nome, titolo, foto, telefono, iscrizione all'albo, immagine della firma, preferenze di notifica, tema (chiaro/scuro/sistema), preferenza di registrazione audio (tieni premuto / tap), fuso orario (predefinito Europa/Roma).

---

## B. Notifiche

### FR-MT-05 — Centro notifiche in-app · **S**

Icona con contatore; elenco delle notifiche con link all'oggetto; "segna tutte come lette"; conservazione per 90 giorni.

### FR-MT-06 — Notifiche email · **M**

| Evento | Destinatari predefiniti | Modalità predefinita |
|--------|-------------------------|----------------------|
| Invito nello studio | Nuovo membro | Immediata |
| Invito al portale (Magic Link) | Committente | Immediata |
| Nuova versione / nuove tavole pubblicate | Committenti della commessa | Immediata (una email per pubblicazione) |
| Nuovo pin / nuova risposta del committente | Team assegnato alla commessa | Immediata, raggruppata in finestre di 10 minuti |
| Nuova risposta dello studio | Autore del pin + committenti che hanno partecipato al thread | Raggruppata in finestre di 10 minuti o riepilogo giornaliero (a scelta del committente) |
| Pin risolto | Autore del pin | Riepilogo giornaliero |
| Approvazione ricevuta | Team + tutti i committenti | Immediata |
| OTP di approvazione / di nuovo dispositivo | Committente | Immediata, **mai** raggruppata |
| Richiesta di modifica | Team | Immediata |
| Bozza AI del verbale pronta / trascrizione fallita | Autore del sopralluogo | Immediata (+ push web, Could) |
| Verbale inviato | Destinatari scelti | Immediata |
| Promemoria per scadenza di revisione | Committenti firmatari | 2 giorni prima e il giorno stesso |
| Quote all'80% / 100% | Owner | Immediata |
| Dominio o certificato in errore | Owner | Immediata |

- Tutte le email hanno il marchio del tenant (FR-M0-09), sono in versione HTML + testo semplice, contengono un link diretto all'oggetto e un link alle preferenze.
- Le email **transazionali di sicurezza** (OTP, reset password, inviti) non si possono disattivare.
- Link di disiscrizione per le notifiche non essenziali (in un clic, header `List-Unsubscribe`).
- **Gestione dei rimbalzi:** un indirizzo con rimbalzo permanente (hard bounce) viene segnato come non valido e lo studio vede un avviso sul contatto (`EC-16`).

---

## C. Audit, sicurezza operativa, supporto

### FR-MT-07 — Audit log · **M**

- Registro **append-only** di ogni evento rilevante: autenticazioni (riuscite e fallite), cambi di ruolo, accessi del committente, pubblicazioni, pin e commenti (creazione, modifica, ritiro), approvazioni, emissione di OTP, finalizzazioni, generazione e invio di documenti, download di file, revoche di token, esportazioni, sessioni di supporto, modifiche al branding e ai profili normativi.
- Campi: timestamp (UTC), tenant, attore (tipo + id), azione, oggetto (tipo + id), esito, IP (troncato dopo 90 giorni, vedi cap. 12), user agent, id della richiesta, dettagli (JSON, **senza** contenuti sensibili come i testi dei commenti o le password).
- Consultazione: l'Owner vede tutto il tenant, con filtri per data, utente, commessa e tipo di azione ed esportazione in CSV; l'Architetto vede solo le commesse assegnate.
- Conservazione: vedi cap. 12 (predefinito 10 anni per gli eventi legati ad approvazioni e documenti, 2 anni per gli eventi tecnici).
- **Integrità (Should):** catena di hash tra gli eventi (ogni record include l'hash del precedente) per rendere evidente qualsiasi manomissione.

### FR-MT-14 — Sessione di supporto (accesso assistito) · **S**

- L'Owner concede l'accesso al supporto per una durata (1–72 ore) e un ambito (intero tenant o una commessa).
- Il Platform Admin accede **in sola lettura** salvo autorizzazione esplicita alla scrittura; un banner evidente mostra "Sessione di supporto attiva".
- Ogni azione viene registrata con doppio attore (supporto per conto del tenant). L'Owner riceve un'email all'inizio e alla fine della sessione.

### FR-MT-15 — Console del Platform Admin · **M**

Elenco dei tenant con stato, piano, posti, storage, ultima attività; creazione, sospensione e riattivazione; gestione dei profili normativi di sistema; stato dei job asincroni (code di trascrizione e PDF, errori); invio di comunicazioni di servizio (banner di manutenzione programmata — FR-MT-17).

---

## D. Ricerca, dati, portabilità

### FR-MT-08 — Ricerca globale · **S**

Barra di ricerca (scorciatoia `Ctrl/Cmd + K`) su: commesse (codice, titolo, indirizzo, committente), elaborati (titolo, codice tavola), testi dei pin e dei commenti, testi dei verbali finalizzati. Risultati raggruppati per tipo, **sempre limitati al tenant corrente e ai permessi dell'utente** (`BR-04`).

### FR-MT-09 — Esportazione dei dati del tenant (portabilità) · **M**

L'Owner può chiedere un'esportazione completa: archivio ZIP con i file originali (elaborati, foto, audio, PDF), dati strutturati in JSON e CSV (commesse, contatti, pin, commenti, vani, aperture, sopralluoghi, audit log) e un file `README` che descrive il formato. Generazione asincrona, link di download firmato valido 7 giorni, notifica email. Serve anche per la chiusura del tenant (FR-M0-01) e per il diritto alla portabilità (art. 20 GDPR).

### FR-MT-10 — Diritti degli interessati · **M**

Procedure a supporto dello studio (titolare del trattamento) per gestire le richieste di accesso, rettifica, cancellazione e limitazione dei **committenti** e degli altri interessati. Vedi cap. 12 per il bilanciamento con gli obblighi di conservazione (`BR-13`).

---

## E. Esperienza d'uso generale

### FR-MT-11 — Aiuto e onboarding contestuale · **S**

Tooltip alla prima apertura di ogni modulo; pagina di aiuto con guide brevi (testo + GIF); link "Contatta il supporto". Nel portale del committente, un **mini-tutorial** di 3 passi al primo accesso: come navigare la tavola, come lasciare un commento, come approvare.

### FR-MT-12 — Predisposizione multilingua · **M** (predisposizione) / **W** (traduzioni)

Tutti i testi dell'interfaccia sono esternalizzati (nessuna stringa scritta nel codice dei componenti). La lingua della Beta è l'italiano; il formato di date e numeri segue la locale `it-IT`.

### FR-MT-13 — Accessibilità · **M**

Vedi `NFR-UX-04` (WCAG 2.2 AA per il portale del committente e l'app dello studio).

### FR-MT-16 — Feedback della Beta in-app · **M**

Pulsante "Invia feedback" sempre disponibile per gli utenti dello studio: testo, categoria (bug / suggerimento / domanda), screenshot facoltativo e contesto tecnico raccolto in automatico (URL, versione dell'app, browser, id dell'ultima richiesta). Arriva al backlog del team di prodotto.

### FR-MT-17 — Banner di stato e manutenzione · **S**

Messaggio di servizio pubblicato dal Platform Admin (es. manutenzione programmata), visibile in cima all'app dello studio. Nel portale del committente appare **senza** il marchio della piattaforma.

### FR-MT-18 — Gestione degli errori lato utente · **M**

- Messaggi d'errore in italiano chiaro, con un'azione suggerita e un **codice di riferimento** (id della richiesta) da comunicare al supporto.
- Mai stack trace, query o dettagli interni in interfaccia (`NFR-SEC-10`).
- Pagine 404, 403 e 500 con il marchio del tenant.

### FR-MT-19 — Cookie e tracciamento · **M**

- Solo cookie **tecnici** necessari (sessione, preferenze): per questi non serve un banner di consenso (Linee guida del Garante privacy sui cookie, 10/06/2021), ma serve l'informativa.
- Eventuali analytics di prodotto: solo in modalità **anonimizzata e senza cookie di profilazione**, oppure con consenso esplicito. **Nel portale del committente nessun analytics di terze parti** (`Q-17`).
