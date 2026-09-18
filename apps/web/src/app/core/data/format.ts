import { formatDecimalIt } from '@aph/rai-engine';

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const fmtDate = (iso: string): string => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso: string): string => dateTimeFmt.format(new Date(iso));

/** "oggi", "ieri", "3 g fa"… */
export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 30) return `${days} g fa`;
  return fmtDate(iso);
}

/** Metri quadrati / metri con virgola italiana. */
export const fmtNum = (value: string | null | undefined, decimals = 2): string =>
  value == null ? '—' : formatDecimalIt(value, decimals);

export const fmtSigned = (value: string): string =>
  value.startsWith('-') ? fmtNum(value) : `+${fmtNum(value)}`;
