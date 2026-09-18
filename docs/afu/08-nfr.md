# 8. Requisiti non funzionali (NFR)

Ogni NFR è **misurabile** e ha un metodo di verifica. I valori "p95" si misurano in produzione (telemetria) e in un ambiente di staging con dati realistici.

## 8.1 Usabilità e responsive design (UX)

| ID | Requisito | Target | Verifica |
|----|-----------|--------|----------|
| NFR-UX-01 | App dello studio ottimizzata per desktop | Da 1280 px di larghezza; utilizzabile da 1024 px | Test manuale su una matrice di risoluzioni |
| NFR-UX-02 | Portale del committente responsive | Target primario tablet (768–1366 px) e desktop; smartphone da 360 px per consultazione, commento e approvazione | Test su dispositivi reali (iPad, tablet Android, iPhone, smartphone Android) |
| NFR-UX-03 | Diario di cantiere ottimizzato per smartphone | Viewport 360–430 px; azioni primarie raggiungibili con il pollice; target ≥ 48 px | Test sul campo (Milestone 4) + checklist di ergonomia |
| NFR-UX-04 | Accessibilità | **WCAG 2.2 livello AA** per app dello studio e portale; navigazione completa da tastiera nel viewer (pin compresi); lettori di schermo supportati | Audit automatico (axe) in CI + audit manuale prima della Beta |
| NFR-UX-05 | Il colore non è l'unico veicolo di informazione | Esiti e stati sempre con testo o icona oltre al colore | Revisione UI |
| NFR-UX-06 | Apprendibilità per il committente | Un committente mai formato completa "apri tavola → commenta → approva" in ≤ 5 minuti senza aiuto | Test di usabilità con ≥ 5 utenti non tecnici |
| NFR-UX-07 | Apprendibilità per lo studio | Un architetto crea una commessa, pubblica una tavola e fa un sopralluogo completo dopo ≤ 30 minuti di onboarding | Sessione di onboarding con lo studio partner |
| NFR-UX-08 | Lingua | Interfaccia, email e documenti in italiano corretto e coerente con il glossario (cap. 3) | Revisione dei testi |

## 8.2 Prestazioni (PERF)

| ID | Requisito | Target | Condizioni |
|----|-----------|--------|------------|
| NFR-PERF-01 | Generazione dei PDF definitivi | **p95 ≤ 3 s**, p99 ≤ 6 s | Verbale fino a 30 foto; relazione R.A.I. fino a 60 vani. Misurato dalla richiesta al PDF disponibile. Le immagini sono pre-elaborate all'upload (FR-M4-05), non durante la generazione |
| NFR-PERF-02 | Prima visualizzazione di una tavola nel viewer | p95 ≤ 2 s su 4G (10 Mbps, RTT 70 ms); ≤ 1 s su fibra | Anteprima progressiva |
| NFR-PERF-03 | Tempo di caricamento iniziale delle applicazioni | LCP ≤ 2,5 s; INP ≤ 200 ms; CLS ≤ 0,1 (Core Web Vitals, 75° percentile) | Portale del committente e PWA di cantiere su un dispositivo mobile di fascia media |
| NFR-PERF-04 | Elaborazione degli elaborati caricati | 1 pagina A0 vettoriale ≤ 20 s; 50 pagine ≤ 2 min | Asincrona |
| NFR-PERF-05 | Ricalcolo R.A.I. in tempo reale | ≤ 100 ms dall'input al badge aggiornato | Unità con 30 vani, dispositivo desktop di riferimento |
| NFR-PERF-06 | Trascrizione e strutturazione AI | p95 ≤ 90 s dalla sincronizzazione dell'audio alla bozza pronta, per 5 minuti di audio | Dipende dal fornitore; da monitorare |
| NFR-PERF-07 | Risposta delle API | p95 ≤ 300 ms per letture, ≤ 800 ms per scritture (escluse elaborazioni asincrone) | Carico nominale |
| NFR-PERF-08 | Branding senza impatto sulle prestazioni | Applicare i token di colore e caricare il logo non aggiunge più di **50 ms** all'LCP e non richiede build o deploy; CSS del tenant ≤ 5 KB, in cache | Confronto tra tenant con e senza branding |
| NFR-PERF-09 | Peso della PWA di cantiere | Bundle iniziale JS ≤ 300 KB compressi | Budget di build in CI |

## 8.3 Capacità e scalabilità (SCAL)

| ID | Requisito | Target Beta | Target v1.0 (indicativo) |
|----|-----------|-------------|--------------------------|
| NFR-SCAL-01 | Tenant | 1–5 | 500 |
| NFR-SCAL-02 | Utenti contemporanei | 50 | 2.000 |
| NFR-SCAL-03 | Commesse per tenant | 500 | 10.000 |
| NFR-SCAL-04 | Storage per tenant | 100 GB | Secondo il piano |
| NFR-SCAL-05 | Minuti di audio al mese per tenant | 1.000 | Secondo il piano |
| NFR-SCAL-06 | Scalabilità orizzontale | Servizi applicativi senza stato; elaborazioni pesanti (PDF, tile, AI) in code con worker scalabili separatamente | — |

