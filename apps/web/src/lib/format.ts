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
