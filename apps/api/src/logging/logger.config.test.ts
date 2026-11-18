import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logger.config';

describe('redacción de logs', () => {
  it('oculta secretos y PII', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    log.info({
      req: { headers: { authorization: 'Bearer abc' } },
      user: { email: 'a@b.c', password: 'p', name: 'visible' },
    });
    const out = lines.join('');
    expect(out).not.toContain('Bearer abc');
    expect(out).not.toContain('a@b.c');
    expect(out).toContain('visible');
  });

  it('oculta cookies de sesión, token CSRF y datos de autenticación', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    log.info({
      req: {
        headers: { cookie: '__Host-zd_session=SESSION-SECRET', 'x-csrf-token': 'CSRF-SECRET' },
        body: { email: 'ana@example.com', password: 'PW-SECRET' },
      },
      res: { headers: { 'set-cookie': ['__Host-zd_session=NEW-SECRET'] } },
      mail: { to: 'ana@example.com' },
      input: { currentPassword: 'OLD-PW', newPassword: 'NEW-PW', csrfToken: 'CSRF-2' },
    });
    const out = lines.join('');
    for (const secret of [
      'SESSION-SECRET',
      'CSRF-SECRET',
      'ana@example.com',
      'PW-SECRET',
      'NEW-SECRET',
      'OLD-PW',
      'NEW-PW',
      'CSRF-2',
    ]) {
      expect(out).not.toContain(secret);
    }
  });
});
