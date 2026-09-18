# AFU — Analisi Funzionale Utente

**Progetto:** Project Hub White-Label per Studi di Architettura
**Stato documento:** Draft per Versione Beta — v0.1
**Data:** 2026-09-18
**Ruolo del documento:** Single Source of Truth (SSoT) funzionale per tutto il ciclo di vita del prodotto

---

## Indice

| # | Capitolo | File |
|---|----------|------|
| 1 | Inquadramento generale e ambito | [01-inquadramento.md](01-inquadramento.md) |
| 2 | Attori, ruoli e matrice dei permessi (RBAC) | [02-attori-rbac.md](02-attori-rbac.md) |
| 3 | Glossario tecnico-normativo e di dominio | [03-glossario.md](03-glossario.md) |
| 4 | Macro-processi, workflow e macchine a stati | [04-processi.md](04-processi.md) |
| 5.0 | Modulo 0 — Multi-tenancy e motore white-label | [05-m0-tenant-white-label.md](05-m0-tenant-white-label.md) |
| 5.1 | Modulo 1 — Fascicolo di commessa | [05-m1-commessa.md](05-m1-commessa.md) |
| 5.2 | Modulo 2 — Client Portal e Visual Pinning | [05-m2-client-portal.md](05-m2-client-portal.md) |
| 5.3 | Modulo 3 — Motore di calcolo normativo R.A.I. | [05-m3-rai.md](05-m3-rai.md) |
| 5.4 | Modulo 4 — Diario di cantiere mobile e audio AI | [05-m4-diario-cantiere.md](05-m4-diario-cantiere.md) |
| 5.5 | Modulo 5 — Engine documentale e generazione PDF | [05-m5-documentale.md](05-m5-documentale.md) |
| 5.6 | Modulo 6 — SaaS self-service: registrazione, prova, piani, abbonamenti, servizi FDS | [05-m6-saas-billing.md](05-m6-saas-billing.md) |
| 5.T | Funzioni trasversali (autenticazione, notifiche, audit, ricerca, account) | [05-mt-trasversali.md](05-mt-trasversali.md) |
| 6 | Catalogo delle regole di business | [06-business-rules.md](06-business-rules.md) |
| 7 | Casi limite e gestione delle eccezioni | [07-edge-cases.md](07-edge-cases.md) |
| 8 | Requisiti non funzionali | [08-nfr.md](08-nfr.md) |
| 9 | Matrice di tracciabilità e criteri di accettazione | [09-rtm-collaudo.md](09-rtm-collaudo.md) |
| 10 | Roadmap Beta e piano di test congiunto | [10-roadmap-test.md](10-roadmap-test.md) |
| 11 | Modello dati concettuale | [11-modello-dati.md](11-modello-dati.md) |
| 12 | Quadro normativo, privacy e compliance | [12-compliance-normativa.md](12-compliance-normativa.md) |
| 13 | Assunzioni, vincoli, rischi e questioni aperte | [13-rischi-questioni-aperte.md](13-rischi-questioni-aperte.md) |
| 14 | Architettura di riferimento (Angular · NestJS · PostgreSQL/Supabase · AWS) — indicativa | [14-architettura-riferimento.md](14-architettura-riferimento.md) |
| 15 | Modello di business SaaS (listino, economia unitaria, metriche, canali, exit) | [15-modello-business.md](15-modello-business.md) |

**Stack deciso dal committente (vincoli V-01..V-04):** frontend Angular 20/21 · backend NestJS · database relazionale **PostgreSQL gestito su Supabase** (regione UE) · infrastruttura applicativa su AWS in regione UE.

**Natura del prodotto:** SaaS B2B multi-tenant con **due canali sullo stesso prodotto**: self-service (lo studio si registra, prova, si configura e paga da solo) e assistito (FDS configura per conto dello studio, come servizio a pagamento). Vedi [Modulo 6](05-m6-saas-billing.md) e [cap. 15](15-modello-business.md).

---

## Convenzioni di identificazione

Ogni elemento del documento ha un ID stabile. **Un ID non viene mai riutilizzato**: se un requisito viene eliminato resta nel documento con stato `Ritirato`.

| Prefisso | Significato | Esempio |
|----------|-------------|---------|
| `FR-M{n}-{nn}` | Requisito funzionale del modulo n (0–5) | `FR-M3-07` |
| `FR-MT-{nn}` | Requisito funzionale trasversale | `FR-MT-04` |
| `BR-{nn}` | Regola di business | `BR-02` |
| `EC-{nn}` | Caso limite / eccezione | `EC-07` |
| `NFR-{area}-{nn}` | Requisito non funzionale | `NFR-PERF-01` |
| `AC-{FR}-{n}` | Criterio di accettazione (Given/When/Then) collegato a un FR | `AC-FR-M3-07-1` |
| `P-{nn}` | Processo di business | `P-02` |
| `SM-{entità}` | Macchina a stati | `SM-ELABORATO` |
| `TC-{nn}` | Caso di test del piano di collaudo | `TC-031` |
| `A-{nn}` / `V-{nn}` | Assunzione / Vincolo | `A-04` |
| `R-{nn}` | Rischio | `R-06` |
| `Q-{nn}` | Questione aperta (decisione pendente) | `Q-03` |

