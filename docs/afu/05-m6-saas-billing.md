# 5.6 Modulo 6 — SaaS self-service: registrazione, prova, piani, abbonamenti e servizi FDS

**Obiettivo:** uno studio deve poter **scoprire → provare → configurare → pagare** il Project Hub **senza alcun intervento umano**. In parallelo FDS deve poter **vendere e fare** la configurazione per conto dello studio (servizio a pagamento) e gestire promozioni e prove gratuite.

**Principio architetturale (vincolante da subito, anche nella Beta):** ogni funzione del prodotto passa da un **sistema di piani e diritti d'uso (entitlements)** configurabile senza deploy (FR-M6-05). Nessun limite o funzione a pagamento va scritto nel codice come caso speciale.

Riferimento di business: [cap. 15](15-modello-business.md).

---

## Priorità per fase

| Colonna | Significato |
|---------|-------------|
| **Beta** | Serve già nella Beta con lo studio partner (la Beta si fa con tenant creati a mano o in autonomia, **senza** pagamento) |
| **Lancio** | Serve per l'apertura commerciale (v1.0 self-service) |

| ID | Requisito | Beta | Lancio |
|----|-----------|------|--------|
| FR-M6-01 | Registrazione self-service | S | M |
| FR-M6-02 | Provisioning automatico del tenant (wizard) | M | M |
| FR-M6-03 | Progetto dimostrativo precaricato | S | M |
| FR-M6-04 | Periodo di prova e ciclo di vita del trial | C | M |
| FR-M6-05 | Catalogo piani e motore entitlements | **M** | M |
| FR-M6-06 | Abbonamento e pagamenti (Stripe Billing) | W | M |
| FR-M6-07 | Fatturazione elettronica italiana (SDI) | W | M |
| FR-M6-08 | Cambio piano (upgrade/downgrade) | W | M |
| FR-M6-09 | Misurazione dei consumi e quote | M | M |
| FR-M6-10 | Servizi professionali FDS (configurazione assistita) | S | M |
| FR-M6-11 | Coupon, promozioni ed early adopter | W | M |
| FR-M6-12 | Programma referral | W | C |
| FR-M6-13 | Badge "Redatto con" (crescita virale) | C | S |
| FR-M6-14 | Back-office FDS: gestione commerciale dei tenant | S | M |
| FR-M6-15 | Metriche di prodotto e attivazione | S | M |
| FR-M6-16 | Disdetta self-service e fine rapporto | W | M |
| FR-M6-17 | Accettazione di termini, DPA e privacy alla registrazione | **M** | M |
| FR-M6-18 | Email del ciclo di vita (onboarding, fine prova) | C | S |
| FR-M6-19 | Strumenti pubblici gratuiti per l'acquisizione (lead magnet) | W | C |

---

## FR-M6-01 — Registrazione self-service

- Metodi: **email + password** con verifica dell'email; **Google** (Should) e **Microsoft** (Could).
- Dati minimi alla registrazione: nome, cognome, email, password, nome dello studio. Il resto si chiede nel wizard (FR-M6-02), per non perdere utenti al primo passo.
- **Antiabuso:** CAPTCHA non invasivo; blocco dei domini email usa-e-getta; limite di registrazioni per IP; un solo trial per P.IVA (verificato quando la P.IVA viene inserita — FR-M6-04).
- Se l'email è già registrata, il sistema propone login o recupero password, senza rivelare dettagli.
- **Registrazione su invito:** se l'email ha un invito pendente in uno studio (FR-M0-08), la registrazione porta dentro quello studio e **non** crea un nuovo tenant.

## FR-M6-02 — Provisioning automatico del tenant (wizard di onboarding)

Estende e sostituisce FR-M0-01 per il canale self-service (per il canale assistito resta la creazione da parte del Platform Admin).

