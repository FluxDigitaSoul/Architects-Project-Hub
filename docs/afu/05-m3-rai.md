# 5.3 Modulo 3 — Motore di calcolo normativo e R.A.I.

**Obiettivo:** calcolare in modo deterministico, trasparente e riproducibile i rapporti aeroilluminanti e i requisiti dimensionali dei vani, secondo un **profilo normativo versionato**, e produrre una relazione tecnica pronta per il deposito.

**Principi di progetto del motore:**
1. **Parametrico, non codificato a mano:** nessuna soglia è scritta nel codice. Tutto passa dal profilo normativo (FR-M3-01), perché le regole cambiano tra regioni e comuni.
2. **Trasparente:** per ogni vano il sistema mostra la formula applicata, i valori intermedi e l'articolo di riferimento ("perché questo risultato").
3. **Riproducibile:** un calcolo salvato riporta la versione del profilo e degli input. Ricalcolato dopo anni dà lo stesso risultato (`BR-21`).
4. **Aritmetica decimale esatta:** niente virgola mobile binaria nei confronti con le soglie (`BR-22`).
5. **Supporto, non sostituzione:** l'esito è una verifica di supporto. La responsabilità dell'asseverazione resta del tecnico (`BR-07`).

---

## Struttura dei dati

```
Commessa
 └── Fabbricato (1..n)          es. "Edificio A"
      └── Unità immobiliare (1..n)   es. "Sub. 5 — Appartamento 2° piano"
           └── Vano (1..n)
                └── Apertura (0..n) ── può rimandare a un tipo dell'Abaco serramenti
Abaco serramenti (per commessa): tipi di apertura riutilizzabili (W1, W2, PF1…)
Profilo normativo: assegnato alla commessa, sovrascrivibile per unità immobiliare
```

---

## FR-M3-01 — Profili normativi · **M**

Un profilo normativo è un insieme **versionato** di parametri. Ogni modifica crea una nuova versione; le versioni usate da relazioni finalizzate non si possono più modificare.

### Parametri del profilo

| Gruppo | Parametro | Tipo | Esempio (nazionale) |
|--------|-----------|------|---------------------|
| **Identità** | Nome, ambito (nazionale/regionale/comunale), riferimenti normativi (testo + URL), valido dal / al, note | — | "D.M. Sanità 5/7/1975" |
| **Verifiche attive** | Verifica illuminante (`Si/Sp`) | bool | vero |
| | Verifica aerante (`Sa/Sp`) | bool | vero |
| | Verifica aerante rispetto all'illuminante (`Sa ≥ k × Si`) | bool + k | falso |
| **Soglie per destinazione** | `ratioIllMin` per destinazione abitabile | frazione | 1/8 |
| | `ratioAerMin` per destinazione abitabile | frazione | 1/8 |
| | Soglie specifiche per sottotetto / mansarda | frazione | — (es. 1/10 o 1/12 secondo il regolamento locale) |
| **Regole di misura di Si** | Base di misura: `LUCE_ARCHITETTONICA` oppure `VETRO_NETTO` | enum | `LUCE_ARCHITETTONICA` |
| | Coefficiente di riduzione per il telaio (se si misura in luce architettonica e il profilo lo prevede) | decimale 0–1 | 1,00 (nessuna riduzione) |
| | Quota di esclusione dal pavimento (parte bassa non computata in `Si`) | m | 0,00 nel D.M.; tipicamente 0,60 nei regolamenti locali |
| | Aggetti: soglia di profondità oltre la quale si applica la riduzione | m | — (es. 1,20) |
| | Aggetti: metodo | enum: `NESSUNO`, `ESCLUDI_FASCIA_SUPERIORE` (fascia alta = profondità × fattore), `AUMENTA_REQUISITO` | `NESSUNO` |
| | Aggetti: fattore | decimale | — (es. 0,50) |
| | Aperture in falda / lucernari: coefficiente di computo | decimale | 1,00 |
| **Profondità del vano (Should)** | Se profondità > `a` × altezza dell'architrave, il requisito cresce in modo lineare fino a `ratioMax` a `b` × altezza | a, b, ratioMax | disattivato (es. locale: 2,5 / 3,5 / 1/4) |
| **Esclusioni da `Sp` (mansarde)** | Altezza sotto la quale la superficie non si computa | m | — (es. 1,50) |
| **Altezze minime** | Per destinazione: abitabile / accessorio-servizio | m | 2,70 / 2,40 |
| | Comuni montani: altitudine soglia e altezza ridotta | m | 1000 s.l.m. → 2,55 |
| | Altezza media minima per i sottotetti abitabili (se il profilo lo prevede) | m | — |
| **Superfici minime** | Camera singola / doppia / soggiorno | mq | 9 / 14 / 14 |
| | Monostanza per 1 / 2 persone | mq | 28 / 38 |
| | Superficie per abitante (primi 4 / successivi) | mq | 14 / 10 |
| **Destinazioni che richiedono il R.A.I.** | Elenco delle destinazioni soggette | lista | soggiorno, camera, cucina abitabile, studio, pranzo |
| **Destinazioni che richiedono ventilazione** | Elenco + modalità ammesse (finestra / aspirazione meccanica / VMC) | lista | bagno: finestra **o** aspirazione meccanica (art. 7) |
| **Deroghe ammesse** | Elenco delle deroghe attivabili (vedi FR-M3-12) con relativo ambito | lista | D-01 Salva Casa (solo altezze e superfici), D-99 Altro |
| **Arrotondamento di visualizzazione** | Decimali mostrati | intero | 2 |

