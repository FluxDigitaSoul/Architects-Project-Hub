# 1. Inquadramento generale e ambito (Scope)

## 1.1 Obiettivo del documento

### Finalità

L'AFU descrive **cosa** deve fare il sistema, dal punto di vista di chi lo usa, con un livello di dettaglio sufficiente a:

- scomporre il lavoro in ticket di sviluppo tracciabili (ogni ticket fa riferimento a un `FR-*` o `BR-*`);
- progettare i test e i criteri di collaudo (cap. 9) prima di scrivere il codice (approccio test-first);
- allineare committente (studio partner), sviluppo e test su un vocabolario comune (cap. 3);
- fissare cosa è in perimetro per la Beta e cosa è rinviato.

L'AFU **non** descrive nel dettaglio il *come* tecnico: schema fisico del database, API e scelte di implementazione sono materia dei documenti tecnici (ADR, `docs/architecture/`), che devono rimandare agli ID di questo documento. Lo stack deciso dal committente (Angular 20/21, NestJS, database relazionale, AWS) compare come vincolo `V-01..V-04` nel cap. 13. Il cap. 14 propone un'architettura di riferimento **indicativa**, collegata ai requisiti.

### Destinatari

| Destinatario | Uso principale | Capitoli chiave |
|--------------|----------------|-----------------|
| Committente / Studio partner | Validare requisiti, regole normative e casi reali | 1, 3, 4, 5.3, 6, 9, 10 |
| Product owner | Prioritizzare il backlog e gestire lo scope | 1, 5, 10, 13 |
| Sviluppatori | Implementare i requisiti e rispettare le regole | 2, 4, 5, 6, 7, 11 |
| Tester / QA | Scrivere ed eseguire i casi di test | 6, 7, 8, 9 |
| Consulente legale / DPO | Verificare privacy, valore probatorio e responsabilità | 2, 5.2, 5.4, 12 |
| Designer UX/UI | Progettare flussi e schermate | 2, 4, 5, 8 |

### Modalità di aggiornamento