| Passo | Contenuto | Obbligatorio |
|-------|-----------|--------------|
| 1. Identità dello studio | Denominazione (→ **slug** proposto in automatico, modificabile, con verifica di disponibilità in tempo reale), P.IVA, indirizzo, tipologia (professionista singolo / studio associato / società) | Denominazione sì; il resto si può rimandare, ma è obbligatorio prima del primo pagamento e della prima relazione asseverativa |
| 2. Profilo professionale | Titolo, ordine, numero di iscrizione | No (richiesto prima di firmare documenti — BR-08) |
| 3. Branding | Logo + colore primario con **anteprima dal vivo** di pulsanti, portale ed email/PDF | No (predefiniti neutri) |
| 4. Attivazione | Creazione atomica di: tenant, membership Owner, branding, profilo normativo predefinito, abbonamento in **trial** sul piano di prova, progetto demo (FR-M6-03). Redirect al sottodominio dello studio | Sì |

- **Atomicità:** se un passo di creazione fallisce, non restano tenant a metà (transazione e compensazione) (`BR-26`).
- **Tempo obiettivo:** dal clic su "Attiva" allo studio pronto ≤ 5 s (`NFR-PERF-10`).
- Il wizard si riprende da dove era stato lasciato.

## FR-M6-03 — Progetto dimostrativo precaricato

- Alla creazione del tenant viene clonato un **progetto demo** (es. "Ristrutturazione Villa Flora") con: 1 elaborato con 2 pin e un thread, un fabbricato con vani R.A.I. (almeno uno conforme, uno non conforme, uno con deroga), 1 sopralluogo finalizzato con 2 foto e testo strutturato, PDF già generati.
- Il progetto demo è marcato **DEMO**: ha un banner "Progetto di esempio"; è escluso da quote, limiti di piano e metriche di utilizzo; non manda email a persone reali (i committenti demo sono fittizi con indirizzi non recapitabili); si elimina con un clic.
- Il contenuto demo è **versionato** come template gestito da FDS (aggiornabile senza deploy).

## FR-M6-04 — Periodo di prova e ciclo di vita del trial

- **Durata configurabile** dal catalogo piani (predefinito proposto: **30 giorni** in fase di lancio / early adopter, **14 giorni** a regime — `Q-23`). Il Platform Admin può estenderla per singolo tenant.
- **Nessuna carta richiesta** per iniziare la prova.
- Durante il trial: funzioni del piano **Studio Pro** (per far provare il valore pieno), con i limiti di consumo del trial (es. minuti AI ridotti — FR-M6-09).
- **Promemoria** in-app ed email a 7, 3 e 1 giorno dalla scadenza.
- **Alla scadenza senza abbonamento → modalità "Sola lettura":**
  - si possono consultare ed **esportare** tutti i dati (FR-MT-09);
  - non si possono creare commesse, caricare elaborati, fare sopralluoghi né generare documenti definitivi;
  - il **portale dei committenti** resta consultabile per 30 giorni (per non danneggiare il rapporto dello studio con i suoi clienti), poi viene disattivato con un messaggio neutro;
  - banner "Attiva un piano per continuare".
- **Conservazione dopo il trial:** senza attivazione, i dati si conservano 90 giorni dalla scadenza, con avvisi a 30 e 7 giorni prima della cancellazione, poi si cancellano (cap. 12, `BR-27`).
- **Un trial per studio:** identificato da P.IVA e dominio email aziendale; nuovi tentativi finiscono in revisione manuale.

## FR-M6-05 — Catalogo piani e motore entitlements

**Catalogo configurabile dal back-office (senza deploy)**, con versioni: un tenant resta sulla versione del piano sottoscritta finché non cambia (tutela dei prezzi per i clienti esistenti — grandfathering).

