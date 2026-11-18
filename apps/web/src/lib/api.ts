import { CSRF_HEADER, errorResponseSchema } from '@zestia/contracts';
import type { z } from 'zod';

/**
 * Cliente HTTP de la API. Misma origen que la web (`/api/...`, proxy de Vite en desarrollo):
 * la sesión viaja en una cookie httpOnly que el navegador manda solo; acá no se guarda ningún
 * secreto de sesión.
 *
 * El token CSRF (no es secreto de sesión: solo prueba que la request sale de esta app) vive en
 * memoria y se manda en `X-CSRF-Token` en toda mutación. Se actualiza con cada respuesta de
 * sesión (login, `me`, cambio de empresa o de contraseña).
 */

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Error de la API con su `code` (contrato `{ statusCode, code }`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Segundos de `Retry-After` (429). */
    readonly retryAfter: number | null = null,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

/** Sin respuesta del servidor (red caída, proxy apagado). */
export class NetworkError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor');
    this.name = 'NetworkError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions<S extends z.ZodType | undefined> {
  method?: Method;
  body?: unknown;
  /** Esquema de la respuesta (de `@zestia/contracts`). Sin esquema: se ignora el cuerpo. */
  schema?: S;
  signal?: AbortSignal;
}

export async function api<S extends z.ZodType | undefined = undefined>(
  path: `/${string}`,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.output<S> : void> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }

  if (!response.ok) throw await toApiError(response);
  if (!options.schema || response.status === 204) {
    return undefined as S extends z.ZodType ? z.output<S> : void;
  }
  // Una respuesta que no cumple el contrato es un error de programación: que se note.
  return options.schema.parse(await response.json()) as S extends z.ZodType ? z.output<S> : void;
}

async function toApiError(response: Response): Promise<ApiError> {
  const retry = Number(response.headers.get('Retry-After'));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(response.status, parsed.data.code, retryAfter, parsed.data.issues ?? []);
    }
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return new ApiError(response.status, `HTTP_${response.status}`, retryAfter);
}

/** Texto para una persona a partir de un error de la API (sin detalles técnicos). */
export function describeApiError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'TOO_MANY_ATTEMPTS') {
      const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
      return minutes
        ? `Hubo demasiados intentos. Esperá ${minutes === 1 ? '1 minuto' : `${minutes} minutos`} y probá de nuevo.`
        : 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.';
    }
    if (error.code === 'CSRF_ORIGIN_REJECTED' || error.code === 'CSRF_TOKEN_INVALID') {
      return 'Tu sesión se desactualizó. Recargá la página y probá de nuevo.';
    }
  }
  return 'Algo salió mal de nuestro lado. Probá de nuevo en un momento.';
}
