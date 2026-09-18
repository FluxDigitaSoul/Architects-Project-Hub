# 2. Attori, ruoli e matrice dei permessi (RBAC)

## 2.1 Profilazione degli attori

### Panoramica

| ID | Attore | Tipo | Autenticazione | Ambito | Beta |
|----|--------|------|----------------|--------|------|
| ACT-01 | Platform Admin | Interno (operatore SaaS) | Email + password + MFA obbligatoria | Tutta la piattaforma, **senza** accesso ai contenuti di progetto dei tenant | M |
| ACT-02 | Studio Owner (Titolare) | Utente del tenant | Email + password (MFA consigliata) oppure Magic Link email | Intero tenant | M |
| ACT-03 | Architetto | Utente del tenant | Come ACT-02 | Commesse del tenant (tutte o solo quelle assegnate, vedi `Q-04`) | M |
| ACT-04 | Collaboratore | Utente del tenant, con permessi ridotti | Come ACT-02 | Solo le commesse a cui è assegnato | S |
| ACT-05 | Committente (Cliente) | Esterno | Magic Link della commessa + OTP email per le azioni vincolanti | Solo la propria commessa, solo gli elaborati pubblicati | M |
| ACT-06 | Impresa esecutrice | Esterno passivo | Nessun accesso nella Beta (riceve email/PDF) | — | M (come destinatario) |
| ACT-07 | Sistema / Agente AI | Attore tecnico | Credenziali di servizio | Job asincroni (trascrizione, PDF, notifiche) | M |

### ACT-01 — Platform Admin

**Chi è:** personale del fornitore del SaaS.
**Obiettivi:** attivare gli studi, gestire le licenze, dare supporto, monitorare la piattaforma.
**Può:**
- creare, sospendere e riattivare un tenant; impostare il piano di licenza e il numero di posti;
- vedere metadati aggregati (numero di progetti, spazio occupato, ultimo accesso) per il supporto e la fatturazione;
- gestire i profili normativi **di sistema** (catalogo R.A.I. nazionale e regionale, vedi M3);
- avviare, con consenso esplicito e tracciato del tenant, una sessione di supporto a tempo ("impersonation" limitata, vedi `FR-MT-14`).

**Non può:** leggere elaborati, commenti, verbali, audio o dati personali dei committenti senza una sessione di supporto autorizzata e registrata nell'audit log (`BR-04`, `BR-15`).

### ACT-02 — Studio Owner (Titolare)

**Chi è:** titolare o socio dello studio; di solito è anche architetto operativo.
**Obiettivi:** configurare lo studio, gestire il team, avere il quadro di tutte le commesse.
**Responsabilità specifiche:**
- anagrafica dello studio (ragione sociale, P.IVA, ordine professionale), branding, dominio;
- invito, sospensione e rimozione dei membri, assegnazione dei ruoli;
- definizione dei profili normativi **di studio** (es. regolamento edilizio del Comune in cui lavora di più);
- visibilità su tutte le commesse, anche quelle a cui non è assegnato;
- export completo dei dati del tenant (portabilità) e richiesta di chiusura dell'account.

Ogni tenant **deve** avere almeno un Owner attivo (`BR-12`).

### ACT-03 — Architetto

**Chi è:** professionista iscritto all'albo, dipendente, socio o collaboratore stabile.
**Obiettivi:** portare avanti le commesse.
**Responsabilità specifiche:**
- creare e gestire le commesse, invitare il committente, generare e rigenerare il Magic Link;
- caricare e pubblicare gli elaborati, rispondere ai pin, risolverli;
- compilare vani e aperture R.A.I. e generare la relazione;
- fare i sopralluoghi, revisionare la trascrizione AI, finalizzare e inviare il verbale.

**Firma dei documenti:** per le relazioni R.A.I. e i verbali, il firmatario è un Architetto (o Owner) con un **numero di iscrizione all'albo** nel profilo (`BR-08`). Il ruolo di **Direttore dei Lavori** si assegna per commessa (attributo dell'assegnazione, non ruolo di sistema).

