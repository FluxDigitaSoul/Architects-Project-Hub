# 13. Assunzioni, vincoli, rischi e questioni aperte

## 13.1 Assunzioni

| ID | Assunzione | Se si rivela falsa |
|----|------------|--------------------|
| A-01 | Lo studio partner mette a disposizione almeno 3 progetti reali con verifiche R.A.I. già validate | La MS2 non si può chiudere con il KPI-04; servono casi sintetici validati da un professionista esterno |
| A-02 | Lo studio partner ha almeno 2 cantieri attivi durante la finestra di MS4 | Il test sul campo slitta o si fa su cantieri simulati (meno significativo) |
| A-03 | I committenti del partner hanno un'email personale valida e un dispositivo moderno | Serve un canale alternativo (es. link copiato e inviato via WhatsApp) e il fallback via PDF (EC-24) |
| A-04 | Gli elaborati sono prodotti come PDF/immagini esportati dal CAD, non come file nativi | Serve la conversione DWG/IFC (fuori perimetro) |
| A-05 | Il volume della Beta è contenuto (1–5 tenant, NFR-SCAL) | Serve un dimensionamento anticipato |
| A-06 | La lingua di lavoro è solo l'italiano, inclusi gli audio | Vanno gestiti dialetti marcati e lingue straniere delle maestranze (ASR multilingua) |
| A-07 | Il DL ha uno smartphone aziendale o personale adatto (iOS ≥ 16.4 o Android recente) | Serve una lista di dispositivi supportati e un eventuale fallback |

## 13.2 Vincoli

| ID | Vincolo | Tipo | Impatto |
|----|---------|------|---------|
| V-01 | **Frontend: Angular 20/21** (app dello studio, portale del committente, PWA di cantiere) | Tecnologico — deciso dal committente | Service worker Angular per la PWA; signals e change detection zoneless; SSR non richiesto (applicazioni dietro autenticazione), valutare il prerendering solo per le pagine pubbliche di accesso |
| V-02 | **Backend: NestJS** (Node.js, TypeScript) | Tecnologico — deciso dal committente | Moduli per contesto di dominio; guard per RBAC/ABAC; worker per le code |
| V-03 | **Database relazionale** — raccomandato **PostgreSQL** | Tecnologico — deciso dal committente (relazionale) | Row-Level Security come seconda barriera per l'isolamento (BR-04); tipi `numeric` per i calcoli R.A.I. (BR-22); JSONB per profili e snapshot |
| V-04 | **Infrastruttura AWS**, in regione UE | Tecnologico — deciso dal committente | Vedi cap. 14; attenzione alla disponibilità regionale dei servizi (es. Amazon Transcribe **non** è disponibile in `eu-south-1` Milano) |
| V-05 | **Libreria di calcolo R.A.I. unica in TypeScript**, condivisa da Angular e NestJS in un monorepo | Architetturale (derivato) | Garantisce l'equivalenza tra client e server (FR-M3-10); aritmetica decimale con una libreria dedicata, non `number` |
| V-06 | PWA e non app nativa per la Beta | Di perimetro | Limiti iOS: niente Background Sync, quota di storage limitata, push web solo con app installata (EC-08) |
| V-07 | Dati e trattamenti nell'UE | Normativo | Scelta di regioni e fornitori (NFR-PRIV-01) |
| V-08 | Budget e tempi della Beta (da definire) | Di progetto | Guida la scelta tra Must/Should (`Q-21`) |

## 13.3 Rischi

Scala: Probabilità (B/M/A) × Impatto (B/M/A).

| ID | Rischio | P | I | Mitigazione | Responsabile |
|----|---------|---|---|-------------|--------------|
| R-01 | **Errore normativo nel motore R.A.I.** (regola interpretata male, parametro locale sbagliato) → relazione errata e responsabilità del professionista | M | A | Motore parametrico e trasparente; corpus di regressione con casi reali; workshop normativo; disclaimer (BR-07); errore di calcolo sempre almeno "Critico" | PO + partner |
| R-02 | **Variabilità normativa locale** ingestibile (ogni comune ha regole diverse) | A | M | Profili configurabili dallo studio; catalogo che cresce nel tempo; nella Beta solo il comune del partner | PO |
| R-03 | **Allucinazioni AI** nel verbale (fatti inventati) | M | A | Istruzioni vincolanti, output JSON validato, marcatore `[DA VERIFICARE]`, validazione umana obbligatoria (BR-05), corpus di valutazione, "0 fatti inventati" come criterio di uscita | Lead tecnico |
| R-04 | **Qualità ASR in cantiere** insufficiente (rumore, dialetto) | A | M | Vocabolario personalizzato, consigli di registrazione, riascolto dei segmenti, fallback manuale; valutare più fornitori ASR nel corpus TC-AI | Lead tecnico |
| R-05 | **Perdita di dati offline** su iOS (storage cancellato, app chiusa prima della sincronizzazione) | M | A | Storage persistente, avvisi espliciti, badge "da sincronizzare", sincronizzazione all'apertura, test dedicati in MS4 | Lead tecnico |
| R-06 | **Violazione dell'isolamento tra tenant** | B | A | Difesa in profondità (BR-04), RLS, test automatici su tutti gli endpoint, penetration test | Lead tecnico |
| R-07 | **Contestazione dell'approvazione** del committente ("non sono stato io") | B | M | OTP, hash, log, PDF inviato subito a entrambe le parti; valutare FEA per casi critici (v1.x) | PO + legale |
| R-08 | **Scarsa adozione da parte dei committenti** (non aprono il link, preferiscono WhatsApp) | M | M | Esperienza senza password, mini-tutorial, email chiare con il marchio dello studio, link copiabile; misura KPI-05 | UX |
| R-09 | **Costi AI e storage** superiori alle attese | M | M | Compressione sul dispositivo, eliminazione dell'audio grezzo (PRIV-03), monitoraggio dei costi (NFR-AI-05), quote per piano | PO |
| R-10 | **Prestazioni del viewer** su tablet con tavole enormi | M | M | Tile lato server, caricamento lazy, test con file reali del partner fin dalla MS3 | Lead tecnico |
| R-11 | **Obiettivo PDF ≤ 3 s** mancato con molte foto | M | B | Immagini pre-elaborate all'upload, worker dedicati e sempre attivi, template ottimizzati, test di carico | Lead tecnico |
| R-12 | **Deliverability delle email** (le notifiche finiscono in spam) | M | M | Dominio di invio con SPF/DKIM/DMARC, reputazione monitorata, gestione dei rimbalzi, testi non promozionali | Lead tecnico |
| R-13 | **Scope creep del progetto stesso** durante la Beta | A | M | Perimetro chiaro (cap. 1.3), change control dell'AFU, backlog v1.0 raccolto in debriefing | PO |
| R-14 | **Dipendenza da un singolo fornitore AI** (prezzi, disponibilità, cambi di modello) | M | M | Interfaccia di astrazione (NFR-AI-03), suite di regressione AI | Lead tecnico |

