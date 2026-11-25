import {
  SESSION_ABSOLUTE_REMAINING_HEADER,
  SESSION_IDLE_REMAINING_HEADER,
} from '@zestia/contracts';

/**
 * Cuándo vence la sesión, según lo que informó la API (#14).
 *
 * La API manda SEGUNDOS RESTANTES (`X-Session-Idle-Remaining`, `X-Session-Absolute-Remaining`),
 * no fechas: acá se convierten a instantes de ESTE reloj (`Date.now() + segundos * 1000`), así
 * que un reloj del equipo desfasado no cambia el aviso. Esto es solo una estimación para avisar:
 * el que decide si la sesión vive es el servidor (por eso, al llegar a cero, se le pregunta).
 *
 * Las pestañas comparten el estado por `localStorage` + evento `storage`: otra pestaña activa
 * renueva la MISMA sesión, así que siempre vale el vencimiento más tardío que se informó.
 *
 * Generación: un contador que sube con cada logout, 401 o login nuevo (también compartido). Un
 * pedido anota la generación al salir y, si al volver ya cambió, su respuesta se descarta: una
 * respuesta lenta de la sesión anterior no puede revivir los vencimientos después del logout.
 */
export interface SessionDeadlines {
  /** Instante (ms) en que vence por inactividad. */
  readonly idle: number;
  /** Instante (ms) en que vence el tiempo máximo de la sesión. */
  readonly absolute: number;
}

export const SESSION_DEADLINES_KEY = 'zestia.session.deadlines';
export const SESSION_GENERATION_KEY = 'zestia.session.generation';

let generation = readGeneration();
let current: SessionDeadlines | null = read();
const listeners = new Set<() => void>();

function readGeneration(): number {
  try {
    return parseGeneration(window.localStorage.getItem(SESSION_GENERATION_KEY)) ?? 0;
  } catch {
    return 0;
  }
}

function parseGeneration(raw: string | null): number | null {
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Lo guardado solo vale si es de la generación actual (si no, es de una sesión anterior). */
function read(): SessionDeadlines | null {
  try {
    return parse(window.localStorage.getItem(SESSION_DEADLINES_KEY));
  } catch {
    return null;
  }
}

interface Stored extends SessionDeadlines {
  readonly gen: number;
}

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored> | null;
    return Number.isFinite(value?.idle) &&
      Number.isFinite(value?.absolute) &&
      Number.isInteger(value?.gen)
      ? { idle: value!.idle!, absolute: value!.absolute!, gen: value!.gen! }
      : null;
  } catch {
    return null;
  }
}

function parse(raw: string | null): SessionDeadlines | null {
  const stored = parseStored(raw);
  return stored && stored.gen === generation
    ? { idle: stored.idle, absolute: stored.absolute }
    : null;
}

function persist(value: SessionDeadlines | null): void {
  try {
    if (value) {
      window.localStorage.setItem(
        SESSION_DEADLINES_KEY,
        JSON.stringify({ ...value, gen: generation }),
      );
    } else window.localStorage.removeItem(SESSION_DEADLINES_KEY);
  } catch {
    /* sin persistencia: cada pestaña usa lo que le informó la API */
  }
}

function set(value: SessionDeadlines | null): void {
  if (value?.idle === current?.idle && value?.absolute === current?.absolute) return;
  current = value;
  for (const listener of listeners) listener();
}

/** Se queda con el más tardío de cada vencimiento (una respuesta lenta puede llegar vieja). */
function latest(a: SessionDeadlines | null, b: SessionDeadlines): SessionDeadlines {
  return a ? { idle: Math.max(a.idle, b.idle), absolute: Math.max(a.absolute, b.absolute) } : b;
}

export function getSessionDeadlines(): SessionDeadlines | null {
  return current;
}

export function subscribeSessionDeadlines(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Generación actual: un pedido la anota al salir y la pasa al registrar su respuesta. */
export function sessionGeneration(): number {
  return generation;
}

/**
 * Registra el tiempo restante que informó la API (en segundos) y lo comparte con otras pestañas.
 * `fromGeneration`: la del momento en que salió el pedido; si ya cambió, se descarta.
 */
export function recordSessionRemaining(
  idleSeconds: number,
  absoluteSeconds: number,
  now: number = Date.now(),
  fromGeneration: number = generation,
): void {
  if (fromGeneration !== generation) return;
  const merged = latest(current, {
    idle: now + idleSeconds * 1000,
    absolute: now + absoluteSeconds * 1000,
  });
  persist(merged);
  set(merged);
}

/** Lee los headers de una respuesta con sesión válida. Sin ambos headers, no hace nada. */
export function recordSessionHeaders(headers: Headers, fromGeneration: number = generation): void {
  const idle = secondsFrom(headers.get(SESSION_IDLE_REMAINING_HEADER));
  const absolute = secondsFrom(headers.get(SESSION_ABSOLUTE_REMAINING_HEADER));
  if (idle !== null && absolute !== null) {
    recordSessionRemaining(idle, absolute, Date.now(), fromGeneration);
  }
}

function secondsFrom(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * La sesión terminó (logout, 401) o va a empezar otra (login): se olvida en todas las pestañas
 * y sube la generación, así que las respuestas de pedidos que salieron antes se descartan.
 */
export function clearSessionDeadlines(): void {
  generation += 1;
  try {
    window.localStorage.setItem(SESSION_GENERATION_KEY, String(generation));
  } catch {
    /* sin persistencia */
  }
  persist(null);
  set(null);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_GENERATION_KEY) {
      // Otra pestaña cerró o abrió una sesión: lo que esta tenía ya no vale.
      const incoming = parseGeneration(event.newValue);
      if (incoming !== null && incoming > generation) {
        generation = incoming;
        set(null);
      }
      return;
    }
    if (event.key !== null && event.key !== SESSION_DEADLINES_KEY) return;
    const stored = parseStored(event.newValue);
    if (stored && stored.gen > generation) {
      // Esa pestaña ya está en una sesión más nueva que la de esta.
      generation = stored.gen;
      set(null);
    }
    const incoming = parse(event.newValue);
    // Otra pestaña cerró la sesión (o `localStorage.clear()`): acá también terminó.
    // Si no, se suma al propio: gana el más tardío.
    set(incoming ? latest(current, incoming) : null);
  });
}