Vedi [README — change control](README.md#modalità-di-aggiornamento-change-control).

---

## 1.2 Visione del prodotto e value proposition

### Il problema

Negli studi di architettura piccoli e medi (1–15 persone) una parte consistente del tempo va in attività **non fatturabili** o fatturabili solo in parte:

| Attività | Come si fa oggi | Costo nascosto |
|----------|-----------------|----------------|
| Revisione degli elaborati con il cliente | Email con PDF allegati, telefonate, screenshot annotati, WhatsApp | Versioni confuse, feedback persi, nessuna prova di cosa è stato approvato e quando |
| Gestione delle modifiche fuori contratto | Richieste informali dopo l'approvazione | Scope creep non fatturato, contenziosi sul compenso |
| Verifica dei rapporti aeroilluminanti | Fogli Excel personali, calcolo a mano, riscrittura nella relazione | Errori di trascrizione, rilavorazioni, rischi sull'asseverazione |
| Verbali di sopralluogo | Appunti e foto sullo smartphone, verbale riscritto in studio a fine giornata | 1–2 ore per sopralluogo, verbali inviati in ritardo, foto non collegate |
| Immagine verso il cliente | Strumenti generici (Drive, WeTransfer) senza il marchio dello studio | Percezione meno professionale, nessuna differenziazione |

### La proposta

Un **Project Hub** con il marchio dello studio (white-label) che accompagna la commessa dalla progettazione al cantiere:

1. **Client portal con Visual Pinning:** il cliente commenta direttamente sulla tavola, lo studio risponde, e l'approvazione formale congela la versione con data, ora e prova digitale.
2. **Motore R.A.I.:** calcolo in tempo reale di rapporti illuminanti e aeranti per vano, con profili normativi configurabili e relazione tecnica pronta per CILA/SCIA.
3. **Diario di cantiere mobile:** foto e nota vocale sul posto; l'AI trascrive e divide il testo in *avanzamento / difformità / disposizioni*; il verbale PDF è pronto prima di lasciare il cantiere.
4. **White-label:** logo, colori, dominio e carta intestata dello studio in ogni schermata, email e documento.

### Posizionamento

| Categoria | Esempi | Relazione con il Project Hub |
|-----------|--------|------------------------------|
| CAD / BIM | AutoCAD, ArchiCAD, Revit, Vectorworks | **Complementare.** Il Project Hub non disegna: riceve gli export (PDF/PNG/JPG) e gestisce ciò che succede *intorno* al disegno |
| Gestionali per studi tecnici | Software di parcellazione, gestione pratiche | **Parzialmente sovrapposto** sul fascicolo di commessa; contabilità e fatturazione restano fuori perimetro |
| Software di contabilità lavori / DL | Giornale dei lavori, computi e SAL | **Parzialmente sovrapposto** sul diario; il Project Hub copre il sopralluogo del DL, non la contabilità lavori |
| Strumenti di revisione generici | Markup su PDF, piattaforme di feedback grafico | **Concorrenti diretti** per il modulo 2, ma senza verticalità normativa né marchio dello studio |
| Calcolatori R.A.I. | Fogli di calcolo, moduli di software tecnici | **Concorrenti diretti** per il modulo 3, ma isolati dal resto della commessa |

**Differenziazione:** integrazione verticale (revisione, normativa e cantiere nello stesso fascicolo) + marchio dello studio + mobile-first in cantiere + AI vocale.

### Obiettivi misurabili della Beta (KPI)

| ID | KPI | Target Beta | Come si misura |
|----|-----|-------------|----------------|
| KPI-01 | Tempo di redazione di un verbale di sopralluogo | ≤ 15 min dalla fine del sopralluogo all'invio (oggi 60–120 min) | Timestamp tra la creazione del sopralluogo e l'invio del PDF |
| KPI-02 | Correzioni manuali alla trascrizione AI | ≤ 20% dei caratteri modificati in media | Distanza di edit tra la bozza AI e il testo finalizzato |
| KPI-03 | Cicli di revisione per tavola | Riduzione misurabile rispetto allo storico dello studio partner | Numero di versioni prima dell'approvazione |
| KPI-04 | Accuratezza del motore R.A.I. | 100% di corrispondenza con i calcoli manuali verificati sui casi reali | Test su almeno 3 progetti reali forniti dal partner |
| KPI-05 | Adozione da parte del cliente finale | ≥ 70% dei committenti invitati accede almeno una volta | Accessi via Magic Link / inviti inviati |
| KPI-06 | Generazione PDF | p95 ≤ 3 s | Telemetria del servizio documentale |
| KPI-07 | Soddisfazione dello studio partner | ≥ 4/5 nel debriefing | Questionario di fine Beta |

---

## 1.3 Perimetro funzionale

### In perimetro (Beta)

| Area | Contenuto | Modulo |
|------|-----------|--------|
| Multi-tenancy e white-label | Profilo studio, logo, palette, sottodominio, CNAME (Should), membri e ruoli | M0 |
| Fascicolo di commessa | Anagrafica commessa e committente, Magic Link, dashboard di avanzamento, archiviazione | M1 |
| Client portal e Visual Pinning | Upload e versionamento degli elaborati, viewer con zoom e pan, pin con thread, risoluzione, sign-off formale | M2 |
| Motore R.A.I. | Vani, aperture, profili normativi, calcolo in tempo reale, quadro riepilogativo del fabbricato | M3 |
| Diario di cantiere mobile | PWA, foto, registrazione vocale, trascrizione e strutturazione AI, revisione, funzionamento offline | M4 |
| Engine documentale | PDF del verbale di sopralluogo, PDF della relazione tecnica R.A.I., PDF del riepilogo di approvazione | M5 |
| Funzioni trasversali | Autenticazione, notifiche email, audit log, ricerca base, impostazioni personali, export dei dati | MT |
| SaaS self-service e servizi FDS | **Beta:** provisioning dei tenant, piani ed entitlements, quote, back-office, accettazione dei termini. **Lancio v1.0:** registrazione libera, trial, Stripe, fatturazione elettronica SDI, coupon, disdetta | M6 |

### Fuori perimetro (fasi successive)

| Area | Motivo del rinvio | Fase indicativa |
|------|-------------------|-----------------|
| Computi metrici estimativi con prezziari regionali | Serve un database dei prezzari aggiornato per regione e anno | v1.x |
| Contabilità dei lavori, SAL, libretto delle misure | Dominio a sé con obblighi normativi specifici (D.Lgs. 36/2023 per i lavori pubblici) | v2 |
| Fatturazione elettronica / integrazione contabile | Integrazione con SDI e gestionali, fuori dal core | v2 |
| Visualizzatore 3D interattivo IFC/BIM | Complessità del viewer e dei formati; nella Beta basta il render statico | v2 |
| Firma elettronica qualificata/avanzata integrata (FEQ/FEA) | Richiede un prestatore di fiducia qualificato (QTSP); nella Beta basta la FES rafforzata | v1.x |
| Fattore di Luce Diurna medio (FLDm ≥ 2%) | Serve un modello di calcolo illuminotecnico; nella Beta si calcola solo il rapporto geometrico | v1.x |
| App native iOS/Android | La PWA copre la Beta; da valutare dopo i test sul campo | v1.x |
| Portale dell'Impresa esecutrice con accesso attivo | Nella Beta l'impresa riceve solo i verbali via email | v1.x |
| Incasso dei pagamenti durante la Beta | Nella Beta non si incassa; il modello dati degli abbonamenti e gli entitlements invece ci sono già (M6) | v1.0 (M6) |
| Sito web portfolio per gli studi | Servizio dell'agenzia FDS, non funzione del prodotto (cap. 15) | — |
| Multilingua dell'interfaccia | Beta solo in italiano; l'architettura deve però essere predisposta (i18n) | v1.x |
| Integrazione con i portali SUE/SUAP dei Comuni | Portali eterogenei, nessuno standard nazionale | Da valutare |
| Calendario e pianificazione del cantiere (Gantt) | Non centrale per la Beta | v1.x |

### Confini di responsabilità (disclaimer funzionale)

- Il sistema **supporta** il professionista, non lo **sostituisce**. Esiti di calcolo e relazioni generate restano sotto la responsabilità del tecnico che li firma e li assevera (vedi `BR-07`, cap. 12).
- Il sistema **non** conserva documenti a norma (conservazione sostitutiva ex D.P.C.M. 3/12/2013 e Linee Guida AgID). Offre archiviazione ed export; la conservazione a norma è fuori perimetro (`Q-09`).
