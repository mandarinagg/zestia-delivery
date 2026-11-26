import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { ENV, type Env } from '../../config/env';
import type { MailMessage, MailTransport } from './mail-transport';

/** Envío por SMTP con nodemailer (sin logs propios: no deben salir destinatarios ni cuerpos). */
@Injectable()
export class SmtpMailTransport implements MailTransport, OnModuleDestroy {
  private readonly transporter: ReturnType<typeof createTransport>;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.from = env.MAIL_FROM;
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      // En producción se exige TLS verificado; en desarrollo Mailpit no ofrece STARTTLS.
      requireTLS: env.NODE_ENV === 'production' && !env.SMTP_SECURE,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
      debug: false,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