### ACT-04 — Collaboratore (Should)

**Chi è:** tirocinante, disegnatore, geometra junior, collaboratore occasionale.
**Differenze rispetto all'Architetto:**
- vede solo le commesse a cui è assegnato;
- può caricare elaborati **in bozza** ma non pubblicarli al cliente;
- può inserire vani e aperture ma **non** firmare o generare la relazione definitiva;
- può fare sopralluoghi e preparare la bozza del verbale, ma **non** finalizzarlo né inviarlo;
- non può gestire il Magic Link né i dati del committente.

### ACT-05 — Committente (Cliente finale)

**Chi è:** privato, condominio (tramite amministratore), impresa o ente che ha affidato l'incarico.
**Profilo tipico:** non tecnico, usa lo smartphone o il tablet, accede raramente.
**Obiettivi:** vedere a che punto è il progetto, commentare le tavole, approvare.
**Accesso:** Magic Link personale e revocabile (`BR-03`). **Nessuna password.**
**Può:**
- vedere gli elaborati **pubblicati** della propria commessa (non le bozze);
- inserire pin e commenti sulla versione corrente di un elaborato non approvato;
- rispondere nei thread e riaprire un pin risolto (entro i limiti di `BR-01`);
- approvare formalmente un elaborato (sign-off) se designato come **firmatario** (`BR-10`);
- vedere e scaricare i documenti che lo studio condivide (verbali, relazioni) — Should;
- gestire le proprie preferenze di notifica.

**Più committenti per commessa:** una commessa può avere più contatti (es. coniugi, comproprietari, amministratore e consigliere). Ognuno ha il proprio Magic Link. Solo i contatti con il flag *firmatario* possono fare il sign-off. La regola predefinita è "basta un firmatario"; si può configurare "servono tutti i firmatari" (`Q-05`).

### ACT-06 — Impresa esecutrice (passiva nella Beta)

**Chi è:** l'impresa che esegue i lavori; destinataria degli ordini di servizio.
**Nella Beta:** è un'anagrafica collegata alla commessa (ragione sociale, referente, email, PEC). Riceve via email il PDF del verbale. Non ha accesso al sistema.
**Fase 2:** portale con presa visione tracciata degli ordini di servizio e caricamento delle proprie foto e dichiarazioni.

### ACT-07 — Sistema / Agente AI

Attore tecnico che esegue compiti asincroni: trascrizione audio, strutturazione del testo in tre blocchi, generazione dei PDF, invio delle notifiche, scadenza dei token, pulizia dei file temporanei. Le sue azioni compaiono nell'audit log con l'attore `system` e il riferimento al job.

---

## 2.2 Matrice CRUD e permessi

**Legenda:** C = Crea · R = Legge · U = Modifica · D = Elimina/archivia · A = Approva/Finalizza/Firma · X = Esegue un'azione speciale · — = nessun accesso · `(ass.)` = solo sulle commesse assegnate · `(pub.)` = solo sulle risorse pubblicate · `(propri)` = solo sui contenuti creati da sé

### Entità del tenant e dello studio

| Entità | Platform Admin | Owner | Architetto | Collaboratore | Committente |
|--------|----------------|-------|------------|---------------|-------------|
| Tenant (creazione, stato, licenza) | C R U D | R | — | — | — |
| Profilo studio (anagrafica, albo) | R (metadati) | R U | R | R | R (dati mostrati nel portale) |
| Branding (logo, palette) | R | R U | R | R | R (applicato) |
| Dominio / CNAME | R U (supporto) | R U | — | — | — |
| Membri e ruoli | R (conteggio) | C R U D | R | R | — |
| Profili normativi di sistema | C R U D | R | R | R | — |
| Profili normativi dello studio | — | C R U D | C R U | R | — |
| Audit log del tenant | R (solo in sessione di supporto) | R | R (ass.) | — | — |
| Export dati / chiusura tenant | X (esegue su richiesta) | X | — | — | — |

### Entità della commessa

