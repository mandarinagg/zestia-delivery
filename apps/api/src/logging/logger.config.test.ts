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
});