### Priorità (MoSCoW riferito alla Beta)

- **M — Must:** senza questo la Beta non si può collaudare.
- **S — Should:** atteso nella Beta, ma sacrificabile se i tempi slittano.
- **C — Could:** da fare se avanza tempo.
- **W — Won't (in Beta):** già analizzato, pianificato dopo la Beta.

### Linguaggio normativo

- **"deve"** = obbligatorio (Must).
- **"dovrebbe"** = raccomandato (Should).
- **"può"** = facoltativo (Could).

---

## Modalità di aggiornamento (change control)

1. Ogni modifica passa da una Pull Request che tocca solo i file `docs/afu/`. Nel titolo va indicato l'ID dell'elemento modificato (es. `docs(afu): FR-M3-07 aggiorna soglia aerante`).
2. Una modifica a un elemento già **Approvato** richiede la revisione di un rappresentante del committente (lo studio partner).
3. Ogni modifica aggiorna il **Registro delle revisioni** qui sotto.
4. I ticket di sviluppo (GitHub Issues/Projects, Linear, Jira) **devono** riportare l'ID dell'FR o della BR che implementano. La RTM (cap. 9) è la vista che li collega.
5. Una questione aperta (`Q-xx`) risolta viene riportata nel capitolo interessato e segnata `Chiusa` con la decisione e la data.

### Stati di un elemento

`Bozza` → `In revisione` → `Approvato` → (`Modificato` → `Approvato`) | `Ritirato`

---

## Registro delle revisioni

| Versione | Data | Autore | Descrizione |
|----------|------|--------|-------------|
| 0.1 | 2026-09-18 | Team di prodotto | Prima stesura completa a partire dalla traccia di progetto |
| 0.2 | 2026-09-18 | Team di prodotto | Visione SaaS self-service + canale assistito: nuovo Modulo 6 (FR-M6-*), cap. 15 (business), BR-26..30, Milestone 5, Supabase come database gestito, Q-07 chiusa, Q-23..Q-30 aperte |

---

## Note di revisione sulla traccia originale

Rispetto alla traccia iniziale, durante l'analisi sono emerse queste correzioni e integrazioni. Sono già applicate nel documento; qui ne resta traccia per il committente:

1. **Esempio di collaudo R.A.I. (cap. 9) aritmeticamente errato.** La traccia riporta: vano di 20 mq e finestra 1,40 × 1,50 m = 2,10 mq, "Conforme" con margine +0,20 mq rispetto al minimo di 2,50 mq. Ma 2,10 < 2,50: quel vano è **Non Conforme** con deficit di **−0,40 mq**. L'esempio è stato corretto (finestra 1,80 × 1,50 = 2,70 mq → Conforme, +0,20 mq) e il caso originale è stato mantenuto come caso di test negativo.
2. **La L. 105/2024 ("Salva Casa") non deroga il rapporto 1/8.** Il nuovo art. 24, comma 5-bis, del DPR 380/2001 consente al progettista di asseverare la conformità igienico-sanitaria con **altezza interna fino a 2,40 m** e **monolocali da 20 mq (1 persona) / 28 mq (2 persone)**, solo in presenza di condizioni specifiche (recupero edilizio o progetto contestuale di miglioramento) e di "soluzioni alternative" (maggiori superfici, ventilazione naturale favorita da finestre e riscontri d'aria, mezzi di ventilazione naturale ausiliari). Per questo il badge "Soggetto a deroga con VMC (L. 105/2024)" è stato riformulato come esito **"Conformità subordinata ad asseverazione"**, con motivazione obbligatoria (vedi `BR-06`, `FR-M3-12`, `Q-01`).
3. **Il D.M. 5/7/1975 parla di superficie finestrata *apribile*.** La traccia usava a volte "illuminante" e a volte "aerante". Il motore gestisce ora **due verifiche distinte** (illuminante e aerante) con soglie configurabili per profilo normativo, perché molti regolamenti locali le separano (vedi `FR-M3-08`).
4. **La "deroga montana 1/10" non è una norma nazionale.** Il D.M. 1975 prevede per i comuni montani sopra i 1000 m s.l.m. solo la riduzione dell'altezza a 2,55 m. Il rapporto ridotto (1/10, 1/12 per le mansarde ecc.) nasce da regolamenti regionali o comunali e va quindi modellato come **profilo normativo configurabile**, non come regola fissa.
5. **Mancava un attore:** il *Platform Admin* (operatore del SaaS), necessario per creare i tenant, gestire le licenze e il supporto. È stato aggiunto al cap. 2.
7. **Da strumento per uno studio a SaaS (v0.2):** il sistema di piani e diritti d'uso (FR-M6-05) e il provisioning automatico dei tenant (FR-M6-02) sono vincoli architetturali **da subito**, anche se pagamenti e fatturazione arrivano solo al lancio commerciale.
6. **Valore legale del "Formal Sign-off":** l'approvazione via Magic Link è una **firma elettronica semplice** (eIDAS art. 25). È stata rafforzata con OTP e con un'impronta hash del documento (vedi `FR-M2-15`, cap. 12).
