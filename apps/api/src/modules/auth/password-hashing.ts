import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contraseñas con Argon2id (`node:crypto`, OpenSSL; Node ≥ 24.7), en formato PHC:
 * `$argon2id$v=19$m=<KiB>,t=<pasadas>,p=<paralelismo>$<salt b64>$<hash b64>`.
 *
 * Parámetros: mínimo recomendado por OWASP (Password Storage Cheat Sheet) para Argon2id:
 * m = 19 MiB, t = 2, p = 1. Salt aleatorio de 16 bytes, hash de 32 bytes. Si se suben los
 * parámetros, `needsRehash()` lo detecta y el login re-hashea la contraseña.
 *
 * La contraseña se normaliza a Unicode NFKC antes de derivar (misma contraseña escrita con
 * distintas composiciones de caracteres = mismo hash).
 */
export interface Argon2Params {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

export const ARGON2_PARAMS: Argon2Params = { memory: 19_456, passes: 2, parallelism: 1 };

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const VERSION = 19;

/** Topes al leer un hash guardado (evita que un valor manipulado dispare un cálculo enorme). */
const LIMITS = { memory: [8_192, 1_048_576], passes: [1, 10], parallelism: [1, 16] } as const;

interface ParsedHash extends Argon2Params {
  readonly salt: Buffer;
  readonly hash: Buffer;
}

const PHC_RE = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const b64 = (buf: Buffer): string => buf.toString('base64').replace(/=+$/, '');

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parsePasswordHash(phc: string): ParsedHash | null {
  const m = PHC_RE.exec(phc);
  if (!m) return null;
  const [, version, memory, passes, parallelism, salt, hash] = m as unknown as string[];
  const params = {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  };
  if (
    Number(version) !== VERSION ||
    !inRange(params.memory, LIMITS.memory) ||
    !inRange(params.passes, LIMITS.passes) ||
    !inRange(params.parallelism, LIMITS.parallelism) ||
    params.memory < 8 * params.parallelism
  ) {
    return null;
  }
  const saltBuf = Buffer.from(salt ?? '', 'base64');
  const hashBuf = Buffer.from(hash ?? '', 'base64');
  if (saltBuf.length < 8 || hashBuf.length < 16) return null;
  return { ...params, salt: saltBuf, hash: hashBuf };
}

function derive(password: string, salt: Buffer, params: Argon2Params, tagLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password.normalize('NFKC'), 'utf8'),
        nonce: salt,
        parallelism: params.parallelism,
        tagLength,
        memory: params.memory,
        passes: params.passes,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(
  password: string,
  params: Argon2Params = ARGON2_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, params, HASH_BYTES);
  return `$argon2id$v=${VERSION}$m=${params.memory},t=${params.passes},p=${params.parallelism}$${b64(salt)}$${b64(hash)}`;
}

/** Comparación en tiempo constante. Un hash con formato inválido nunca verifica. */
export async function verifyPassword(phc: string, password: string): Promise<boolean> {
  const parsed = parsePasswordHash(phc);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed, parsed.hash.length);
  return timingSafeEqual(candidate, parsed.hash);
}

/** `true` si el hash usa parámetros distintos de los actuales (hay que re-hashear). */
export function needsRehash(phc: string, params: Argon2Params = ARGON2_PARAMS): boolean {
  const parsed = parsePasswordHash(phc);
  return (
    !parsed ||
    parsed.memory !== params.memory ||
    parsed.passes !== params.passes ||
    parsed.parallelism !== params.parallelism ||
    parsed.salt.length !== SALT_BYTES ||
    parsed.hash.length !== HASH_BYTES
  );
}

/** Falla al arrancar si el runtime no trae Argon2 (Node < 24.7). */
export function assertArgon2Available(): void {
  if (typeof argon2 !== 'function') {
    throw new Error('node:crypto.argon2 no está disponible: se requiere Node.js 24.7 o superior.');
  }
}
