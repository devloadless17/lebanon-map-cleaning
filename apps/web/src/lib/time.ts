/**
 * Every appointment time is an integer count of minutes since LOCAL midnight. Formatting is the
 * only place that ever turns one into text, and a value past 1440 is a genuine next-day time —
 * never wrapped, or the UI would claim the team got home before it left.
 */
export function formatClock(minutes: number): string {
  const nextDay = minutes >= 1440;
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  // 12-hour, because this is read aloud to customers on the phone. Midnight is 12 AM and noon
  // is 12 PM, which is the one place a naive h % 12 gives 0 and looks broken.
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}${nextDay ? ' +1d' : ''}`;
}

/**
 * Accepts what people actually type: "5:30 PM", "5pm", "17:30", "5.30pm".
 *
 * A bare "5" is deliberately rejected — it could be morning or evening, and silently guessing
 * would book someone twelve hours out. Requiring either a colon or an am/pm marker also stops
 * a half-typed value being committed while the user is still typing.
 */
export function parseClock(value: string): number | null {
  const text = value.trim().toLowerCase().replace(/\./g, ':');
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];

  if (minutes > 59) return null;
  if (match[2] === undefined && !meridiem) return null; // bare "5" is ambiguous

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

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

/**
 * A detour, at a resolution that does it justice.
 *
 * Rounding to whole kilometres printed the near-zero detours as "+0 km" — and those are exactly
 * the slots the product exists to find, so its best answer read like a rendering fault.
 */
export function formatDistanceDelta(metres: number): string {
  const rounded = Math.round(metres);
  if (Math.abs(rounded) < 1000) return `${rounded} m`;
  const km = rounded / 1000;
  return `${Math.abs(km) < 10 ? km.toFixed(1) : Math.round(km)} km`;
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

/** Minutes since local midnight in Beirut — the same clock the schedule is stored in. */
export function beirutMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Beirut',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
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