## 8.4 Disponibilità, continuità e ripristino (AVAIL)

| ID | Requisito | Target |
|----|-----------|--------|
| NFR-AVAIL-01 | Disponibilità mensile (Beta) | ≥ 99,5% esclusa la manutenzione programmata (annunciata con ≥ 48 ore di anticipo, fuori orario lavorativo) |
| NFR-AVAIL-02 | RPO (perdita massima di dati) | ≤ 15 minuti per il database; 0 per i file già confermati (storage a oggetti con versioning) |
| NFR-AVAIL-03 | RTO (tempo di ripristino) | ≤ 4 ore |
| NFR-AVAIL-04 | Backup | Database: backup automatici giornalieri + point-in-time recovery 14 giorni; copia cifrata in una seconda regione UE. File: versioning + replica in un'altra regione UE (Should in Beta) |
| NFR-AVAIL-05 | Test di ripristino | Almeno uno prima dell'avvio della Beta, poi trimestrale, con verbale |
| NFR-AVAIL-06 | Degrado controllato | Se AI, email o servizio PDF non sono disponibili, il resto del sistema funziona e le operazioni restano in coda (EC-04, EC-23) |

## 8.5 Sicurezza (SEC)

| ID | Requisito |
|----|-----------|
| NFR-SEC-01 | **Cifratura in transito:** TLS 1.2+ (preferito 1.3) ovunque; HSTS con `includeSubDomains` sui domini della piattaforma |
| NFR-SEC-02 | **Cifratura a riposo:** database, backup e storage dei file cifrati (AES-256) con chiavi gestite da un servizio KMS |
| NFR-SEC-03 | **Storage dei file privato:** nessun file raggiungibile pubblicamente; accesso solo tramite URL firmati |
| NFR-SEC-04 | **URL firmati:** durata ≤ 5 minuti per i download dell'interfaccia, ≤ 7 giorni solo per i link di invio dei documenti (FR-M5-05), sempre generati dopo il controllo dei permessi e legati a un singolo oggetto |
| NFR-SEC-05 | **Rate limiting:** su login, OTP, accesso con Magic Link, richiesta di un nuovo link e upload, per IP e per identità, con blocchi progressivi |
| NFR-SEC-06 | **Conformità OWASP:** OWASP ASVS livello 2 come riferimento; nessuna vulnerabilità OWASP Top 10 aperta di gravità alta o critica al rilascio |
| NFR-SEC-07 | **Prevenzione XSS/injection:** tutto il contenuto utente è codificato in output; Content-Security-Policy rigorosa (niente `unsafe-inline` per gli script); query al database solo parametrizzate |
| NFR-SEC-08 | **Upload sicuri:** verifica del tipo reale, limiti di dimensione, scansione antimalware, elaborazione dei file in un ambiente isolato |
| NFR-SEC-09 | **SVG:** sanificazione lato server (FR-M0-03) e servizio con `Content-Type` corretto e `Content-Disposition` adeguato |
| NFR-SEC-10 | **Errori:** nessuna informazione interna (stack trace, query, percorsi) nelle risposte al client |
| NFR-SEC-11 | **Secret:** nessuna credenziale nel codice o nel repository; secret in un secret manager con rotazione |
| NFR-SEC-12 | **Header di sicurezza:** CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` sulle pagine con token), `Permissions-Policy` minimale (microfono e fotocamera solo nella PWA di cantiere), `frame-ancestors 'none'` |
| NFR-SEC-13 | **CSRF:** cookie `SameSite` + token anti-CSRF per le operazioni di scrittura con autenticazione a cookie |
| NFR-SEC-14 | **Dipendenze:** scansione automatica delle vulnerabilità nelle dipendenze in CI; nessuna dipendenza con vulnerabilità critiche note al rilascio |
| NFR-SEC-15 | **Penetration test:** almeno un test indipendente (anche limitato) prima dell'apertura a studi esterni al partner |
| NFR-SEC-16 | **Log di sicurezza:** eventi di sicurezza (accessi falliti, violazioni di BR-04, blocchi OTP) con allarme verso il team |
| NFR-SEC-17 | **Principio del privilegio minimo nell'infrastruttura:** ruoli IAM distinti per servizio; nessun accesso diretto al database di produzione senza procedura tracciata |

## 8.6 Privacy (PRIV)

Vedi il dettaglio al cap. 12.

| ID | Requisito |
|----|-----------|
| NFR-PRIV-01 | Dati trattati e conservati **nello Spazio Economico Europeo**; eventuali sub-responsabili extra-SEE solo con garanzie adeguate (clausole contrattuali standard / Data Privacy Framework) e dopo informativa allo studio |
| NFR-PRIV-02 | Il fornitore AI non usa i dati (audio, trascrizioni, testi) per addestrare modelli; conservazione presso il fornitore minima o nulla |
| NFR-PRIV-03 | Metadati EXIF (GPS, modello del dispositivo) rimossi dalle foto nei documenti e nei download destinati a terzi |
| NFR-PRIV-04 | Minimizzazione: dal committente si raccolgono solo i dati necessari (nome, email; il resto è facoltativo) |
| NFR-PRIV-05 | Troncamento o pseudonimizzazione degli IP negli audit log dopo 90 giorni, tranne gli eventi di approvazione (conservati per il valore probatorio) |

## 8.7 Compatibilità (COMP)

| ID | Requisito |
|----|-----------|
| NFR-COMP-01 | Browser desktop: Chrome, Edge, Firefox (ultime 2 versioni principali), Safari ≥ 16.4 |
| NFR-COMP-02 | Mobile: iOS Safari ≥ 16.4 (PWA installabile e notifiche push web da 16.4), Android Chrome ultime 2 versioni principali |
| NFR-COMP-03 | Formati audio: registrazione con i codec nativi (AAC/MP4 su iOS, Opus/WebM su Android) e normalizzazione lato server prima dell'ASR |
| NFR-COMP-04 | Email: rendering corretto sui client più diffusi (Gmail, Outlook desktop e web, Apple Mail, client mobili) |
| NFR-COMP-05 | PDF generati apribili senza errori con Adobe Acrobat Reader, anteprima macOS/iOS, Chrome, Edge |

## 8.8 AI (AI)

| ID | Requisito |
|----|-----------|
| NFR-AI-01 | **Qualità della strutturazione:** su un corpus di ≥ 30 registrazioni reali o realistiche di cantiere, ≥ 90% delle voci classificate nel blocco giusto e **0 fatti inventati** (allucinazioni) in un campione verificato a mano |
| NFR-AI-02 | **Tracciabilità:** prompt versionati nel repository; per ogni elaborazione si salvano modello, versione del prompt, parametri, input e output |
| NFR-AI-03 | **Sostituibilità del fornitore:** i servizi ASR e LLM stanno dietro un'interfaccia interna, così si possono cambiare senza modificare il dominio |
| NFR-AI-04 | **Regressione:** ogni modifica a prompt o modello passa da una suite di valutazione automatica sul corpus di riferimento prima del rilascio |
| NFR-AI-05 | **Costi:** costo AI per sopralluogo monitorato; allarme se supera la soglia definita per il piano |

## 8.9 Osservabilità e manutenibilità (OBS/MAINT)

| ID | Requisito |
|----|-----------|
| NFR-OBS-01 | Log strutturati (JSON) con id di correlazione della richiesta propagato tra frontend, API e worker; **nessun dato personale o contenuto di progetto nei log applicativi** |
| NFR-OBS-02 | Metriche: latenze per endpoint, tempi di coda, esito dei job, errori per tenant, tempi di generazione dei PDF |
| NFR-OBS-03 | Tracciamento degli errori del frontend (anche offline, con invio differito) con rimozione dei dati personali |
| NFR-OBS-04 | Allarmi su: disponibilità, tasso d'errore > 2%, coda AI > 30 minuti, fallimenti di generazione PDF, scadenza dei certificati |
| NFR-MAINT-01 | Copertura dei test ≥ 80% (unit + integration) sui moduli di dominio; **100%** dei casi del motore R.A.I. e delle business rules coperti da test automatici |
| NFR-MAINT-02 | Test end-to-end automatici sui flussi critici: P-01 (pubblicazione → pin → approvazione), P-02 (vano → esito → relazione), P-03 (sopralluogo offline → sincronizzazione → finalizzazione) |
| NFR-MAINT-03 | Infrastruttura come codice; ambienti riproducibili (sviluppo, staging, produzione) |
| NFR-MAINT-04 | Migrazioni del database versionate e reversibili (o con piano di rollback) |
| NFR-MAINT-05 | API documentate con specifica OpenAPI generata dal codice |

## 8.10 Flessibilità del brand (BRAND)

| ID | Requisito |
|----|-----------|
| NFR-BRAND-01 | Nessuna modifica di codice né deploy per aggiungere o cambiare il branding di un tenant |
| NFR-BRAND-02 | Nessun riferimento visibile alla piattaforma nel portale del committente, nelle email e nei PDF, salvo quanto previsto da `Q-07` |
| NFR-BRAND-03 | Branding isolato per tenant: nessun "flash" del brand di default o di un altro tenant al caricamento (il tenant si risolve **prima** del primo paint, dal dominio) |
