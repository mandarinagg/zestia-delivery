import type { MembershipRole } from '../../generated/prisma/enums';
import type { MailMessage } from '../mail';

/**
 * Ruta del frontend para aceptar una invitación. El token va en el FRAGMENTO (`#token=`): el
 * navegador no lo manda al servidor web ni en la cabecera Referer (igual que el reset).
 */
export const ACCEPT_INVITATION_PATH = '/invitacion';

export const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  COURIER: 'Repartidor',
  MERCHANT: 'Comercio',
};

export function invitationLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl}${ACCEPT_INVITATION_PATH}#token=${encodeURIComponent(token)}`;
}

/** Nombres de empresa y de personas los escribe un usuario: se escapan en el HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function describeTtl(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 día' : `${days} días`;
  }
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

export function invitationMail(input: {
  to: string;
  tenantName: string;
  inviterName: string | null;
  role: MembershipRole;
  webBaseUrl: string;
  token: string;
  ttlHours: number;
}): MailMessage {
  const link = invitationLink(input.webBaseUrl, input.token);
  const role = ROLE_LABEL[input.role];
  const who = input.inviterName ?? 'Alguien de la empresa';
  const ttl = describeTtl(input.ttlHours);
  const text = [
    'Hola:',
    '',
    `${who} te invitó a sumarte a ${input.tenantName} en ZESTIA DELIVERY con el rol ${role}.`,
    `Para aceptar, abrí este enlace (vence en ${ttl} y sirve una sola vez):`,
    '',
    link,
    '',
    'Si no esperabas esta invitación, ignorá este mensaje.',
  ].join('\n');
  const html = [
    '<p>Hola:</p>',
    `<p>${escapeHtml(who)} te invitó a sumarte a <strong>${escapeHtml(input.tenantName)}</strong> en ZESTIA DELIVERY con el rol ${role}.</p>`,
    `<p>Para aceptar, abrí este enlace (vence en ${ttl} y sirve una sola vez):</p>`,
    `<p><a href="${link}">Aceptar la invitación</a></p>`,
    '<p>Si no esperabas esta invitación, ignorá este mensaje.</p>',
  ].join('\n');
  return {
    to: input.to,
    subject: `Te invitaron a ${input.tenantName} en ZESTIA DELIVERY`,
    text,
    html,
  };
}
