# 12. Quadro normativo, privacy e compliance

> ⚠️ Questo capitolo elenca i **requisiti funzionali che derivano** dalle norme e le relative decisioni di progetto. Non è un parere legale. Tutti i punti marcati 🔎 vanno **validati da un consulente legale / DPO** prima dell'apertura della Beta a dati reali di committenti.

## 12.1 Normativa tecnica di dominio

| Norma | Rilevanza | Dove si applica |
|-------|-----------|-----------------|
| D.M. Sanità 5 luglio 1975 | Requisiti igienico-sanitari: altezze (art. 1), superfici (artt. 2–3), illuminazione e superficie finestrata apribile ≥ 1/8, FLDm ≥ 2% (art. 5), ventilazione (art. 6), servizi igienici (art. 7) | M3, profilo nazionale |
| D.P.R. 380/2001 (Testo Unico Edilizia) | Titoli edilizi (CILA, SCIA, PdC), agibilità (art. 24), tolleranze (art. 34-bis) | M3, M5 (relazione), glossario |
| D.L. 69/2024 conv. L. 105/2024 ("Salva Casa") | Art. 24 c. 5-bis e seguenti DPR 380/2001: asseverazione con altezza fino a 2,40 m e monostanza 20/28 mq, a condizioni specifiche; modifiche alle tolleranze | M3 (deroga D-01) |
| Linee di indirizzo MIT sul Salva Casa (gennaio 2025) | Criteri interpretativi, tra cui la tolleranza del 2% per i requisiti igienico-sanitari | M3 (`Q-02`) |
| Regolamenti edilizi comunali, regolamenti d'igiene locali, leggi regionali (es. recupero dei sottotetti) | Parametri R.A.I. locali (quote, aggetti, soglie per i sottotetti), altezze medie dei sottotetti | Profili normativi locali (`Q-11`) |
| Codice penale art. 481; D.P.R. 445/2000 art. 76; L. 241/1990 art. 19 c. 6 | Responsabilità per false attestazioni del professionista | Formula di asseverazione, BR-07 |
| Codice civile art. 1669 (rovina e difetti di cose immobili), art. 2946 (prescrizione decennale) | Motivano la conservazione decennale dei documenti di commessa | BR-13, conservazione |
| D.Lgs. 81/2008 (sicurezza nei cantieri) | Il verbale può riportare irregolarità di sicurezza; il sistema **non** sostituisce gli adempimenti del CSE (POS, PSC, verbali di coordinamento) | M4 (solo menzione; fuori perimetro) |

## 12.2 Protezione dei dati personali (GDPR — Reg. UE 2016/679, D.Lgs. 196/2003 e s.m.i.)

### Ruoli privacy 🔎

| Trattamento | Titolare | Responsabile (art. 28) | Note |
|-------------|----------|------------------------|------|
| Dati dei committenti, delle imprese, dei presenti in cantiere e contenuti di progetto | **Studio** (tenant) | **Fornitore della piattaforma** | Serve un **DPA** (accordo di nomina a responsabile) tra studio e fornitore, accettato alla sottoscrizione |
| Sub-trattamento (cloud, email, AI) | — | Sub-responsabili del fornitore (es. AWS e servizi collegati) | Elenco pubblico dei sub-responsabili; preavviso allo studio in caso di modifiche |
| Dati degli account degli utenti dello studio per contratto, fatturazione, sicurezza | **Fornitore** | — | Informativa del fornitore agli utenti |

### Requisiti funzionali che ne derivano