| Entità | Owner | Architetto | Collaboratore | Committente |
|--------|-------|------------|---------------|-------------|
| Commessa (anagrafica, stato) | C R U D | C R U D(ass.)¹ | R (ass.) | R (solo i campi pubblici) |
| Assegnazione del team | C R U D | C R U (ass.) | R (ass.) | — |
| Contatti del committente | C R U D | C R U D (ass.) | R (ass.) | R U (solo il proprio profilo di contatto) |
| Magic Link (genera, revoca, rigenera) | X | X (ass.) | — | — |
| Impresa esecutrice | C R U D | C R U D (ass.) | R (ass.) | — |
| Elaborato (contenitore) | C R U D | C R U D (ass.) | C R U (ass.) | R (pub.) |
| Versione di elaborato — bozza | C R U D | C R U D (ass.) | C R U D (ass., propri) | — |
| Versione di elaborato — pubblicazione | X | X (ass.) | — | — |
| Versione di elaborato — sign-off | — | — | — | A (solo firmatario) |
| Pin | C R U² | C R U² (ass.) | C R U² (ass.) | C R U² (pub.) |
| Commento nel thread | C R U³ | C R U³ (ass.) | C R U³ (ass.) | C R U³ (pub.) |
| Stato del pin (Risolto / Riaperto) | X | X (ass.) | X (ass.) | X (solo Riaperto, `BR-11`) |
| Richiesta di modifica post-approvazione | R U | R U (ass.) | R (ass.) | C R |
| Vano / Apertura R.A.I. | C R U D | C R U D (ass.) | C R U D (ass.) | — |
| Relazione R.A.I. (generazione definitiva) | A | A (ass.) | — | R (se condivisa) |
| Sopralluogo (bozza) | C R U D | C R U D (ass.) | C R U D (ass.) | — |
| Sopralluogo (finalizzazione, invio) | A X | A X (ass.) | — | R (se condiviso) |
| Foto / audio del sopralluogo | C R U D⁴ | C R U D⁴ (ass.) | C R U D⁴ (ass.) | R (solo le foto incluse nel PDF condiviso) |
| Documenti PDF generati | R D⁵ | R (ass.) | R (ass.) | R (se condivisi) |

**Note:**
1. L'Architetto può archiviare una commessa assegnata. L'**eliminazione definitiva** di una commessa spetta solo all'Owner (`BR-13`).
2. Un pin si può modificare (posizione, testo del primo commento) solo dal suo autore, solo finché nessun altro ha risposto e solo se l'elaborato non è approvato (`BR-01`). **Non** si elimina fisicamente: si ritira con stato `Ritirato`.
3. Un commento si può modificare solo dal suo autore entro 15 minuti dall'invio e solo se nessuno ha ancora risposto. Il sistema salva la cronologia delle modifiche (`BR-14`). Mai dopo l'approvazione (`BR-01`).
4. Dopo la finalizzazione del verbale, le foto e l'audio inclusi non si possono più eliminare (`BR-09`).
5. I PDF finalizzati non si eliminano: si **annullano** con motivazione e restano nell'archivio (`BR-09`).

### Regole trasversali di autorizzazione

- **RBAC + ABAC:** il ruolo definisce le azioni possibili; gli attributi (assegnazione alla commessa, stato della risorsa, autore, flag di firmatario) le restringono. Il controllo avviene **sempre lato server**; l'interfaccia che nasconde i pulsanti è solo una comodità.
- **Isolamento dei tenant (`BR-04`):** ogni lettura e scrittura è filtrata dall'identificativo del tenant, ricavato dalla sessione autenticata e mai da parametri inviati dal client.
- **Principio del privilegio minimo:** nuovi membri e nuovi contatti partono con i permessi minimi del loro ruolo.
- **Sospensione di un membro:** le sessioni attive vengono revocate entro 60 secondi; i contenuti che ha prodotto restano, con l'autore indicato come "(utente sospeso)".
- **Rimozione di un membro:** i suoi contenuti restano (servono all'integrità della commessa). Il nominativo resta nei documenti già firmati, perché è un dato storico necessario.
