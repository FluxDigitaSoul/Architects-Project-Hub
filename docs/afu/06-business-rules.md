# 6. Catalogo delle regole di business (Business Rules)

Regole **tassative**: il sistema le applica **lato server**, indipendentemente dall'interfaccia. Ogni regola ha almeno un caso di test negativo nella RTM (cap. 9).

| Campo | Significato |
|-------|-------------|
| **Enunciato** | La regola in forma normativa |
| **Razionale** | Perché esiste |
| **Applicazione** | Dove e come la fa rispettare il sistema |
| **Eccezioni** | Casi esplicitamente ammessi |
| **Errore** | Codice e messaggio in caso di violazione |

---

### BR-01 — Immutabilità dopo l'approvazione

- **Enunciato:** quando una versione di elaborato è marcata "Approvata" dal committente, non si possono più aggiungere pin, commenti o richieste di risoluzione e non si possono modificare o ritirare pin e commenti esistenti su quella versione. Il file della versione non si può sostituire né eliminare.
- **Estensione (più firmatari):** i nuovi pin sono bloccati già dalla **prima** approvazione parziale.
- **Razionale:** valore probatorio dell'approvazione e base per distinguere le modifiche fuori contratto (scope creep).
- **Applicazione:** controllo nel servizio che gestisce pin e commenti, basato sullo stato della versione; vincolo a livello di database sui record collegati a versioni congelate (`frozenAt IS NOT NULL`).
- **Eccezioni:** nessuna. Le richieste successive passano dalle *Richieste di modifica* (FR-M2-17) o da una nuova versione.
- **Errore:** `409 VERSION_FROZEN` — "Questa versione è stata approvata il {data}. Per nuove richieste usa 'Richiedi una modifica'."

### BR-02 — Soglia minima R.A.I.

- **Enunciato:** un vano soggetto a R.A.I. è **Non Conforme** se `Sa_tot < Sp_c × ratioAerMin` **oppure** (se la verifica illuminante è attiva nel profilo) `Si_tot < Sp_c × ratioIllMin`, salvo una deroga ammessa dal profilo, attivata e motivata (BR-06). Con il profilo nazionale `ratioAerMin = ratioIllMin = 1/8`.
- **Razionale:** art. 5 D.M. 5/7/1975 e regolamenti locali.
- **Applicazione:** motore di calcolo condiviso (FR-M3-08); il risultato del server fa fede.
- **Eccezioni:** i vani non soggetti (accessori e servizi) seguono le regole di ventilazione (FR-M3-13). Le tolleranze costruttive (art. 34-bis DPR 380/2001) **non** si applicano in automatico (`Q-02`).
- **Errore:** non è un errore bloccante: produce l'esito "Non conforme" e impedisce la relazione asseverativa (BR-06).

### BR-03 — Validità e revoca del Magic Link

- **Enunciato:** il token di accesso del committente resta valido per la durata della commessa (finché è Attiva o Sospesa, più il periodo di grazia dopo la Chiusura), salvo revoca. Lo studio può revocarlo o rigenerarlo in qualsiasi momento; un token revocato non torna mai valido.
- **Razionale:** esperienza senza attriti per un utente occasionale, bilanciata da revocabilità e mitigazioni (OTP per le azioni vincolanti e i nuovi dispositivi).
- **Applicazione:** verifica di token (hash) e stato a ogni scambio del token con una sessione; sessioni collegate al token e revocate a cascata.
- **Eccezioni:** i link self-service (FR-M1-05 p.7) durano 24 ore.
- **Errore:** pagina neutra "Link non più valido" (FR-M1-06).

### BR-04 — Isolamento dei dati (multi-tenancy assoluto)

- **Enunciato:** nessun utente di un tenant può vedere, cercare, elencare, scaricare o modificare dati o file di un altro tenant, né dedurne l'esistenza. Vale per API, ricerca, file, URL firmati, notifiche, esportazioni, job asincroni, log e cache.
- **Razionale:** riservatezza professionale, GDPR, requisito commerciale fondamentale.
- **Applicazione (difesa in profondità):**
  1. il tenant si ricava **solo** dalla sessione autenticata o dal token, mai da input del client;
  2. filtro obbligatorio per tenant a livello di accesso ai dati, più **Row-Level Security** a livello di database come seconda barriera (`V-03`);
  3. prefisso per tenant nei percorsi dello storage dei file e URL firmati generati solo dopo il controllo;
  4. chiavi di cache e messaggi delle code che includono il tenant;
  5. test automatici di isolamento cross-tenant su ogni endpoint (`TC-SEC-01`).