| ID | Requisito | Collegamento |
|----|-----------|--------------|
| PRIV-01 | **Informativa ai committenti** mostrata al primo accesso al portale, **a nome dello studio** (titolare), con un testo configurabile dal tenant e un modello predefinito; presa visione registrata | FR-M1-05 |
| PRIV-02 | **Informativa per i presenti in cantiere** sulla registrazione vocale: il DL deve informare i presenti prima di registrare. L'app mostra un promemoria alla prima registrazione di ogni sopralluogo ("Hai informato i presenti della registrazione?"); la risposta viene registrata 🔎 | FR-M4-08 |
| PRIV-03 | **Minimizzazione dell'audio:** dopo la finalizzazione del verbale, l'audio grezzo si conserva per un periodo configurabile dal tenant (predefinito **90 giorni**) e poi si **elimina** in automatico; restano trascrizione e verbale. Lo studio può scegliere di conservarlo più a lungo, motivandolo 🔎 (`Q-20`) | FR-M4-09 |
| PRIV-04 | **Nessun uso biometrico della voce:** l'audio non si usa per identificare le persone (niente speaker identification/diarizzazione nominativa nella Beta), così la voce non diventa dato biometrico ex art. 9 | FR-M4-09 |
| PRIV-05 | **Residenza dei dati nell'UE** per database, storage, backup ed elaborazioni AI (NFR-PRIV-01) | cap. 14 |
| PRIV-06 | **Fornitori AI senza addestramento** sui dati e con conservazione minima (NFR-PRIV-02) | cap. 14 |
| PRIV-07 | **Diritti degli interessati:** funzioni di esportazione e di cancellazione o anonimizzazione per contatto (committente, presente) a disposizione dello studio (FR-MT-10), che tengano conto degli obblighi di conservazione (BR-13). La cancellazione di un contatto con approvazioni o documenti definitivi porta alla **pseudonimizzazione** dei campi non essenziali e alla conservazione di quelli necessari alla prova | FR-MT-10 |
| PRIV-08 | **Registro dei trattamenti** (art. 30) del fornitore come responsabile e modello di voce del registro per lo studio | Documentale |
| PRIV-09 | **DPIA (art. 35)** 🔎: da fare **prima della MS4**, perché il trattamento include registrazione vocale in ambienti di lavoro, AI e geolocalizzazione | cap. 10 |
| PRIV-10 | **Data breach:** procedura di notifica allo studio (titolare) **senza ingiustificato ritardo** — obiettivo contrattuale ≤ 24 ore dalla scoperta — per consentire la notifica al Garante entro 72 ore (art. 33) | Operativo |
| PRIV-11 | **Metadati delle foto:** rimozione del GPS e dei dati del dispositivo nei documenti esterni (NFR-PRIV-03) | FR-M4-05 |
| PRIV-12 | **Geolocalizzazione del sopralluogo** facoltativa, disattivabile a livello di tenant e di utente, con informativa ai lavoratori dello studio (possibili implicazioni ex art. 4 L. 300/1970 sul controllo a distanza dei dipendenti) 🔎 | FR-M4-04 |

### Periodi di conservazione (predefiniti, configurabili dove indicato) 🔎

| Dato | Conservazione predefinita | Configurabile dal tenant |
|------|---------------------------|--------------------------|
| Documenti definitivi (verbali, relazioni, riepiloghi di approvazione) e relativo audit | 10 anni dalla chiusura della commessa | Sì (min 5 anni) |
| Elaborati e versioni approvate | 10 anni dalla chiusura della commessa | Sì |
| Bozze di elaborati mai pubblicate | Fino alla chiusura della commessa + 1 anno | Sì |
| Foto dei sopralluoghi incluse in verbali | Come il verbale | No |
| Foto non incluse in alcun verbale | Chiusura della commessa + 2 anni | Sì |
| Audio grezzo | 90 giorni dopo la finalizzazione del verbale | Sì |
| Trascrizioni e bozze AI | Come il verbale (tracciabilità) | Sì |
| Log di accesso tecnici | 12 mesi | No |
| IP negli audit log (esclusi gli eventi di approvazione) | Troncati dopo 90 giorni | No |
| Account utenti rimossi | Anonimizzati dopo 30 giorni, tranne i riferimenti storici nei documenti | No |
| Dati di un tenant chiuso | Periodo di export di 30 giorni + cancellazione entro 90 giorni (backup compresi, a scadenza del ciclo di backup), salvo diversa istruzione documentata del titolare | — |

## 12.3 Valore probatorio delle approvazioni e delle firme

