import type { Tone } from '@/lib/order-states';

/** Clases estáticas por tono (Tailwind necesita los nombres completos en el código). */
export const TONE_CLASS: Record<
  Tone,
  { bg: string; fg: string; solid: string; text: string; border: string }
> = {
  slate: {
    bg: 'bg-tone-slate-bg',
    fg: 'text-tone-slate-fg',
    solid: 'bg-tone-slate-solid',
    text: 'text-tone-slate-solid',
    border: 'border-tone-slate-solid',
  },
  blue: {
    bg: 'bg-tone-blue-bg',
    fg: 'text-tone-blue-fg',
    solid: 'bg-tone-blue-solid',
    text: 'text-tone-blue-solid',
    border: 'border-tone-blue-solid',
  },
  teal: {
    bg: 'bg-tone-teal-bg',
    fg: 'text-tone-teal-fg',
    solid: 'bg-tone-teal-solid',
    text: 'text-tone-teal-solid',
    border: 'border-tone-teal-solid',
  },
  violet: {
    bg: 'bg-tone-violet-bg',
    fg: 'text-tone-violet-fg',
    solid: 'bg-tone-violet-solid',
    text: 'text-tone-violet-solid',
    border: 'border-tone-violet-solid',
  },
  green: {
    bg: 'bg-tone-green-bg',
    fg: 'text-tone-green-fg',
    solid: 'bg-tone-green-solid',
    text: 'text-tone-green-solid',
    border: 'border-tone-green-solid',
  },
  red: {
    bg: 'bg-tone-red-bg',
    fg: 'text-tone-red-fg',
    solid: 'bg-tone-red-solid',
    text: 'text-tone-red-solid',
    border: 'border-tone-red-solid',
  },
  amber: {
    bg: 'bg-tone-amber-bg',
    fg: 'text-tone-amber-fg',
    solid: 'bg-tone-amber-solid',
    text: 'text-tone-amber-solid',
    border: 'border-tone-amber-solid',
  },
  earth: {
    bg: 'bg-tone-earth-bg',
    fg: 'text-tone-earth-fg',
    solid: 'bg-tone-earth-solid',
    text: 'text-tone-earth-solid',
    border: 'border-tone-earth-solid',
  },
};

/** Alias genéricos para estados que no son de pedido (avisos, formularios, sistema). */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const GENERIC_TONE: Record<StatusTone, Tone> = {
  neutral: 'slate',
  info: 'blue',
  success: 'green',
  warning: 'amber',
  danger: 'red',
};

export function resolveTone(tone: Tone | StatusTone): Tone {
  return tone in GENERIC_TONE ? GENERIC_TONE[tone as StatusTone] : (tone as Tone);
}
