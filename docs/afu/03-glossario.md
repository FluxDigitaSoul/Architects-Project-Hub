# 3. Glossario tecnico-normativo e di dominio

Ogni termine ha un **nome canonico** (da usare nell'interfaccia, nel codice e nei ticket) e, dove serve, il **nome tecnico** in inglese usato nel modello dati (cap. 11). In caso di dubbio prevale la definizione di questo glossario.

## 3.1 Organizzazione e piattaforma

| Termine | Nome nel codice | Definizione |
|---------|-----------------|-------------|
| **Tenant / Studio** | `Tenant` | Lo studio di architettura cliente della piattaforma. Unità di isolamento dei dati: ogni dato appartiene a un solo tenant (`BR-04`). |
| **White-label** | `Branding` | Personalizzazione per cui il cliente finale vede il marchio dello studio (logo, colori, dominio, mittente email, carta intestata) e non quello della piattaforma. |
| **Sottodominio** | `Tenant.subdomain` | Indirizzo predefinito del tenant, nella forma `{slug}.{dominio-piattaforma}`. |
| **Dominio personalizzato (CNAME)** | `CustomDomain` | Dominio dello studio (es. `progetti.studiorossi.it`) puntato alla piattaforma con un record DNS CNAME, con certificato TLS gestito dalla piattaforma. |
| **Membro** | `Membership` | Legame tra un utente e un tenant, con un ruolo (Owner, Architetto, Collaboratore). |
| **Licenza / Posto** | `Plan`, `Seat` | Diritto d'uso acquistato dal tenant; il numero di posti limita i membri attivi. |

## 3.2 Commessa e revisione

| Termine | Nome nel codice | Definizione |
|---------|-----------------|-------------|
| **Commessa / Progetto** | `Project` | Unità organizzativa principale: incarico professionale per un committente su un immobile o cantiere. Contiene elaborati, calcoli R.A.I., sopralluoghi e documenti. |
| **Codice commessa** | `Project.code` | Identificativo leggibile, unico nel tenant (es. `2026-014`). Si genera con un pattern configurabile o si inserisce a mano. |
| **Committente** | `ClientContact` | Persona o ente che ha affidato l'incarico. Una commessa può avere più contatti committenti. |
| **Firmatario** | `ClientContact.isSigner` | Contatto committente autorizzato al sign-off formale. |
| **Magic Link** | `AccessToken` | URL con un token ad alta entropia che dà accesso al Client Portal senza password. Personale, revocabile e rigenerabile (`BR-03`). |
| **OTP** | `OtpChallenge` | Codice numerico monouso inviato via email per confermare un'azione vincolante (es. sign-off). |
| **Elaborato** | `Drawing` | Documento grafico di progetto (tavola 2D, render, schema). È il contenitore logico delle sue versioni. |
| **Versione dell'elaborato** | `DrawingVersion` | Singola revisione caricata (`v1`, `v2`, …). Numerazione progressiva e immutabile per elaborato. |
| **Pubblicazione** | `DrawingVersion.publishedAt` | Atto con cui lo studio rende visibile al committente una versione. Prima della pubblicazione la versione è una *bozza*. |
| **Tavola multipagina** | `DrawingPage` | Pagina di un PDF composto da più pagine. I pin si ancorano alla singola pagina. |
| **Visual Pinning** | `Pin` | Marcatura puntuale su una pagina dell'elaborato. Le coordinate sono relative in percentuale (0–100% su X e Y) rispetto al riquadro della pagina, così restano corrette a qualsiasi zoom e risoluzione. |
| **Thread** | `Comment[]` | Sequenza cronologica di commenti agganciati a un pin. |
| **Pin risolto** | `Pin.status = RESOLVED` | Pin la cui richiesta è stata gestita. Resta visibile nello storico. |
| **Sign-off formale** | `Approval` | Approvazione vincolante di una versione da parte di un firmatario. Congela la versione (`BR-01`) e genera un riepilogo di approvazione con prove digitali (timestamp, hash, IP, OTP). |
| **Congelamento (freeze)** | `DrawingVersion.frozenAt` | Stato di immutabilità di una versione approvata: niente nuovi pin né modifiche ai commenti. |
| **Scope creep** | `ChangeRequest.isExtraScope` | Modifiche fuori contratto chieste dal committente dopo il congelamento di una versione. Il sistema le registra come *Richieste di modifica* distinte, così lo studio può quotarle a parte. |
| **Richiesta di modifica** | `ChangeRequest` | Richiesta del committente su un elaborato già approvato. Non è un pin: è un oggetto separato, con valutazione dello studio (in contratto / extra contratto). |

## 3.3 Normativa igienico-sanitaria e R.A.I.

| Termine | Simbolo / Nome nel codice | Definizione |
|---------|---------------------------|-------------|
| **D.M. 5 luglio 1975** | — | Decreto del Ministero della Sanità sui requisiti igienico-sanitari dei locali d'abitazione. **Art. 1:** altezza minima 2,70 m per i locali abitabili e 2,40 m per corridoi, disimpegni, bagni e ripostigli; 2,55 m nei comuni montani sopra i 1000 m s.l.m. **Art. 2:** superfici minime (14 mq per abitante per i primi 4 e 10 mq per ciascuno dei successivi; camera singola 9 mq, doppia 14 mq; soggiorno 14 mq). **Art. 3:** monostanza di almeno 28 mq per una persona e 38 mq per due. **Art. 5:** illuminazione naturale diretta, fattore di luce diurna medio ≥ 2%, superficie finestrata **apribile** ≥ 1/8 della superficie del pavimento. **Art. 6:** ventilazione meccanica centralizzata dove la ventilazione naturale non è possibile. **Art. 7:** bagno con apertura all'esterno o aspirazione meccanica. |
| **R.A.I. — Rapporto aeroilluminante** | `RAI = Sf / Sp` | Rapporto tra la superficie finestrata utile (`Sf`) e la superficie calpestabile del pavimento (`Sp`) del vano. Il sistema lo calcola in **due varianti**: illuminante (`Si/Sp`) e aerante (`Sa/Sp`). |
| **Superficie di pavimento** | `Sp` (mq) | Superficie calpestabile netta del vano, al netto di murature, pilastri, sguinci e soglie. Nelle mansarde, il profilo normativo può escludere le parti sotto un'altezza minima (vedi `FR-M3-05`). |
| **Superficie finestrata** | `Sf` (mq) | Termine generico per la superficie delle aperture ai fini del R.A.I.; si declina in `Si` e `Sa`. |
| **Superficie illuminante** | `Si` (mq) | Superficie trasparente dell'apertura che fa entrare luce naturale. A seconda del profilo si misura "in luce architettonica" o al netto del telaio, esclude la parte sotto una quota dal pavimento (tipicamente 0,60 m) e si corregge per gli aggetti sovrastanti (vedi `FR-M3-09`). |
| **Superficie aerante** | `Sa` (mq) | Parte dell'apertura effettivamente **apribile** per il ricambio d'aria. Può essere minore di `Si` (es. vetrate fisse, anta ribalta, lucernari parzialmente apribili). |
| **Rapporto minimo** | `ratioMin` | Soglia che il rapporto deve raggiungere: 1/8 = 0,125 per lo standard nazionale; valori diversi (es. 1/10, 1/12 per i sottotetti) secondo regolamenti regionali o comunali. |
| **Superficie minima richiesta** | `SfMin = Sp × ratioMin` | Superficie finestrata minima perché il vano sia conforme. |
| **Margine / Deficit** | `delta = Sf − SfMin` | Positivo = margine di conformità; negativo = deficit, espresso in mq. |
| **Profilo normativo** | `RegulationProfile` | Insieme versionato di parametri di calcolo (soglie, esclusioni, coefficienti) che rappresenta una norma: nazionale, regionale o comunale. Ogni vano è verificato con un profilo, di cui si registra la versione. |
| **Destinazione d'uso del vano** | `RoomUse` | Classificazione del vano: *abitabile* (soggiorno, camera, cucina abitabile, studio), *accessorio* (ripostiglio, lavanderia, cabina armadio, disimpegno, corridoio), *servizio* (bagno, WC). Da essa dipende se il R.A.I. è richiesto. |
| **Altezza utile / media** | `Hu`, `Hmedia` (m) | Altezza netta interna del vano. Per soffitti inclinati è l'altezza media ponderata (volume netto / superficie netta). |
| **Apertura verticale** | `OpeningType.VERTICAL` | Finestra o portafinestra su parete. |
| **Apertura zenitale / in falda** | `OpeningType.ROOF` | Finestra in falda (tipo mansarda) o lucernario. Alcuni regolamenti la valutano con coefficienti diversi. |
| **Aggetto** | `Opening.overhangDepth` | Elemento sporgente sopra l'apertura (balcone, gronda, pensilina) che riduce la luce entrante. Tipicamente conta se sporge più di 1,20 m. |
| **Vano cieco** | `Room.isWindowless` | Vano senza aperture verso l'esterno (es. bagno cieco, locale tecnico). È ammesso solo per le destinazioni per cui la norma lo consente, con aspirazione o ventilazione meccanica. |
| **VMC** | `Room.hasMechanicalVentilation` | Ventilazione Meccanica Controllata: impianto che garantisce il ricambio d'aria in modo forzato. |
| **Decreto Salva Casa** | D.L. 69/2024 conv. L. 105/2024 | Ha introdotto nell'art. 24 del DPR 380/2001 i commi 5-bis e seguenti: il progettista può asseverare la conformità igienico-sanitaria con altezza interna fino a **2,40 m** (invece di 2,70) e monostanza di **20 mq** per una persona e **28 mq** per due, **solo** per interventi di recupero edilizio che migliorano le condizioni igienico-sanitarie, oppure con un progetto contestuale di ristrutturazione che preveda soluzioni alternative (maggiori superfici, ventilazione naturale favorita da finestre e riscontri d'aria, mezzi di ventilazione naturale ausiliari). **Non modifica** il rapporto 1/8 dell'art. 5 del D.M. 1975. Linee di indirizzo MIT pubblicate a gennaio 2025. |
| **Tolleranze costruttive** | — | Art. 34-bis DPR 380/2001, come modificato dal Salva Casa. Le linee di indirizzo MIT chiariscono che per i requisiti igienico-sanitari la tolleranza ammessa è del **2%**. Il sistema **non** la applica in automatico (`BR-02`, `Q-02`). |
| **Asseverazione** | `Attestation` | Dichiarazione del tecnico abilitato, sotto la propria responsabilità (anche penale, art. 481 c.p. e art. 19 L. 241/1990), sulla conformità del progetto alla normativa. |
| **FLDm** | — | Fattore di Luce Diurna medio: rapporto percentuale tra l'illuminamento interno medio e quello esterno a cielo coperto. Il D.M. 1975 richiede ≥ 2%. **Fuori perimetro per la Beta** (solo rapporto geometrico). |
| **CILA / SCIA / PdC** | — | Titoli edilizi: Comunicazione Inizio Lavori Asseverata, Segnalazione Certificata di Inizio Attività, Permesso di Costruire. La relazione R.A.I. è un allegato tipico. |
| **SCA** | — | Segnalazione Certificata di Agibilità (art. 24 DPR 380/2001). Il caso in cui opera la deroga Salva Casa. |

