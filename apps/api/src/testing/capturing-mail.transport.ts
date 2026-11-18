import { Injectable } from '@nestjs/common';
import type { MailMessage, MailTransport } from '../modules/mail';

/** SOLO TESTS. Transporte de email en memoria (reemplaza SMTP en `createTestApp()`). */
@Injectable()
export class CapturingMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  /** El próximo envío falla (simula el SMTP caído). */
  failNext = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP no disponible (simulado)');
    }
    this.sent.push(message);
  }

  /** Espera un mensaje para `to` (el envío del reset es en segundo plano). */
  async waitFor(to: string, timeoutMs = 3_000): Promise<MailMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.sent.find((m) => m.to === to);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`no llegó ningún email para ${to}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  to(address: string): MailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }
}
