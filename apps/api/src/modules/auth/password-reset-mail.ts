import type { MailMessage } from '../mail';

/**
 * Ruta del frontend para restablecer la contraseña (la pantalla es #20). El token va en el
 * FRAGMENTO (`#token=`): el navegador no lo manda al servidor web ni en la cabecera Referer.
 */
export const RESET_PASSWORD_PATH = '/restablecer-contrasena';

export function passwordResetLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl}${RESET_PASSWORD_PATH}#token=${encodeURIComponent(token)}`;
}

export function passwordResetMail(
  to: string,
  webBaseUrl: string,
  token: string,
  ttlMinutes: number,
): MailMessage {
  const link = passwordResetLink(webBaseUrl, token);
  const text = [
    'Hola:',
    '',
    'Recibimos un pedido para restablecer la contraseña de tu cuenta de ZESTIA DELIVERY.',
    `Para elegir una nueva, abrí este enlace (vence en ${ttlMinutes} minutos y sirve una sola vez):`,
    '',
    link,
    '',
    'Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.',
  ].join('\n');
  const html = [
    '<p>Hola:</p>',
    '<p>Recibimos un pedido para restablecer la contraseña de tu cuenta de ZESTIA DELIVERY.</p>',
    `<p>Para elegir una nueva, abrí este enlace (vence en ${ttlMinutes} minutos y sirve una sola vez):</p>`,
    `<p><a href="${link}">Restablecer contraseña</a></p>`,
    '<p>Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.</p>',
  ].join('\n');
  return { to, subject: 'Restablecer tu contraseña de ZESTIA DELIVERY', text, html };
}
