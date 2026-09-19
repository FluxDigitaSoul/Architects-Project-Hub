# 15. Modello di business SaaS

> Questo capitolo registra la **visione commerciale** a cui lo sviluppo deve allinearsi. Le scelte di prodotto che ne derivano sono nel [Modulo 6](05-m6-saas-billing.md). I numeri sono **ipotesi di lavoro** da validare con la Beta e il debriefing (cap. 10).

## 15.1 Visione

Il Project Hub nasce come strumento per uno studio partner, ma è progettato fin dal primo commit come **SaaS B2B verticale multi-tenant** per studi di architettura (e, in prospettiva, ingegneri e geometri), con due canali di ingresso **sullo stesso prodotto**:

| Canale | Chi configura | Ricavi | Quando |
|--------|---------------|--------|--------|
| **Self-service** | Lo studio in autonomia (registrazione → trial → wizard → pagamento) | Abbonamento ricorrente | Dal lancio v1.0 |
| **Assistito (concierge)** | FDS per conto dello studio | Abbonamento + **servizi una tantum a pagamento** (setup, onboarding, migrazione, profili normativi) | Da subito (primi studi) |

**Obiettivo economico:** un business con **5.000–15.000+ € di MRR** (ricavi ricorrenti mensili) e/o un **asset cedibile**.

**Strategia ibrida in due fasi:**
1. **Concierge (primi 3–10 studi):** FDS attiva e configura ogni studio di persona. Serve a osservare dove si bloccano gli utenti, correggere gli attriti e raccogliere casi studio e testimonianze.
2. **Apertura self-service:** corretti gli attriti, si aprono le registrazioni libere con trial e pagamento automatico. I servizi FDS restano in vendita come opzione.

## 15.2 Listino di riferimento (ipotesi — `Q-24`)

Prezzi **IVA esclusa**.

| Piano | Mensile | Annuale | Per chi | Contenuto principale |
|-------|---------|---------|---------|----------------------|
| **Architetto Solo** | 49 € | 490 € | Libero professionista | 1 utente, max 3 commesse attive, sottodominio standard, branding base, badge visibile |
| **Studio Pro** *(il più venduto)* | 99 € | 990 € | Studio fino a 3 persone | Fino a 3 utenti, commesse illimitate, white-label completo, R.A.I. completo, trascrizione AI inclusa (fair use) |
| **Studio Enterprise / Multi-sede** | 199–249 € | a preventivo | Studi strutturati | Utenti illimitati, ruoli avanzati, dominio personalizzato incluso, supporto prioritario, onboarding dedicato |