| Aspetto | Decisione di progetto |
|---------|-----------------------|
| **Natura del sign-off del committente** | Firma elettronica **semplice** (FES) ai sensi del Reg. UE 910/2014 (eIDAS) art. 3 e 25. Ha effetti giuridici e non può essere rifiutata come prova solo perché è elettronica; ai sensi dell'art. 20 c. 1-bis del CAD (D.Lgs. 82/2005) il giudice ne valuta liberamente l'idoneità, in base a sicurezza, integrità e immodificabilità 🔎 |
| **Rafforzamenti adottati** | Legame con un'identità verificata via email (Magic Link + OTP); hash SHA-256 del documento approvato; timestamp del server; IP e user agent; testo esatto della dichiarazione accettata; immutabilità dei record (BR-01, audit append-only); PDF di riepilogo inviato a entrambe le parti |
| **Rafforzamenti futuri (v1.x)** | Marca temporale qualificata (TSA) sull'hash dell'approvazione; FEA/FEQ tramite un prestatore qualificato (QTSP) per approvazioni ad alto valore (es. varianti economiche) |
| **Firma dei professionisti sui documenti** | Beta: firma autografa sulla stampa o firma digitale PAdES esterna con ricaricamento (FR-M5-02). Per il deposito telematico delle pratiche edilizie di solito serve la firma digitale del tecnico: il sistema deve produrre un PDF adatto (PDF/A) e non ostacolarla |

## 12.4 Intelligenza artificiale (Reg. UE 2024/1689 — AI Act) 🔎

| Aspetto | Valutazione / decisione |
|---------|-------------------------|
| **Classificazione del rischio** | Trascrizione e sintesi di note di cantiere per un professionista **non** rientrano nei casi ad alto rischio dell'Allegato III. Sono un uso a rischio limitato o minimo |
| **Ruolo** | Il fornitore della piattaforma integra modelli di terzi (general purpose AI) in un proprio sistema: è **fornitore del sistema di AI** verso gli studi; lo studio è **deployer** |
| **Trasparenza (art. 50)** | In via prudenziale: (a) i contenuti generati sono marcati in interfaccia come "Generato con AI — da verificare"; (b) nel PDF c'è una nota configurabile sull'uso di strumenti automatici (FR-M5-01 p. 13, `Q-15`); (c) si conservano i metadati di generazione (NFR-AI-02) |
| **Supervisione umana** | Garantita per costruzione: nessun testo AI entra in un documento senza la validazione del DL (BR-05) |
| **Alfabetizzazione AI (art. 4)** | Una breve guida in-app per gli utenti dello studio su limiti e corretto uso della strutturazione AI (FR-MT-11) |
| **Legge italiana sull'AI (L. 132/2025)** 🔎 | Verificare gli obblighi per i professionisti intellettuali di informare il cliente sull'uso di sistemi di AI; il sistema dovrebbe mettere a disposizione dello studio un testo informativo per i committenti (`Q-15`) |

## 12.5 Accessibilità 🔎

- Obiettivo di prodotto: WCAG 2.2 AA (NFR-UX-04).
- **European Accessibility Act** (Dir. UE 2019/882, recepita con D.Lgs. 82/2022, in vigore dal 28/06/2025): da valutare se il portale del committente (servizio usato da consumatori) rientri nel perimetro e se si applichino le esenzioni per le microimprese. In ogni caso l'obiettivo WCAG 2.2 AA copre i requisiti tecnici attesi.

## 12.6 Deontologia e riservatezza professionale

- Il Codice deontologico degli architetti P.P.C. impone riservatezza sulle informazioni del cliente: l'isolamento tra tenant (BR-04) e il divieto di accesso silenzioso da parte del fornitore (BR-15) sono requisiti anche deontologici.
- Il white-label **non** deve far apparire la piattaforma come autrice dei documenti: autore e responsabile sono sempre lo studio e il professionista firmatario.

## 12.7 Conservazione documentale

- Il sistema **non** è un sistema di **conservazione a norma** (CAD art. 43–44, Linee guida AgID sulla formazione, gestione e conservazione dei documenti informatici). Offre archiviazione sicura, integrità verificabile (hash) ed esportazione in PDF/A.
- Integrazione con un conservatore accreditato: fuori perimetro (`Q-09`). Lo studio va informato di questo limite nei termini d'uso.

## 12.8 Termini d'uso e contrattualistica (elenco delle cose da preparare) 🔎

1. Termini di servizio SaaS per gli studi (compresa la clausola di responsabilità professionale — BR-07 — e i limiti del motore di calcolo).
2. DPA (art. 28 GDPR) ed elenco dei sub-responsabili.
3. Informativa privacy del fornitore (utenti dello studio).
4. Modello di informativa dello studio per i committenti (portale) e per i presenti in cantiere.
5. Termini d'uso del portale del committente (brevi, con il marchio dello studio).
6. Accordo di Beta con lo studio partner (riservatezza, feedback, uso dei dati di test, assenza di SLA commerciali).
7. Cookie policy (solo cookie tecnici — FR-MT-19).