| Tipo di diritto | Esempi | Applicazione |
|-----------------|--------|--------------|
| **Limiti numerici** | `seats.max` (utenti), `projects.active.max`, `storage.bytes.max`, `ai.minutes.month.max`, `clients.per_project.max` | Controllo server-side prima di ogni creazione; messaggio con proposta di upgrade |
| **Funzioni (feature flag)** | `whitelabel.level` (`base`/`full`), `custom_domain`, `email_sender_domain`, `rai.module`, `ai.transcription`, `advanced_roles`, `badge.removable`, `support.priority` | Controllo server-side + interfaccia che mostra la funzione come "disponibile nel piano X" |
| **Override per tenant** | Limiti o funzioni concessi a mano dal Platform Admin (es. partner Beta, accordi speciali), con scadenza facoltativa e motivo | Tracciati nell'audit |

**Regole:**
- Il controllo dei diritti è **centralizzato** (un solo servizio `entitlements`); nessun modulo decide da solo cosa è a pagamento (`BR-28`).
- Superare un limite **blocca le nuove creazioni**, mai l'accesso ai dati esistenti né le operazioni già in corso (es. sincronizzazione di un sopralluogo — EC-17) (`BR-29`).
- "Commessa attiva" = stato `Attiva` o `Sospesa`; chiuse e archiviate non contano.

**Piani di riferimento** (valori definitivi in `Q-24`, vedi cap. 15):

| Diritto | Architetto Solo | Studio Pro | Studio Enterprise |
|---------|-----------------|------------|-------------------|
| Utenti | 1 | fino a 3 (+ posti extra) | illimitati |
| Commesse attive | 3 | illimitate | illimitate |
| White-label | base (logo + colore, sottodominio) | completo (carta intestata, email con nome studio) | completo |
| Dominio personalizzato | — | add-on | incluso |
| Modulo R.A.I. | sì | sì | sì |
| Trascrizione AI | minuti limitati | minuti inclusi (fair use) | minuti estesi |
| Ruoli avanzati (Collaboratore, permessi) | — | base | avanzati |
| Badge "Redatto con" | visibile | rimovibile | rimovibile |
| Supporto | email | email | prioritario + onboarding dedicato |

## FR-M6-06 — Abbonamento e pagamenti

- Provider: **Stripe Billing** (abbonamenti mensili e annuali, prova, coupon, proration, solleciti automatici). Pagamento con **Stripe Checkout** (pagina ospitata: nessun dato della carta passa dai nostri sistemi — PCI DSS SAQ A).
- **Stripe Customer Portal** per cambio carta, storico pagamenti, disdetta: niente pagine di fatturazione da costruire.
- **Metodi di pagamento:** carta; **SEPA Direct Debit** (Should — molto usato nel B2B italiano); bonifico per i piani annuali Enterprise (gestito a mano — Could).
- **Sincronizzazione tramite webhook** (idempotenti, firmati, con retry): lo stato dell'abbonamento nel nostro database si aggiorna **solo** dagli eventi Stripe verificati (`BR-30`).
- **Stati dell'abbonamento** (SM-ABBONAMENTO): `trialing → active → past_due → (active | unpaid → canceled)`; `active → canceled` (a fine periodo); `paused` (Could).
- **Pagamento non riuscito (dunning):** Stripe ritenta secondo la sua pianificazione; l'Owner viene avvisato; dopo 14 giorni in `past_due` il tenant passa in **sola lettura** come a fine trial; il ripristino è automatico appena il pagamento va a buon fine.
- **Prezzi IVA esclusa** mostrati come tali; IVA italiana al 22% applicata ai clienti italiani (Stripe Tax o aliquota fissa — `Q-25`).

## FR-M6-07 — Fatturazione elettronica italiana (SDI)

> ⚠️ In Italia le fatture B2B vanno emesse in formato elettronico (FatturaPA/XML) tramite il **Sistema di Interscambio (SDI)**. Le ricevute e fatture di Stripe **non** bastano.

