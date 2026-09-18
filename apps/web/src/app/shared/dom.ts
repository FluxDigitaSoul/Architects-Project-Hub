/** Valore di un input/select da un evento DOM (template senza FormsModule). */
export const val = (e: Event): string => (e.target as HTMLInputElement | HTMLSelectElement).value;

/** Normalizza un numero digitato all'italiana ("2,70") nel formato del motore ("2.70"). */
export const num = (e: Event): string => val(e).trim().replace(',', '.');
