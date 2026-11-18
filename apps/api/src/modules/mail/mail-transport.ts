/** Mensaje de email ya armado (texto plano + HTML opcional). */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * Transporte de email. En la app: SMTP (Mailpit en desarrollo). En tests se reemplaza el
 * provider `MAIL_TRANSPORT` por uno que captura los mensajes en memoria.
 */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
