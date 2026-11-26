import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from './mail-transport';
import { SmtpMailTransport } from './smtp-mail.transport';

/**
 * Email saliente. Mínimo para el reset de contraseña (#14); las notificaciones de negocio
 * (outbox + pg-boss, reintentos) llegan más adelante.
 */
@Module({
  providers: [{ provide: MAIL_TRANSPORT, useClass: SmtpMailTransport }],
  exports: [MAIL_TRANSPORT],
})
export class MailModule {}