## 3.4 Cantiere e documenti

| Termine | Nome nel codice | Definizione |
|---------|-----------------|-------------|
| **Direttore dei Lavori (DL)** | `ProjectAssignment.isSiteDirector` | Tecnico incaricato di vigilare sulla corretta esecuzione delle opere in conformità al progetto. Nel sistema è un attributo dell'assegnazione di un Architetto a una commessa. |
| **Sopralluogo** | `SiteVisit` | Visita in cantiere in una data, con partecipanti, foto, note vocali e testo strutturato. Produce un verbale. |
| **Verbale di sopralluogo** | `SiteVisitReport` | Documento redatto dal DL che attesta lo stato dei lavori, le difformità e le disposizioni impartite. Si firma e si invia a committente e impresa. *Nota:* la traccia lo chiama "asseverato", ma il verbale di sopralluogo non è tecnicamente un'asseverazione; è un documento sottoscritto dal DL con valore di prova dei fatti constatati. |
| **Avanzamento lavori** | `ReportSection.PROGRESS` | Blocco 1 del verbale: lavorazioni eseguite e in corso. |
| **Difformità / Non conformità** | `ReportSection.ISSUES` | Blocco 2 del verbale: difformità rispetto al progetto, vizi, rischi, sospensioni o fermi del cantiere. |
| **Disposizioni / Ordini di servizio** | `ReportSection.ORDERS` | Blocco 3 del verbale: istruzioni impartite all'impresa, con eventuale termine di esecuzione. |
| **Nota vocale** | `AudioNote` | Registrazione audio fatta in cantiere e collegata a un sopralluogo. |
| **Trascrizione** | `Transcript` | Testo ottenuto dall'audio con riconoscimento vocale (ASR). |
| **Normalizzazione AI** | `StructuredDraft` | Rielaborazione della trascrizione con un modello linguistico: corregge la forma, uniforma la terminologia tecnica e divide il testo nei tre blocchi. Il risultato è sempre una **bozza** da validare (`BR-05`). |
| **Finalizzazione** | `SiteVisitReport.finalizedAt` | Atto con cui il DL conferma il testo e genera il PDF definitivo. Da quel momento il verbale è immutabile (`BR-09`). |
| **PWA** | — | Progressive Web App: applicazione web installabile sulla schermata home, con funzionamento offline parziale grazie a service worker e archiviazione locale. |
| **Coda offline** | `OfflineQueue` | Elenco locale (sul dispositivo) di operazioni e file non ancora inviati al server per mancanza di rete. |

## 3.5 Termini tecnici trasversali

| Termine | Definizione |
|---------|-------------|
| **URL firmato (presigned URL)** | Link temporaneo a un file privato, valido per pochi minuti, generato dal server dopo il controllo dei permessi. |
| **Hash del documento** | Impronta crittografica (SHA-256) del file, usata per dimostrare che un documento non è stato modificato dopo l'approvazione o la firma. |
| **Audit log** | Registro immutabile (append-only) di chi ha fatto cosa, quando e da dove. |
| **Soft delete / Archiviazione** | Rimozione logica: il dato scompare dalle viste ordinarie ma resta recuperabile e tracciato. |
| **Idempotenza** | Proprietà per cui ripetere la stessa operazione (es. un upload ritentato dalla coda offline) non produce duplicati. |
