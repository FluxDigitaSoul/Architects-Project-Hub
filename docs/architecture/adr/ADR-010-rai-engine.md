# ADR-010 — Motore R.A.I.: libreria pura condivisa e aritmetica decimale

**Stato:** Accettato · **Data:** 2026-09-18 · **Collegato a:** AFU FR-M3-05..16, BR-02, BR-21, BR-22, V-05

## Contesto

Il calcolo dei rapporti aeroilluminanti deve essere **identico** nel browser (feedback in tempo reale, ≤ 100 ms) e nel server (fa fede per relazioni e snapshot), riproducibile nel tempo e senza errori di arrotondamento binario: con i `number` di JavaScript, `20 * 0.125` è esatto ma `10.01 * 0.125` o somme di aree no, e un confronto con una soglia può invertire l'esito (AC-FR-M3-08-4).

## Decisione

- Pacchetto **`@aph/rai-engine`**, TypeScript **puro**: nessuna dipendenza da framework, nessun I/O, funzioni deterministiche senza effetti collaterali.
- **Aritmetica decimale** con `decimal.js` (istanza con precisione di 40 cifre significative e arrotondamento half-up). Input e output numerici sono **stringhe decimali** (es. `"2.70"`), mai `number`, così non si perde precisione nel passaggio JSON tra client e server.
- **Confronti con le soglie sui valori esatti**, mai sugli arrotondati (BR-22). L'arrotondamento a 2 decimali è compito della presentazione.
- **Parametrico:** tutte le soglie e regole di misura arrivano dal profilo normativo (`RegulationProfile`), niente valori normativi scritti nella logica. Il pacchetto fornisce i profili di sistema (D.M. 1975; D.M. 1975 + Salva Casa) e un modello "regolamento locale tipo" da validare.
- **Trasparente:** ogni risultato include le spiegazioni delle correzioni applicate (fasce escluse, aggetti, aperture non computate), per l'interfaccia (FR-M3-09) e per la relazione (FR-M5-20).
- **Corpus di regressione** (TC-R) nei test del pacchetto; lo stesso corpus girerà anche nei test del frontend per garantire l'equivalenza client/server (TC-R-99).

## Alternative considerate

| Alternativa                                                 | Perché no                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Calcolo solo lato server                                    | Niente feedback in tempo reale offline o con latenza; la UX del Modulo 3 lo richiede                  |
| Due implementazioni (TS nel client, SQL o altro nel server) | Rischio di divergenza; violerebbe V-05                                                                |
| `number` con arrotondamenti "furbi"                         | Fragile; errori nei casi al limite, proprio quelli che contano per la conformità                      |
| `big.js`                                                    | Adatto anche lui; `decimal.js` offre più funzioni (confronti, clamp, formattazione) con un'API simile |

## Conseguenze

- La regola della profondità del vano (FR-M3 "Should") e i suggerimenti di adeguamento (FR-M3-11) si aggiungeranno come estensioni del profilo e del motore, con nuovi casi nel corpus.
- Qualunque modifica al motore richiede un nuovo caso di test o l'aggiornamento motivato di uno esistente.
