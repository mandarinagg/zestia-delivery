import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';

const PASSWORD = 'una contraseña bien larga';
const LIMITS = {
  // Detrás de un proxy de confianza: la IP del cliente sale de X-Forwarded-For.
  TRUST_PROXY_HOPS: '1',
  LOGIN_RATE_WINDOW_MINUTES: '15',
  LOGIN_RATE_MAX_PER_ACCOUNT: '3',
  LOGIN_RATE_MAX_PER_IP: '6',
};

/** IP de cliente distinta por test (los contadores por IP viven en la DB compartida). */
const randomIp = (): string => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

describe('rate limit de login (en Postgres, compartido entre instancias)', () => {
  let app: TestApp;
  let other: TestApp;
  let seeder: TestSeeder;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    // Dos instancias de la API sobre la misma DB, como en producción con réplicas.
    app = await createTestApp({ auth: 'session', env: LIMITS });
    other = await createTestApp({ auth: 'session', env: LIMITS });
  });

  afterAll(async () => {
    await app.close();
    await other.close();
    await seeder.close();
  });

  const loginFrom = (target: TestApp, ip: string, email: string, password: string) =>
    request(target.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email, password });

  /** Simula que pasó el tiempo: corre hacia atrás los intentos de una cuenta. */
  const age = (account: string, minutes: number) =>
    seeder.query(
      `UPDATE auth_attempts SET attempted_at = attempted_at - make_interval(mins => $2)
       WHERE account_key = sha256(convert_to($1, 'UTF8'))`,
      [account, minutes],
    );

  it('por cuenta: tras 3 fallos, 429 con Retry-After, incluso con la contraseña correcta', async () => {
    const ip = randomIp();
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    for (let i = 0; i < 3; i++) await loginFrom(app, ip, email, `mala-${i}`).expect(401);

    const res = await loginFrom(app, ip, email, PASSWORD).expect(429);
    expect(res.body).toEqual({ statusCode: 429, code: 'TOO_MANY_ATTEMPTS' });
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Los rechazos por rate limit no se registran como intentos ni en la auditoría.
    const [attempts] = await seeder.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_attempts WHERE account_key = sha256(convert_to($1, 'UTF8'))`,
      [email],
    );
    expect(attempts?.n).toBe(3);
    const audit = await seeder.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY occurred_at`,
      [userId],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'auth.login.failed',
      'auth.login.failed',
      'auth.login.failed',
    ]);
  });

  it('se libera cuando los fallos salen de la ventana', async () => {
    const ip = randomIp();
    const { email } = await seeder.userWithPassword(PASSWORD);
    for (let i = 0; i < 3; i++) await loginFrom(app, ip, email, `mala-${i}`).expect(401);
    await loginFrom(app, ip, email, PASSWORD).expect(429);

    await age(email, 16);
    await loginFrom(app, ip, email, PASSWORD).expect(200);
  });

  it('un login exitoso reinicia el contador de la cuenta', async () => {
    const ip = randomIp();
    const { email } = await seeder.userWithPassword(PASSWORD);
    for (let round = 0; round < 2; round++) {
      await loginFrom(app, ip, email, 'mala-1').expect(401);
      await loginFrom(app, ip, email, 'mala-2').expect(401);
      await loginFrom(app, ip, email, PASSWORD).expect(200);
    }
  });

  it('emails desconocidos se limitan igual (el 429 no revela si la cuenta existe)', async () => {
    const ip = randomIp();
    const email = `nadie-${randomInt(1e9)}@test.invalid`;
    for (let i = 0; i < 3; i++) await loginFrom(app, ip, email, 'x').expect(401);
    await loginFrom(app, ip, email, 'x').expect(429);
  });

  it('por IP: muchas cuentas distintas desde la misma IP → 429; otra IP no se ve afectada', async () => {
    const ip = randomIp();
    for (let i = 0; i < 6; i++) {
      await loginFrom(app, ip, `spray-${i}-${randomInt(1e9)}@test.invalid`, 'x').expect(401);
    }
    const { email } = await seeder.userWithPassword(PASSWORD);
    await loginFrom(app, ip, email, PASSWORD).expect(429);
    await loginFrom(app, randomIp(), email, PASSWORD).expect(200);
  });

  it('el límite se comparte entre instancias de la API', async () => {
    const ip = randomIp();
    const { email } = await seeder.userWithPassword(PASSWORD);
    await loginFrom(app, ip, email, 'mala-1').expect(401);
    await loginFrom(other, ip, email, 'mala-2').expect(401);
    await loginFrom(app, ip, email, 'mala-3').expect(401);
    await loginFrom(other, ip, email, PASSWORD).expect(429);
    await loginFrom(app, ip, email, PASSWORD).expect(429);
  });

  it('intentos concurrentes no superan el cupo de la cuenta', async () => {
    const ip = randomIp();
    const { email } = await seeder.userWithPassword(PASSWORD);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => loginFrom(i % 2 ? app : other, ip, email, `mala-${i}`)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 401)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });
});
