/**
 * Every appointment time is an integer count of minutes since LOCAL midnight. Formatting is the
 * only place that ever turns one into text, and a value past 1440 is a genuine next-day time —
 * never wrapped, or the UI would claim the team got home before it left.
 */
export function formatClock(minutes: number): string {
  const nextDay = minutes >= 1440;
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${nextDay ? ' +1d' : ''}`;
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatKm(metres: number): string {
  return `${Math.round(metres / 1000)} km`;
}

const BEIRUT = 'Asia/Beirut';

/** The team's "today" is a Beirut calendar day, never the browser's or the server's. */
export function beirutToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIRUT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
