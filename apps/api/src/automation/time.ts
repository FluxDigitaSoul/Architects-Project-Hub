/**
 * Date e orari nel fuso degli studi (Europe/Rome, AFU FR-MT-04): scadenze di revisione, ora del
 * riepilogo giornaliero e dei job quotidiani. Nessuna libreria: bastano Intl e l'offset del fuso.
 */
export const STUDIO_TIME_ZONE = 'Europe/Rome';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

interface ZonedParts {
  date: string; // YYYY-MM-DD
  minutes: number; // minuti dalla mezzanotte locale
}

export function zonedParts(at: Date): ZonedParts {
  const p = Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p['year']}-${p['month']}-${p['day']}`, minutes: Number(p['hour']) * 60 + Number(p['minute']) };
}

/** Giorno di calendario locale (YYYY-MM-DD). */
export function localDate(at: Date): string {
  return zonedParts(at).date;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Istante UTC corrispondente a una data e un'ora locali (gestisce l'ora legale). */
export function zonedToUtc(date: string, hour: number, minute = 0): Date {
  const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const local = zonedParts(guess);
  const localAsUtc = Date.UTC(
    Number(local.date.slice(0, 4)), Number(local.date.slice(5, 7)) - 1, Number(local.date.slice(8, 10)),
    Math.floor(local.minutes / 60), local.minutes % 60,
  );
  return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
}

/** Prossimo invio del riepilogo giornaliero (FR-MT-06): oggi o domani alle `hour` locali. */
export function nextDailySlot(now: Date, hour: number): Date {
  const today = zonedToUtc(localDate(now), hour);
  return today > now ? today : zonedToUtc(addDays(localDate(now), 1), hour);
}

/** Data italiana per i testi delle email. */
export function formatDateIt(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