### Catalogo iniziale (Beta)

| Profilo | Stato nella Beta | Note |
|---------|------------------|------|
| **Nazionale — D.M. 5/7/1975** | **Must**, di sistema | Valori della colonna "Esempio" sopra |
| **Nazionale + Salva Casa (art. 24 c. 5-bis DPR 380/2001)** | **Must**, di sistema | Come il nazionale, con la deroga D-01 abilitata per altezze (min 2,40 m) e monostanze (20/28 mq), soggetta ad asseverazione |
| **Profilo del comune dello studio partner** | **Must** per il collaudo | Da costruire **insieme** allo studio partner a partire dal regolamento edilizio in vigore (`Q-11`) |
| Modello "Regolamento locale tipo" | Should | Base precompilata con i valori più diffusi (quota 0,60 m, aggetti oltre 1,20 m con fascia = 1/2 della profondità), da adattare |

> ⚠️ I valori dei profili locali (quote di esclusione, aggetti, soglie per i sottotetti come 1/10 o 1/12) **variano da regolamento a regolamento**. Nessun profilo non nazionale va pubblicato come "di sistema" senza la validazione di un professionista con il riferimento puntuale all'articolo.

### Assegnazione

- Profilo predefinito del tenant → proposto alla creazione della commessa → sovrascrivibile per unità immobiliare.
- Cambiare profilo su una commessa con dati già inseriti ricalcola tutto e mostra un **riepilogo delle differenze** ("3 vani passano da Conforme a Non conforme") prima della conferma.

---

## FR-M3-02 — Fabbricati e unità immobiliari · **M**

