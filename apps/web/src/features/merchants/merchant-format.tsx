import type { MerchantStatus, OpeningHours, Weekday } from '@zestia/contracts';
import { WEEKDAYS } from '@zestia/contracts';
import { TONE_CLASS } from '@/components/ui/tone';
import type { Tone } from '@/lib/order-states';
import { cn } from '@/lib/utils';

export const MERCHANT_STATUS_LABEL: Record<MerchantStatus, string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  ARCHIVED: 'Archivado',
};

const STATUS_TONE: Record<MerchantStatus, Tone> = {
  ACTIVE: 'green',
  SUSPENDED: 'amber',
  ARCHIVED: 'slate',
};

/** Estado del comercio: color + texto (el color nunca va solo). */
export function MerchantStatusBadge({
  status,
  className,
}: {
  status: MerchantStatus;
  className?: string;
}) {
  const tone = TONE_CLASS[STATUS_TONE[status]];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4',
        tone.bg,
        tone.fg,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone.solid)} />
      {MERCHANT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Teléfono E.164 para leer: los de Paraguay en formato local (`+595981123456` → `0981 123 456`);
 * el resto, tal cual.
 */
export function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const local = phone.startsWith('+595') ? `0${phone.slice(4)}` : null;
  if (!local) return phone;
  if (/^09\d{8}$/.test(local)) return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  if (/^0\d{8}$/.test(local)) return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return local;
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
};

/** Horario legible por día; días sin franjas = "Cerrado". */
export function describeHours(hours: OpeningHours): { day: Weekday; text: string }[] {
  return WEEKDAYS.map((day) => {
    const ranges = hours[day] ?? [];
    return {
      day,
      text: ranges.length ? ranges.map((r) => `${r.from}–${r.to}`).join(', ') : 'Cerrado',
    };
  });
}
