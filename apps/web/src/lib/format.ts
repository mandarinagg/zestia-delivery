/** Zona horaria por defecto hasta que el tenant defina la suya. */
export const DEFAULT_TIMEZONE = 'America/Asuncion';

/**
 * Formatea un monto entero en guaraníes: `25000` -> `Gs. 25.000`.
 * El guaraní no tiene decimales; un monto no entero es un error de programación.
 */
export function formatPYG(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`El monto debe ser un entero en guaraníes, recibido: ${amount}`);
  }
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}Gs. ${digits}`;
}

function parts(iso: string, timeZone: string): Record<string, string> {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Fecha inválida: ${iso}`);
  const formatter = new Intl.DateTimeFormat('es-PY', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

/** `2026-11-17T12:00:00Z` -> `17/11/2026` en la zona horaria indicada. */
export function formatDate(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = parts(iso, timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}

/** `2026-11-17T12:00:00Z` -> `09:00` (24 h) en la zona horaria indicada. */
export function formatTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = parts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** `2026-11-17T12:00:00Z` -> `17/11/2026 09:00`. */
export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return `${formatDate(iso, timeZone)} ${formatTime(iso, timeZone)}`;
}

/**
 * Duración operativa corta: `7` -> `7 min`, `65` -> `1 h 05`, `0` -> `< 1 min`.
 * Para "tiempo en el estado" de un pedido; recibe minutos.
 */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`Minutos inválidos: ${minutes}`);
  }
  const m = Math.floor(minutes);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Minutos enteros transcurridos entre dos instantes ISO (UTC). Nunca negativo. */
export function minutesBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (Number.isNaN(ms)) throw new RangeError('Fecha inválida');
  return Math.max(0, Math.floor(ms / 60_000));
}

/** Milisegundos que la hora local de `timeZone` está adelantada respecto de UTC en `ts`. */
function zoneOffsetMs(ts: number, timeZone: string): number {
  const p = parts(new Date(ts).toISOString(), timeZone);
  const second = new Date(ts).getUTCSeconds();
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, second);
  return wall - (ts - (ts % 1000));
}

/** `2026-11-17T12:00:00Z` -> `2026-11-17` (para `<input type="date">`) en la zona indicada. */
export function toDateInput(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = parts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Primer instante del día `YYYY-MM-DD` en la zona indicada, como ISO UTC:
 * `2026-11-18` en Asunción (UTC−3) -> `2026-11-18T03:00:00.000Z`.
 *
 * El offset sale de `Intl` (nada de `-03:00` fijo). Si ese día la medianoche no existe por un
 * cambio de hora, devuelve el primer instante que sí pertenece al día.
 */
export function zonedDayStartToUtc(day: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`Día inválido: ${day}`);
  const midnightAsUtc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
  if (Number.isNaN(midnightAsUtc)) throw new RangeError(`Día inválido: ${day}`);
  const first = midnightAsUtc - zoneOffsetMs(midnightAsUtc, timeZone);
  const second = midnightAsUtc - zoneOffsetMs(first, timeZone);
  const candidates = [first, second].filter(
    (ts) => toDateInput(new Date(ts).toISOString(), timeZone) === day,
  );
  return new Date(Math.min(...(candidates.length ? candidates : [first]))).toISOString();
}

/** `2026-11-18` -> `2026-11-19` (calendario, sin zona horaria). */
export function nextDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`Día inválido: ${day}`);
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]! + 1)).toISOString().slice(0, 10);
}