**Note di coerenza:**
- Le due analisi di partenza usano 90 € e 99 € come prezzo del piano centrale. Si adotta **99 €/mese – 990 €/anno** come riferimento (2 mesi gratis sull'annuale); la decisione finale è in `Q-24`.
- **Annuale scontato** come leva primaria: molti studi preferiscono un'unica fattura deducibile.
- **Early adopter:** primo anno a prezzo speciale (es. 690 €/anno) per i primi 5–10 studi, bloccato sul tenant (FR-M6-11).

### Add-on e servizi

| Voce | Tipo | Prezzo di riferimento | Gestione nel prodotto |
|------|------|-----------------------|-----------------------|
| Setup White-Label "Zero Sbatti" | Una tantum | 250 € | FR-M6-10 (ordine di lavoro + sessione di supporto) |
| Onboarding dedicato / formazione | Una tantum | a listino | FR-M6-10 |
| Profilo normativo comunale su misura | Una tantum / add-on | a preventivo | FR-M6-10 + FR-M0-12 |
| Dominio personalizzato (piano Pro) | Ricorrente | a listino | Entitlement `custom_domain` |
| Posti utente extra (Pro) | Ricorrente | a listino | Entitlement `seats.max` |
| Minuti AI / storage extra | Ricorrente o una tantum | a listino | FR-M6-09 |
| **Sito web portfolio dello studio** | Servizio dell'agenzia FDS | 1.500–2.500 € | **Fuori dal prodotto.** È una linea di ricavo dell'agenzia; il prodotto si limita a registrare l'eventuale ordine nel back-office (FR-M6-10) |

## 15.3 Economia unitaria (ipotesi da verificare con i costi reali della Beta)

### Costi variabili per studio (COGS)

| Voce | Stima per studio al mese | Note |
|------|--------------------------|------|
| Storage file (S3) | < 0,50 € | ~0,02–0,025 $/GB/mese; uno studio medio 5–20 GB |
| Trascrizione audio | ~0,30–1,50 € | 50–150 min/mese; il prezzo per minuto dipende dal fornitore (es. ~0,006 $/min per alcuni modelli, fino a ~0,024 $/min per altri servizi gestiti) |
| Strutturazione LLM | ~0,10–0,50 € | Pochi centesimi per sopralluogo |
| Email transazionali | < 0,10 € | |
| Commissioni di pagamento | ~1,5–3% del canone | Stripe (carte UE) + eventuale SEPA |
| Fatturazione elettronica SDI | < 1 € | Canone del provider ripartito |
| **Totale variabile** | **≈ 3–6 €** su un canone di 99 € | **Margine lordo variabile ≈ 94–97%** |

### Costi fissi di piattaforma (indipendenti dal numero di studi, fino a qualche centinaio)

| Voce | Stima mensile | Note |
|------|---------------|------|
| Database gestito (Supabase Pro + compute) | 25–100 € | Cresce con il carico |
| Backend e worker (AWS Fargate/ALB/NAT o equivalente) | 80–250 € | Il pool PDF sempre attivo pesa; da ottimizzare |
| CDN, DNS, domini personalizzati | 10–50 € | CloudFront SaaS Manager o Cloudflare for SaaS (ADR-005) |
| Monitoraggio, backup, sicurezza | 20–80 € | |
| Strumenti (email, error tracking, repository) | 20–60 € | |
| **Totale fisso** | **≈ 150–550 €/mese** | Va coperto già nella fase di validazione |

> **Correzione rispetto alle analisi di partenza:** il costo *variabile* per studio è davvero di pochi euro, ma esiste una **base fissa di infrastruttura** di qualche centinaio di euro al mese. Con 10 studi (~900–1.000 € MRR) la base fissa si mangia buona parte del margine; il modello diventa molto redditizio **dalla fase 2 in poi**. Per questo in Beta l'infrastruttura va dimensionata al minimo (NFR-SCAL), con allarmi di budget (cap. 14).

### Tappe di fatturato

| Fase | Studi paganti | MRR (ARPU ~90–95 €) | ARR | Significato |
|------|---------------|---------------------|-----|-------------|
| 1 — Validazione | 10 | ~900–950 € | ~11.000 € | Copre infrastruttura e strumenti; valida il product-market fit |
| 2 — Sostenibilità | 40 | ~3.600–3.800 € | ~43.000–45.000 € | Reddito da sviluppatore indipendente |
| 3 — Scalabilità | 120 | ~11.000 € | ~132.000 € | Business solido e delegabile |

**Mercato:** in Italia sono iscritti agli albi oltre 150.000 architetti; 100–120 studi paganti sono una frazione minima del mercato indirizzabile. *(Dato da verificare con le fonti ufficiali del Consiglio Nazionale degli Architetti prima di usarlo in materiale commerciale.)*

## 15.4 Metriche SaaS da misurare fin dal lancio

| Metrica | Definizione | Target indicativo | Fonte nel prodotto |
|---------|-------------|-------------------|--------------------|
| MRR / ARR | Ricavi ricorrenti mensili / annuali | Tappe del §15.3 | FR-M6-14 |
| Conversione trial → pagamento | % dei trial che attivano un piano | ≥ 15–25% (B2B con trial senza carta) | FR-M6-14/15 |
| Tasso di attivazione | % dei nuovi tenant "attivati" entro 7 giorni (`Q-27`) | ≥ 40% | FR-M6-15 |
| Churn mensile (logo) | % di studi che disdicono nel mese | ≤ 2–3% | FR-M6-14 |
| NRR | Ricavi dell'anno dagli stessi clienti, compresi upgrade e add-on | ≥ 100% | FR-M6-14 |
| ARPU | MRR / studi paganti | ≥ 90 € | FR-M6-14 |
| CAC e payback | Costo di acquisizione e mesi per recuperarlo | Payback ≤ 6 mesi | Esterno (marketing) |
| Tasso di acquisto dei servizi | % di nuovi studi che comprano il setup assistito | Ipotesi ~30% | FR-M6-10 |

## 15.5 Canali di acquisizione e requisiti di prodotto collegati

| Canale | Descrizione | Requisito di prodotto |
|--------|-------------|-----------------------|
| **A. Crescita virale dai documenti** | Imprese, periti e altri tecnici vedono verbali e relazioni ben fatti, con la dicitura discreta "Redatto con …" | FR-M6-13 (badge per piano, con UTM) |
| **B. Formazione e CFP** | Webinar gratuiti (es. "R.A.I. dopo il Salva Casa e tutela dalle contestazioni dei clienti") con enti accreditati o associazioni; prova gratuita a fine webinar | FR-M6-11 (coupon per evento), FR-M6-04 (trial esteso) |
| **C. SEO sui "problemi a caldo"** | Contenuti e mini-strumenti gratuiti (calcolatore R.A.I. per una stanza, fac-simile di verbale) che portano alla registrazione | FR-M6-19 (lead magnet con `rai-engine` condiviso) |
| **D. Contatto diretto mirato** | Messaggi personalizzati a studi della regione, con un video di anteprima con il loro logo; offerta di mesi gratis in cambio di feedback | FR-M6-10 (tenant precompilato dal back-office), FR-M6-11 (mesi gratis) |
| **E. Referral** | Studio che porta studio | FR-M6-12 |

> ⚠️ Canale D: i contatti a freddo via email/LinkedIn verso professionisti devono rispettare GDPR e Codice Privacy (base giuridica, informativa, opposizione). Da validare con il legale prima di scalare (`Q-28`).

## 15.6 Valore dell'asset (exit)

- Un SaaS con ricavi ricorrenti prevedibili e churn basso si valuta con **multipli dell'ARR o dell'utile**, più alti rispetto a un'attività basata sul tempo (agenzia).
- **Prudenza:** le analisi di partenza indicano 4–8× l'ARR. Per micro-SaaS sotto 1 M€ di ARR i multipli osservati sono spesso **più bassi** (tipicamente 3–5× l'utile annuo o l'ARR, secondo crescita, churn, concentrazione dei clienti e dipendenza dal fondatore). Il valore dipende soprattutto da: **churn basso, crescita costante, documentazione e codice di qualità, processi non dipendenti dal fondatore**.
- **Potenziali acquirenti:** software house italiane del settore edilizia e professioni tecniche, piattaforme internazionali di gestione cantiere che vogliono entrare in Italia con le logiche normative locali già pronte.
- **Implicazioni per lo sviluppo:** codice pulito e testato, **AFU e ADR aggiornati**, infrastruttura come codice, metriche affidabili, dati portabili, contratti (termini, DPA) standard. Sono requisiti che aumentano il valore dell'asset, non costi da tagliare.

## 15.7 Piano d'azione commerciale (allineato alla roadmap, cap. 10)

1. **MVP snello:** autenticazione, tenant self-service e piani/entitlements, commesse, revisione base, calcolo R.A.I., verbale PDF.
2. **Caso studio #1:** lo studio partner lo usa su un cantiere vero; si correggono i bug finché non dice "non posso più farne a meno"; si raccoglie una video-recensione.
3. **Primi 5 clienti paganti** con l'offerta early adopter annuale, in modalità concierge.
4. **Apertura self-service** (trial, Stripe, SDI) e attivazione dei canali A–E.