- Dati fiscali obbligatori prima del primo pagamento: ragione sociale, P.IVA, codice fiscale, sede, **codice destinatario SDI** o **PEC**.
- A ogni pagamento riuscito (evento Stripe `invoice.paid`) il sistema **emette automaticamente la fattura elettronica** tramite un provider SDI via API (es. software di fatturazione con API; scelta in `Q-26`), idempotente sull'id della fattura Stripe.
- Note di credito per i rimborsi.
- La fattura in copia di cortesia (PDF) è scaricabile dall'Owner nell'area "Fatturazione".
- Le fatture dei **servizi una tantum FDS** (FR-M6-10) seguono lo stesso flusso.

## FR-M6-08 — Cambio piano

- **Upgrade:** immediato, con importo proporzionale (proration) addebitato subito.
- **Downgrade:** a fine periodo di fatturazione. Se al momento del downgrade l'utilizzo supera i limiti del piano inferiore (es. 5 utenti su un piano da 1), il sistema chiede di rientrare nei limiti (es. scegliere quali utenti sospendere) oppure applica la regola `BR-29` (nessuna cancellazione, blocco delle nuove creazioni).
- Passaggio mensile ↔ annuale gestito da Stripe.

## FR-M6-09 — Misurazione dei consumi e quote

- Contatori per tenant, aggiornati in modo affidabile (idempotenti, ricalcolabili): utenti attivi, commesse attive, storage in byte, minuti di audio trascritti nel mese solare, numero di documenti generati (solo metrica).
- Estende FR-M0-13 (dashboard e avvisi all'80% e al 100%).
- **Pacchetti aggiuntivi (Could):** minuti AI extra, storage extra, acquistabili come add-on ricorrenti o una tantum.
- **Fair use:** i piani con AI "inclusa" hanno comunque un tetto tecnico anti-abuso, comunicato nei termini.

## FR-M6-10 — Servizi professionali FDS (configurazione assistita / concierge)

FDS vende e svolge servizi per conto dello studio:

| Servizio | Contenuto | Prezzo di riferimento |
|----------|-----------|-----------------------|
| **Setup White-Label "Zero Sbatti"** | Lo studio manda logo, dati e colori; FDS configura profilo, branding, dominio, profilo normativo, membri e un primo progetto reale | una tantum (rif. 250 €) |
| **Onboarding dedicato** | Call di formazione (60–90 min) per il team | una tantum o incluso in Enterprise |
| **Migrazione dati** | Import di commesse e documenti esistenti | a preventivo |
| **Profilo normativo comunale su misura** | Costruzione del profilo R.A.I. del regolamento del comune dello studio | a preventivo / add-on |

**Requisiti funzionali:**
- Acquisto del servizio **self-service** (Stripe Checkout una tantum) o **aggiunto dal back-office** (vendita diretta).
- Ogni servizio acquistato crea un **ordine di lavoro** nel back-office FDS con stato (`Da fare / In corso / In attesa del cliente / Completato`), checklist e scadenza.
- **Raccolta dei materiali:** form guidato in-app per il cliente (upload del logo, dati dello studio, colori, elenco del team) collegato all'ordine.
- **Esecuzione:** l'operatore FDS lavora sul tenant tramite **sessione di supporto con consenso** (FR-MT-14), con permesso di **scrittura** limitato all'ambito del servizio e alla durata dell'ordine. Ogni modifica viene tracciata con doppio attore.
- **Canale assistito completo:** il Platform Admin può creare il tenant per lo studio, precompilarlo e poi **consegnarlo** all'Owner con l'invito (FR-M0-01), applicando un trial esteso o un coupon.

## FR-M6-11 — Coupon, promozioni ed early adopter

- Coupon percentuali o a importo fisso, con durata (una volta, N mesi, per sempre), limite di utilizzi e scadenza (gestiti in Stripe e riflessi nel back-office).
- **Offerta early adopter:** prezzo annuale bloccato (es. primo anno a prezzo speciale) marcato sul tenant, così da poter onorare l'impegno anche con i cambi di listino.
- Mesi gratuiti concessi a mano (es. "3 mesi in cambio di feedback").

## FR-M6-12 — Programma referral (Could al lancio)

Link personale di invito per ogni studio; se lo studio invitato attiva un piano a pagamento, entrambi ricevono un credito (es. 1 mese). Antifrode: stessa P.IVA o stesso dominio → nessun credito.

## FR-M6-13 — Badge "Redatto con" (crescita virale)

- Una dicitura discreta **"Redatto con {NomeProdotto}"**, con link alla landing (parametri UTM che indicano il tipo di documento), nel **piè di pagina dei PDF** (verbali, relazioni) e nella **pagina di download** dei documenti inviati a terzi.
- **Visibilità per piano (FR-M6-05, `badge.removable`):** sempre visibile nel trial e nel piano Solo; rimovibile dall'Owner nei piani Pro ed Enterprise.
- **Non** compare mai: nel portale del committente dei piani con white-label completo; nei testi dei documenti; accanto alla firma o alla formula di asseverazione.
- Questa regola **modifica** `NFR-BRAND-02` e chiude `Q-07`.

## FR-M6-14 — Back-office FDS: gestione commerciale dei tenant

Estende la console del Platform Admin (FR-MT-15):
- elenco dei tenant con piano, stato dell'abbonamento, fine del trial, MRR del tenant, data di registrazione, ultima attività, **punteggio di salute** (utilizzo negli ultimi 14 giorni: accessi, commesse, documenti);
- filtri: "trial in scadenza", "trial senza attività" (da contattare), "past_due", "a rischio di abbandono";
- azioni: estendere il trial, applicare coupon o mesi gratis, override dei limiti, creare un ordine di servizio, avviare una sessione di supporto (con consenso);
- cruscotto aziendale: MRR, ARR, nuovi tenant, conversioni trial → pagamento, abbandoni (churn), ARPU (vedi cap. 15);
- **nessun accesso ai contenuti dei progetti** fuori da una sessione di supporto (BR-15).

## FR-M6-15 — Metriche di prodotto e attivazione

- Eventi di **attivazione** registrati lato server (senza tracciatori di terze parti): primo progetto reale creato, prima tavola pubblicata, primo committente che ha fatto accesso, primo vano R.A.I. conforme, primo verbale finalizzato, secondo utente invitato.
- **Definizione di "studio attivato"** (`Q-27`, proposta): almeno 1 progetto reale + almeno 1 tra (tavola pubblicata con accesso del committente, verbale finalizzato, relazione R.A.I. generata) entro 7 giorni dalla registrazione.
- Funnel: visita → registrazione → wizard completato → attivazione → pagamento.
- Rispetto della privacy: dati aggregati, conservazione limitata, nessun analytics di terze parti nel portale del committente (FR-MT-19).

## FR-M6-16 — Disdetta self-service e fine rapporto

- Disdetta dal Customer Portal, efficace **a fine periodo**; breve questionario di uscita facoltativo; offerta di pausa o di downgrade prima della conferma (Could).
- A fine periodo: sola lettura per 30 giorni con export completo, poi il ciclo di chiusura di FR-M0-01 (`In chiusura → Eliminato`) nei termini del cap. 12 e di `BR-13`.

## FR-M6-17 — Accettazione di termini, DPA e privacy alla registrazione

- Clickwrap **obbligatorio** alla registrazione: Termini di servizio + **DPA** (accordo di nomina a responsabile del trattamento, art. 28 GDPR) + presa visione dell'informativa privacy.
- Registrazione di: versione dei documenti, data e ora, utente, IP.
- **Nuove versioni** dei documenti: richiesta di nuova accettazione al primo accesso dell'Owner; le modifiche sostanziali vanno comunicate con preavviso.
- Consenso **separato e facoltativo** per le comunicazioni commerciali (newsletter) — non richiesto per le email transazionali.

## FR-M6-18 — Email del ciclo di vita

Sequenza transazionale di onboarding (giorno 0 benvenuto, giorno 1 "pubblica la tua prima tavola", giorno 3 "prova il verbale vocale", giorno 7 "calcola il R.A.I. di un progetto reale"), avvisi di fine prova, pagamento non riuscito, riepilogo mensile dei consumi. Le email di onboarding si interrompono quando l'azione è già stata fatta.

## FR-M6-19 — Strumenti pubblici gratuiti (lead magnet)

**Fuori dall'app principale** (sito di marketing separato), ma con requisiti di integrazione:
- **Calcolatore R.A.I. gratuito per una stanza** che usa la **stessa libreria** `rai-engine` (V-05); per salvare o esportare il PDF "ufficiale" bisogna registrarsi e i dati inseriti passano nel trial.
- Modelli scaricabili (es. fac-simile di verbale) in cambio della registrazione.
- Pagine con tracciamento della provenienza (UTM) fino alla registrazione (FR-M6-15).

---

## Nuove regole di business collegate

Il dettaglio è nel [cap. 6](06-business-rules.md).

| ID | Regola |
|----|--------|
| BR-26 | Provisioning del tenant atomico |
| BR-27 | Conservazione e cancellazione dei dati dei trial non convertiti |
| BR-28 | Diritti d'uso verificati solo dal servizio entitlements, lato server |
| BR-29 | Superare un limite blocca le nuove creazioni, mai l'accesso o il lavoro in corso |
| BR-30 | Stato dell'abbonamento aggiornato solo da eventi Stripe verificati |

## Criteri di accettazione chiave del Modulo 6

- **AC-FR-M6-02-1** — *Dato* un nuovo utente con email verificata, *quando* completa il wizard e preme "Attiva", *allora* entro 5 s esistono il tenant, la membership Owner, l'abbonamento in trial, il progetto demo, e l'utente atterra su `https://{slug}.{dominio}` con il suo branding.
- **AC-FR-M6-02-2** — *Dato* un errore simulato nella clonazione del progetto demo, *quando* l'utente attiva lo studio, *allora* non resta nessun tenant parziale e l'utente può riprovare.
- **AC-FR-M6-04-1** — *Dato* un trial scaduto senza abbonamento, *quando* l'Owner prova a creare una commessa, *allora* il sistema blocca con la proposta di attivare un piano; *quando* prova a esportare i dati, *allora* ci riesce.
- **AC-FR-M6-05-1** — *Dato* un tenant sul piano Solo con 3 commesse attive, *quando* prova a crearne una quarta (anche chiamando direttamente l'API), *allora* riceve `402 PLAN_LIMIT_REACHED` con il limite e il piano consigliato; *quando* chiude una commessa, *allora* può crearne una nuova.
- **AC-FR-M6-05-2** — *Dato* un override "commesse illimitate fino al 31/12" concesso a un tenant Solo, *quando* crea la quarta commessa, *allora* l'operazione riesce e l'override compare nell'audit.
- **AC-FR-M6-06-1** — *Dato* un webhook Stripe `customer.subscription.updated` ricevuto due volte, *allora* lo stato viene aggiornato una volta sola; *dato* un webhook con firma non valida, *allora* viene rifiutato e registrato come evento di sicurezza.
- **AC-FR-M6-07-1** — *Dato* un pagamento riuscito di un tenant con codice SDI, *allora* entro 10 minuti la fattura elettronica è trasmessa tramite il provider e la copia PDF è disponibile nell'area Fatturazione; un nuovo invio dello stesso evento non crea una seconda fattura.
- **AC-FR-M6-10-1** — *Dato* uno studio che acquista il "Setup Zero Sbatti", *allora* nel back-office compare un ordine "Da fare"; l'operatore può scrivere nel tenant solo dopo il consenso dell'Owner e solo fino al completamento dell'ordine.
- **AC-FR-M6-13-1** — *Dato* un tenant Pro con il badge disattivato, *quando* genera un verbale, *allora* il PDF non contiene la dicitura "Redatto con"; *dato* un tenant in trial, *allora* la contiene nel piè di pagina.