## 13.4 Questioni aperte (decisioni pendenti)

| ID | Questione | Opzioni | Proposta | Chi decide | Entro |
|----|-----------|---------|----------|------------|-------|
| Q-01 | Come presentare l'esito "subordinato ad asseverazione" e quali deroghe abilitare nel profilo nazionale | a) solo D-01 per altezze e superfici; b) anche D-03 (VMC) in via generale; c) solo per profilo locale | a) nel nazionale; D-02/D-03 solo nei profili locali che le prevedono | Studio partner + legale | MS2 |
| Q-02 | Applicare automaticamente la tolleranza del 2% (art. 34-bis) | a) mai; b) come informazione ("rientra nella tolleranza"); c) automaticamente nell'esito | b) informativa, senza cambiare l'esito | Studio partner | MS2 |
| Q-03 | OTP obbligatorio per ogni nuovo dispositivo del committente | a) sempre; b) configurabile dal tenant; c) mai | b), predefinito attivo | PO | MS3 |
| Q-04 | Un Architetto vede tutte le commesse dello studio o solo quelle assegnate? | a) tutte; b) solo le assegnate; c) configurabile | c), predefinito "tutte" per studi piccoli | Studio partner | MS1 |
| Q-05 | Più firmatari: basta uno o servono tutti? | a) uno; b) tutti; c) configurabile per commessa | c), predefinito "uno" | Studio partner + legale | MS3 |
| Q-06 | Immagine della firma nei PDF: ammessa? | a) sì; b) no, solo spazio per la firma autografa/digitale | a) facoltativa, con avviso sul valore nullo come firma | Legale | MS2 |
| Q-07 | Menzione della piattaforma ("Powered by") nel white-label | a) mai; b) solo nel piè di pagina delle email; c) secondo il piano | c) | Business | MS1 |
| Q-08 | Annullamento amministrativo di un'approvazione da parte dello studio | a) non ammesso; b) ammesso con motivazione e tracciamento | b) | Legale | MS3 |
| Q-09 | Integrazione con un conservatore a norma | a) no; b) export compatibile; c) integrazione | a) nella Beta, b) nella v1.x | Business | Debriefing |
| Q-10 | Dati della polizza RC nella relazione | a) sì; b) no | a) facoltativi | Studio partner | MS2 |
| Q-11 | Parametri del profilo del comune del partner (quote, aggetti, sottotetti, prevalenza delle aperture in falda) | — | Workshop normativo | Studio partner | MS2 |
| Q-12 | Conservare anche le foto originali ad alta risoluzione? | a) mai; b) opzione per foto; c) sempre | b) | Studio partner | MS4 |
| Q-13 | Durata massima di una nota vocale | 5 / 10 / 20 minuti | 10 | PO | MS4 |
| Q-14 | Invio via PEC dal sistema | a) no; b) integrazione con un gestore PEC | a) nella Beta | Business | Debriefing |
| Q-15 | Testo e obbligatorietà della nota sull'uso dell'AI nei verbali e verso i committenti (AI Act, L. 132/2025) | — | Testo predefinito attivo, modificabile | Legale | MS4 |
| Q-16 | Testo della formula di asseverazione della relazione R.A.I. | — | Workshop normativo | Studio partner + legale | MS2 |
| Q-17 | Analytics di prodotto nel portale del committente | a) nessuno; b) anonimi senza cookie | a) nella Beta | PO + legale | MS3 |
| Q-18 | Dati in coda sul dispositivo di un membro rimosso | a) si cancellano; b) esportazione locale prima della cancellazione | a) con avviso all'Owner | PO + legale | MS4 |
| Q-19 | Categorie particolari di dati (es. infortuni) nei testi dei verbali | a) avviso in interfaccia; b) nessuna gestione | a) | Legale | MS4 |
| Q-20 | Periodo di conservazione predefinito dell'audio grezzo | 30 / 90 / 365 giorni | 90 | Legale + partner | MS4 |
| Q-21 | Budget, team e data target della Beta | — | — | Business | Subito |
| Q-22 | Scelta dei fornitori ASR/LLM (vedi cap. 14) dopo la valutazione sul corpus TC-AI | Amazon Transcribe + Amazon Bedrock vs alternative | Iniziare con i servizi AWS in regione UE; valutazione comparativa prima della MS4 | Lead tecnico | MS3 |