- **Eccezioni:** il Platform Admin vede metadati aggregati; accede ai contenuti solo con una sessione di supporto (FR-MT-14).
- **Errore:** `404 NOT_FOUND` (mai 403, per non confermare l'esistenza) + evento di sicurezza nell'audit log.

### BR-05 — Validazione umana obbligatoria dei contenuti AI

- **Enunciato:** nessun testo generato dall'AI entra in un documento definitivo senza la revisione e la conferma esplicita del DL. Le voci con marcatore `[DA VERIFICARE]` bloccano la finalizzazione.
- **Razionale:** responsabilità professionale, affidabilità, trasparenza (AI Act).
- **Applicazione:** stato "Da revisionare" obbligatorio prima di "Finalizzato"; controllo lato server sull'assenza dei marcatori.
- **Errore:** `422 AI_REVIEW_PENDING`.

### BR-06 — Condizioni per la relazione asseverativa R.A.I.

- **Enunciato:** la relazione **asseverativa** si genera solo se ogni vano soggetto delle unità incluse è *Conforme* o *Conformità subordinata ad asseverazione* (con deroga ammessa dal profilo, motivazione ≥ 50 caratteri e riferimento normativo) e se il firmatario ha un'iscrizione all'albo valida (BR-08). Altrimenti si genera solo il *Report di verifica*.
- **Nota:** la sola presenza di VMC **non** basta a coprire un deficit R.A.I. (FR-M3-12).
- **Errore:** `422 RAI_NOT_ATTESTABLE` con l'elenco dei vani bloccanti.

### BR-07 — Responsabilità professionale

- **Enunciato:** tutti i documenti asseverativi e i verbali riportano che il contenuto è sotto la responsabilità del professionista firmatario. Il sistema non rilascia asseverazioni in proprio. L'accettazione dei termini d'uso da parte del tenant include questa clausola.
- **Applicazione:** testo nei termini d'uso, informativa nel modulo R.A.I., formule dei documenti.

### BR-08 — Firmatari abilitati

- **Enunciato:** relazioni R.A.I. asseverative e verbali di sopralluogo definitivi si firmano solo da un utente Owner o Architetto con ordine professionale e numero di iscrizione compilati. Per i verbali, il firmatario deve essere il DL della commessa.
- **Errore:** `422 SIGNER_NOT_QUALIFIED`.

### BR-09 — Immutabilità dei documenti definitivi

- **Enunciato:** verbali finalizzati, relazioni definitive e riepiloghi di approvazione non si modificano né si eliminano. Si possono solo **annullare** con motivazione (ruolo Owner o DL), e restano in archivio con filigrana. Le foto e gli audio inclusi in un verbale finalizzato non si eliminano finché il verbale esiste.
- **Errore:** `409 REPORT_FINALIZED`.

### BR-10 — Condizioni del sign-off

- **Enunciato:** il sign-off è ammesso solo per: contatto committente con flag firmatario e token attivo; versione Pubblicata e ultima pubblicata dell'elaborato; commessa Attiva; OTP verificato nei 10 minuti precedenti. Con pin aperti il sign-off è ammesso **solo** dopo aver mostrato l'avviso e registrato la presa visione.
- **Errore:** `403 NOT_SIGNER`, `409 VERSION_NOT_CURRENT`, `409 PROJECT_NOT_ACTIVE`, `401 OTP_REQUIRED`.

### BR-11 — Riapertura dei pin

- **Enunciato:** un pin Risolto si può riaprire dal suo autore committente o dallo studio, solo se la versione non è Approvata né Superata. Riaprire richiede un commento.

### BR-12 — Almeno un Owner

- **Enunciato:** ogni tenant attivo ha almeno un Owner attivo. Non si può declassare, sospendere o rimuovere l'ultimo Owner.
- **Errore:** `409 LAST_OWNER`.

### BR-13 — Conservazione ed eliminazione

- **Enunciato:** l'eliminazione definitiva di commesse, tenant o dati personali rispetta i periodi di conservazione del cap. 12. I documenti definitivi (verbali, relazioni, approvazioni) e il relativo audit si conservano per il periodo minimo configurato (predefinito **10 anni** dalla chiusura della commessa), salvo esportazione e rinuncia esplicita del titolare del trattamento (lo studio), registrata.
- **Razionale:** tutela probatoria dello studio (responsabilità decennale dell'appaltatore ex art. 1669 c.c., prescrizione ordinaria decennale ex art. 2946 c.c.) e bilanciamento con la minimizzazione GDPR.

### BR-14 — Tracciabilità delle modifiche ai commenti

- **Enunciato:** la modifica di un commento è possibile solo all'autore, entro 15 minuti e senza risposte successive; il testo precedente si conserva in cronologia e il commento mostra "modificato".

### BR-15 — Nessun accesso silenzioso ai contenuti

- **Enunciato:** nessun operatore della piattaforma accede ai contenuti di un tenant senza una sessione di supporto autorizzata e registrata (FR-MT-14), salvo obblighi di legge (es. richiesta dell'autorità giudiziaria), da documentare.

### BR-16 — Numerazione progressiva dei verbali

- **Enunciato:** i verbali di una commessa hanno una numerazione progressiva senza buchi, assegnata dal server in modo atomico. Un verbale annullato mantiene il suo numero.

### BR-17 — Un solo DL attivo per commessa

- **Enunciato:** in ogni momento al massimo un membro ha il ruolo di DL su una commessa. Il cambio di DL resta nello storico, con la data di decorrenza.

### BR-18 — Numerazione delle versioni degli elaborati

- **Enunciato:** le versioni sono progressive per elaborato, senza riuso dei numeri, anche per le bozze eliminate.

### BR-19 — Nessuna approvazione tacita

- **Enunciato:** la scadenza di una revisione, l'inattività del committente o la chiusura della commessa non producono **mai** un'approvazione automatica.

### BR-20 — Coordinate normalizzate

- **Enunciato:** le posizioni dei pin si salvano solo in coordinate percentuali [0,100] relative alla pagina nel suo orientamento nativo; il server rifiuta valori fuori intervallo o riferiti a pagine inesistenti.

### BR-21 — Riproducibilità dei calcoli

- **Enunciato:** ogni esito R.A.I. salvato in una relazione è associato alla versione del profilo e allo snapshot degli input; le versioni dei profili usate da documenti definitivi sono immutabili.

### BR-22 — Aritmetica e arrotondamenti

- **Enunciato:** i calcoli normativi usano aritmetica decimale esatta, con almeno 6 decimali interni. I confronti con le soglie si fanno sui valori **non arrotondati**. La visualizzazione arrotonda a 2 decimali (half-up). Gli input dimensionali accettano al massimo 3 decimali (millimetro).

### BR-23 — Completezza della sincronizzazione prima della finalizzazione

- **Enunciato:** un sopralluogo si finalizza solo se il server ha ricevuto tutti gli elementi che l'utente vuole includere (foto e audio). Se ci sono elementi ancora in coda sul dispositivo, la finalizzazione si blocca e mostra l'elenco.

### BR-24 — Idempotenza e non perdita dei dati di campo

- **Enunciato:** ogni operazione dalla coda offline porta un identificativo univoco generato dal client; il server applica ogni identificativo una sola volta. Il client rimuove un elemento dalla coda solo dopo la conferma del server.

### BR-26 — Provisioning atomico del tenant

- **Enunciato:** la creazione di un tenant (self-service o dal back-office) crea in un'unica operazione atomica tenant, membership Owner, branding predefinito, profilo normativo predefinito, abbonamento (trial o piano assegnato) e progetto demo. Se un passo fallisce, non resta nessun dato parziale e l'operazione si può ripetere in modo idempotente.
- **Errore:** `500 PROVISIONING_FAILED` con id di correlazione; nessun tenant visibile.

### BR-27 — Dati dei trial non convertiti

- **Enunciato:** un tenant in trial scaduto senza abbonamento resta in sola lettura; i suoi dati si cancellano 90 giorni dopo la scadenza, con avvisi all'Owner a 30 e 7 giorni. Un'estensione del trial o l'attivazione di un piano interrompono il conteggio.

### BR-28 — Entitlements centralizzati

- **Enunciato:** ogni verifica di limite o funzione a pagamento passa dal servizio `entitlements`, lato server, sulla base di piano sottoscritto (con la sua versione) + override attivi. Nessun modulo decide da solo cosa è incluso in un piano; l'interfaccia riflette le decisioni del server.
- **Errore:** `402 PLAN_LIMIT_REACHED` (limite numerico) o `403 FEATURE_NOT_IN_PLAN` (funzione), con il diritto coinvolto e il piano consigliato.

### BR-29 — Limiti non distruttivi

- **Enunciato:** superare un limite di piano, un trial scaduto o un abbonamento non pagato bloccano solo le **nuove creazioni**. Non bloccano mai la consultazione, l'esportazione dei dati, il completamento di operazioni già iniziate (sincronizzazione di un sopralluogo, finalizzazione di un verbale già in revisione) né l'accesso in lettura dei committenti nel periodo di grazia. Nessun dato si cancella per effetto di un downgrade.

### BR-30 — Fonte di verità dei pagamenti

- **Enunciato:** lo stato dell'abbonamento si modifica solo in seguito a eventi del provider di pagamento con firma verificata, elaborati in modo idempotente (id dell'evento), o ad azioni manuali del Platform Admin tracciate nell'audit. Il client non può mai impostare direttamente piano o stato di pagamento.

### BR-25 — Visibilità per il committente

- **Enunciato:** il committente vede solo: elaborati pubblicati della propria commessa, i pin e i commenti su quegli elaborati, i documenti condivisi in modo esplicito, i dati anagrafici pubblici della commessa. Non vede mai: bozze, note interne, calcoli R.A.I. non condivisi, sopralluoghi non condivisi, dati di altri committenti oltre al nome (es. email e telefono degli altri contatti).