- **Fabbricato:** nome, indirizzo (predefinito quello della commessa), numero di piani, anno di costruzione (facoltativo), vincoli (facoltativo: tutela D.Lgs. 42/2004, centro storico).
- **Unità immobiliare:** nome, piano, dati catastali (facoltativi), tipologia (alloggio, monostanza, ufficio, altro), **numero di abitanti previsti** (facoltativo, abilita la verifica dell'art. 2 del D.M.), sottotetto sì/no, profilo normativo specifico (facoltativo).

---

## FR-M3-03 — Anagrafica dei vani · **M**

| Campo | Obbligatorio | Validazione | Note |
|-------|--------------|-------------|------|
| Nome | Sì | max 60 | es. "Camera 1", "Soggiorno-cucina" |
| Codice | No | es. `P1.03` | Rimando alla pianta |
| Destinazione d'uso | Sì | enum (vedi sotto) | Decide quali verifiche si applicano |
| Superficie di pavimento `Sp` | Sì | > 0 e ≤ 1.000 mq; 2 decimali in input | Superficie netta calpestabile |
| Superficie non computabile | No | 0 ≤ valore < `Sp` | Mansarde: parte sotto l'altezza minima di computo |
| Tipo di soffitto | Sì | piano / inclinato / a volta / misto | |
| Altezza utile `Hu` | Sì se piano | 1,00–10,00 m | |
| Altezza minima e massima | Sì se inclinato | `Hmin` ≤ `Hmax` | Per calcolare l'altezza media |
| Altezza media `Hmedia` | Calcolata o inserita | — | Soffitto inclinato semplice: `(Hmin + Hmax)/2`; geometrie complesse: inserimento manuale del volume netto → `Hmedia = V / Sp` |
| Profondità del vano | No | m | Solo se il profilo ha la regola della profondità |
| Vano cieco | bool | — | Vedi FR-M3-13 |
| Ventilazione meccanica / aspirazione | bool + tipo (aspirazione puntuale / VMC centralizzata / VMC puntuale) | — | |
| Note | No | max 1.000 | Riportate in relazione |

**Destinazioni d'uso (enum):** Soggiorno · Camera singola · Camera doppia · Cucina abitabile · Soggiorno con angolo cottura · Pranzo · Studio · Monostanza · Bagno · WC · Lavanderia · Ripostiglio · Cabina armadio · Disimpegno · Corridoio · Vano scala · Locale tecnico · Sottotetto non abitabile · Altro abitabile · Altro accessorio.

La classe (abitabile / accessorio / servizio) deriva dalla destinazione e non si modifica a mano, così non si possono aggirare le verifiche.

---

## FR-M3-04 — Inserimento rapido e produttività · **S**

- Duplicazione di un vano (con o senza aperture).
- Inserimento in tabella (stile foglio di calcolo) con navigazione da tastiera: Tab, Invio, frecce.
- Riordino dei vani con trascinamento.
- **Import CSV (Could):** colonne `nome, destinazione, sp, hu` più aperture su righe collegate. Template scaricabile.

---

## FR-M3-05 — Calcolo della superficie computabile e delle altezze · **M**

- `Sp_comp = Sp − superficie non computabile` (mansarde). È la base di tutti i rapporti.
- **Verifica dell'altezza:** `Hu` (o `Hmedia` per i soffitti inclinati) ≥ altezza minima del profilo per quella classe di vano, tenendo conto della riduzione montana se l'altitudine della commessa supera la soglia.
- **Verifica delle superfici minime** (camera, soggiorno, monostanza): esito separato dal R.A.I. e mostrato nella stessa scheda.
- **Verifica per abitanti (Should):** se l'unità ha il numero di abitanti, `Σ Sp_comp dei vani` ≥ 14 × min(abitanti, 4) + 10 × max(abitanti − 4, 0).

---

## FR-M3-06 — Gestione delle aperture e degli infissi · **M**

| Campo | Obbligatorio | Validazione | Note |
|-------|--------------|-------------|------|
| Tipo dall'abaco | No | — | Se valorizzato, precompila i campi sotto |
| Etichetta | Sì | es. `W1`, `PF2` | |
| Tipologia | Sì | finestra / portafinestra / finestra in falda / lucernario / vetrata fissa / sopraluce | |
| Orientamento | No | N, NE, E, SE, S, SO, O, NO, zenitale | Informativo (Won't in Beta: calcolo FLDm) |
| Quantità | Sì | intero ≥ 1 | Per aperture identiche nello stesso vano |
| Larghezza `L` | Sì | 0,10–20,00 m | Luce architettonica |
| Altezza `H` | Sì | 0,10–10,00 m | Luce architettonica |
| Quota del davanzale `hd` | Sì per le aperture verticali | 0–5,00 m | Distanza dal pavimento finito al bordo inferiore della luce. Serve per l'esclusione della fascia bassa |
| Dimensioni del vetro netto `Lv × Hv` | Solo se il profilo misura il `VETRO_NETTO` | ≤ L × H | |
| Apribilità | Sì | `TOTALE` / `PARZIALE` / `FISSA` | |
| Superficie apribile `Sa` (se parziale) | Sì se `PARZIALE` | 0 < Sa ≤ L × H | Oppure percentuale apribile |
| Profondità dell'aggetto sovrastante | No | 0–10,00 m | Balcone, gronda, loggia sopra l'apertura |
| Su spazio esterno idoneo | Sì (bool, predefinito vero) | — | Se falso (es. su cavedio o chiostrina non conforme), l'apertura non si computa e il sistema lo segnala (`EC-11`) |
| Note | No | — | |

---

## FR-M3-07 — Abaco dei serramenti · **S**

Elenco per commessa dei tipi di apertura (es. `W1 — 120×140, davanzale 90, anta ribalta`). Nei vani si inseriscono aperture "di tipo W1 × 2". Modificare il tipo aggiorna tutte le aperture collegate, con conferma e riepilogo dei vani coinvolti. Il sistema può esportare l'abaco in relazione.

---

## FR-M3-08 — Algoritmo di calcolo (specifica normativa del motore) · **M**

Per ogni **apertura** `j` di un vano (tutte le misure in metri e mq, aritmetica decimale esatta):

```
1. Superficie lorda               A_j = L × H
2. Base di misura                 se profilo = VETRO_NETTO e Lv,Hv presenti:
                                        Lb = Lv ; Hb = Hv ; hb = hd + (H − Hv)/2   (vetro centrato, salvo input)
                                  altrimenti:
                                        Lb = L ; Hb = H ; hb = hd
3. Fascia bassa esclusa           basso  = max(hb, quotaEsclusione)
                                  alto   = hb + Hb
4. Fascia alta esclusa (aggetto)  se metodo = ESCLUDI_FASCIA_SUPERIORE e profonditàAggetto > sogliaAggetto:
                                        alto = alto − (profonditàAggetto × fattoreAggetto)
5. Altezza illuminante utile      Hi = max(0, alto − basso)
6. Superficie illuminante         Si_j = Lb × Hi × coeffTelaio × coeffTipo(tipologia) × quantità
                                  (coeffTipo = coeffFalda per finestre in falda/lucernari, 1 altrimenti;
                                   vetrata su spazio non idoneo → Si_j = 0)
7. Superficie aerante             TOTALE   → Sa_j = A_j × quantità
                                  PARZIALE → Sa_j = SaInput × quantità
                                  FISSA    → Sa_j = 0
```

Per ogni **vano**:

```
Si_tot = Σ Si_j           Sa_tot = Σ Sa_j
Sp_c   = Sp − superficieNonComputabile

reqIll = ratioIllMin(destinazione, sottotetto)       [eventualmente aumentato dalla regola di profondità]
reqAer = ratioAerMin(destinazione, sottotetto)

SiMin  = Sp_c × reqIll     ΔIll = Si_tot − SiMin     RAI_ill = Si_tot / Sp_c
SaMin  = Sp_c × reqAer     ΔAer = Sa_tot − SaMin     RAI_aer = Sa_tot / Sp_c

Verifica illuminante superata ⇔ Si_tot ≥ SiMin   (uguaglianza = conforme)
Verifica aerante superata     ⇔ Sa_tot ≥ SaMin
```

**Output mostrato per vano:** `Sp_c`, `Si_tot`, `Sa_tot`, `RAI_ill` e `RAI_aer` sia come decimale (es. 0,135) sia come frazione equivalente (es. "1/7,41"), minimi richiesti, `Δ` in mq con segno, esito per verifica ed esito complessivo, profilo e versione, e la tabella delle aperture con i valori intermedi (`Hi`, fasce escluse).

---

## FR-M3-09 — Regole di esclusione e correzione: comportamento visibile · **M**

Quando una regola riduce una superficie, la riga dell'apertura mostra un'**icona informativa** con la spiegazione, es.:
- "Esclusi 0,60 m dal pavimento: Hi = 1,80 m su 2,40 m (art. X del profilo)";
- "Aggetto di 1,60 m > 1,20 m: esclusa la fascia superiore di 0,80 m";
- "Apertura su spazio non idoneo: non computata".

---

## FR-M3-10 — Calcolo e segnalazione visiva in tempo reale · **M**

- Il ricalcolo avviene **a ogni modifica** di un campo, senza pulsante "Calcola": risultato visibile entro 100 ms dall'input (`NFR-PERF-05`).
- Il calcolo gira sul client per la reattività ed è **ripetuto dal server** quando si salva: fa fede il risultato del server. Le due implementazioni sono **la stessa libreria**, condivisa tra frontend e backend (`V-05`), e un test di non regressione confronta gli esiti su un corpus di casi (`TC-R*`).
- Salvataggio automatico con indicatore "Salvato / Salvataggio… / Errore".

### Badge di stato (colori semantici non personalizzabili — FR-M0-04)

| Badge | Colore | Condizione |
|-------|--------|------------|
| **Conforme** | Verde | Tutte le verifiche attive superate |
| **Non conforme** | Rosso | Almeno una verifica non superata e nessuna deroga valida che la copra |
| **Conformità subordinata ad asseverazione** | Ambra | Almeno una verifica non superata, ma coperta da una deroga attiva (FR-M3-12) con motivazione compilata |
| **Dati incompleti** | Grigio | Mancano dati obbligatori (es. vano abitabile senza aperture e non marcato come cieco) |
| **Non richiesto** | Neutro | La destinazione non richiede il R.A.I. (es. ripostiglio) |
| **Ventilazione OK / KO** | Verde / Rosso | Per i vani di servizio: presenza di finestra apribile **o** aspirazione/VMC secondo il profilo |

Il badge riporta sempre anche il **valore** (es. "Conforme · +0,20 mq", "Non conforme · −0,40 mq aerante"), non solo il colore, per l'accessibilità (`NFR-UX-05`).

---

## FR-M3-11 — Suggerimenti di adeguamento · **C**

Per un vano non conforme, il sistema indica quanto manca in termini concreti: "Servono +0,40 mq di superficie apribile: ad esempio portare W1 da 1,40 a 1,70 m di larghezza (a parità di altezza) oppure aggiungere un'apertura da 0,40 mq".

---

## FR-M3-12 — Deroghe e regimi speciali · **M**

Una deroga si **attiva esplicitamente** sul vano o sull'unità, **solo** se prevista dal profilo, e richiede:
- il tipo di deroga (dal catalogo del profilo);
- la **motivazione tecnica** (min 50 caratteri);
- il riferimento normativo (precompilato dal catalogo, modificabile);
- per D-01, la condizione di accesso: (a) intervento di recupero edilizio con miglioramento delle caratteristiche igienico-sanitarie, oppure (b) progetto contestuale di ristrutturazione con soluzioni alternative. Per (b) serve la descrizione delle soluzioni alternative adottate: maggiore superficie, ventilazione naturale favorita da dimensione e tipo delle finestre, riscontro d'aria trasversale, mezzi di ventilazione naturale ausiliari.

### Catalogo delle deroghe (Beta)

| ID | Deroga | Ambito delle verifiche coperte | Note |
|----|--------|-------------------------------|------|
| D-01 | Art. 24 c. 5-bis DPR 380/2001 (L. 105/2024 "Salva Casa") | Altezza minima fino a 2,40 m; monostanza 20 mq (1 persona) / 28 mq (2 persone) | **Non** copre il R.A.I. Sotto 2,40 m resta Non conforme |
| D-02 | Deroga da regolamento locale per immobili vincolati o in centro storico | Secondo il profilo (tipicamente R.A.I. e altezze) | Solo se il profilo locale la prevede, con articolo di riferimento |
| D-03 | Ventilazione meccanica in sostituzione dell'aerazione naturale | Verifica aerante, **solo** per le destinazioni ammesse dal profilo | Serve il tipo di impianto e la portata dichiarata (m³/h) |
| D-99 | Altra deroga documentata | Qualsiasi, scelta dall'utente | Riferimento normativo **obbligatorio** in testo libero; in relazione compare come "deroga dichiarata dal progettista" |

**Regola:** la VMC da sola **non** trasforma un deficit R.A.I. in "subordinato" nel profilo nazionale. Serve una deroga D-03 o D-99, prevista dal profilo e motivata (`BR-06`).

---

## FR-M3-13 — Vani ciechi e vani di servizio · **M**

- **Vano cieco** (`isWindowless = true`): ammesso senza errori **solo** per le destinazioni che il profilo consente senza aperture (tipicamente bagno/WC con aspirazione meccanica, disimpegno, ripostiglio, locale tecnico).
  - Bagno cieco **senza** aspirazione/VMC → **Ventilazione KO** (art. 7 D.M. 1975).
  - Vano **abitabile** cieco → **Non conforme** (art. 5: illuminazione naturale diretta obbligatoria), salvo deroga ammessa.
- I vani ciechi ammessi **non peggiorano** l'esito complessivo dell'unità e sono elencati a parte nel riepilogo (`EC-09`).

---

## FR-M3-14 — Unità immobiliare: verifiche d'insieme · **M**

Per ogni unità: esito complessivo (il peggiore tra i vani soggetti), totale di `Sp_c`, `Si_tot`, `Sa_tot`, verifica della monostanza (se tipologia = monostanza), verifica per abitanti (se presente), almeno un bagno completo (art. 7, verifica informativa: casella "presenti vaso, bidet, vasca/doccia, lavabo").

---

## FR-M3-15 — Quadro riepilogativo del fabbricato · **M**

Tabella con: unità → vani → `Sp_c`, `Si`, `Sa`, minimi, `Δ`, esito; subtotali per unità; totali di fabbricato (superficie utile totale, superficie illuminante totale, superficie aerante totale, numero di vani per esito, somma dei deficit); elenco delle deroghe applicate con motivazione; **esito di asseverazione complessivo**:
- "Tutti i vani soggetti risultano conformi" → relazione asseverativa possibile;
- "Conformità subordinata ad asseverazione per N vani" → relazione possibile con la sezione deroghe;
- "Presenti N vani non conformi" → solo il report di verifica, niente asseverazione (`BR-06`).

---

## FR-M3-16 — Blocco del calcolo in relazione · **M**

Quando si genera una relazione **definitiva** (FR-M5-20), il sistema crea uno **snapshot** immutabile di input, profilo e versione, e risultati. Le modifiche successive ai vani non cambiano la relazione emessa; per aggiornarla serve una nuova revisione della relazione (Rev. 1, Rev. 2…).

---

## Criteri di accettazione del Modulo 3 (casi di calcolo di riferimento)

Tutti i casi usano il profilo **Nazionale — D.M. 5/7/1975** (illuminante e aerante 1/8, nessuna esclusione né aggetto), salvo indicazione diversa.

- **AC-FR-M3-08-1 (esempio corretto della traccia)** — *Dato* un soggiorno con `Sp` = 20,00 mq e una finestra 1,80 × 1,50 m, davanzale a 0,90 m, apertura totale (2,70 mq); *quando* l'architetto seleziona il rapporto 1/8; *allora* il sistema mostra il badge verde **"Conforme"** con `SiMin = SaMin = 2,50 mq`, `Si = Sa = 2,70 mq` e margine **+0,20 mq**, `RAI = 0,135 (≈ 1/7,41)`.
- **AC-FR-M3-08-2 (caso originale della traccia, negativo)** — *Dato* un soggiorno con `Sp` = 20,00 mq e una finestra 1,40 × 1,50 m (2,10 mq) ad apertura totale; *quando* si applica il rapporto 1/8; *allora* il sistema mostra il badge rosso **"Non conforme"** con deficit **−0,40 mq** su entrambe le verifiche.
- **AC-FR-M3-08-3 (uguaglianza)** — *Dato* `Sp` = 16,00 mq e una finestra 1,00 × 2,00 m ad apertura totale; *allora* `Si = Sa = 2,00 = SfMin` → **Conforme · +0,00 mq**.
- **AC-FR-M3-08-4 (precisione)** — *Dato* `Sp` = 10,01 mq e un'apertura con `Sa` = 1,2512 mq; *allora* `SaMin = 1,25125` e l'esito è **Non conforme** (deficit −0,00005, mostrato come "−0,00 mq (valore esatto −0,00005)"). Il confronto non si fa sui valori arrotondati (`BR-22`).
- **AC-FR-M3-08-5 (quota di esclusione)** — *Dato* un profilo con quota di esclusione 0,60 m e una portafinestra 1,20 × 2,40 m con davanzale a 0,00 m; *allora* `Hi = 1,80 m`, `Si = 2,16 mq`, `Sa = 2,88 mq`, e la riga mostra la spiegazione dell'esclusione.
- **AC-FR-M3-08-6 (aggetto)** — *Dato* un profilo con aggetti oltre 1,20 m ed esclusione della fascia superiore con fattore 0,50, e una finestra 1,20 × 1,40 m con davanzale a 0,90 m sotto un balcone profondo 1,60 m; *allora* la fascia esclusa è 0,80 m, `Hi = 0,60 m`, `Si = 0,72 mq`, mentre `Sa = 1,68 mq` non cambia.
- **AC-FR-M3-08-7 (apribilità parziale)** — *Data* una vetrata 3,00 × 2,40 m con davanzale a 0,00 m, parziale con `Sa` = 1,20 mq, in un vano con `Sp` = 18,00 mq (profilo nazionale); *allora* `Si = 7,20 mq` (conforme, +4,95), `Sa = 1,20 mq` contro un minimo di 2,25 → **Non conforme · −1,05 mq aerante**.
- **AC-FR-M3-10-1 (tempo reale)** — *Dato* un vano aperto in modifica, *quando* l'utente cambia la larghezza di un'apertura, *allora* badge e valori si aggiornano senza alcuna azione in ≤ 100 ms (misurato sul dispositivo di riferimento).
- **AC-FR-M3-12-1 (Salva Casa non copre il R.A.I.)** — *Dato* un vano abitabile con `Hu` = 2,50 m e R.A.I. aerante con deficit −0,30 mq, *quando* l'architetto attiva D-01 con condizione (a) e motivazione, *allora* la verifica dell'altezza diventa **"Subordinata ad asseverazione"** ma il vano resta **"Non conforme"** per il R.A.I.
- **AC-FR-M3-12-2** — *Dato* un vano con `Hu` = 2,35 m, *quando* si attiva D-01, *allora* la verifica dell'altezza resta **Non conforme** (sotto il limite di 2,40 m).
- **AC-FR-M3-13-1 (bagno cieco)** — *Dato* un bagno marcato cieco con aspirazione meccanica, *allora* l'esito è **Ventilazione OK**, non richiede il R.A.I. e l'unità può risultare Conforme; *dato* lo stesso bagno senza aspirazione, *allora* l'esito è **Ventilazione KO** e l'unità risulta Non conforme.
- **AC-FR-M3-05-1 (montano)** — *Data* una commessa a 1.150 m s.l.m. e un soggiorno con `Hu` = 2,60 m, *allora* la verifica dell'altezza è **Conforme** (minimo 2,55 m); lo stesso vano a 800 m s.l.m. è **Non conforme** (minimo 2,70 m).
- **AC-FR-M3-01-1 (riproducibilità)** — *Data* una relazione emessa con il profilo X v3, *quando* l'Owner pubblica X v4 con soglie diverse, *allora* la relazione emessa e il suo snapshot restano invariati, e i vani della commessa si ricalcolano con v4 solo dopo una conferma esplicita.
