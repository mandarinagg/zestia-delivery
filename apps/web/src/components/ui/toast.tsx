import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/*
 * Avisos (toasts). Confirman lo que acaba de pasar con el mismo verbo de la acción
 * ("Asignar" -> "Asignado") y ofrecen deshacer cuando se puede.
 * - Éxito/info: región polite (no interrumpe). Error: role="alert".
 * - Se pausan con hover o foco. Duración por defecto 5 s; los errores no se cierran solos.
 */

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms; 0 = no se cierra solo. */
  duration?: number;
}

interface ToastEntry extends ToastInput {
  id: number;
  open: boolean;
}

let entries: ToastEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(input: ToastInput): number {
  const id = ++seq;
  entries = [...entries.slice(-3), { ...input, id, open: true }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  entries = entries.map((t) => (t.id === id ? { ...t, open: false } : t));
  emit();
  setTimeout(() => {
    entries = entries.filter((t) => t.id !== id);
    emit();
  }, 160);
}

/** Solo para tests. */
export function resetToasts() {
  entries = [];
  emit();
}

function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
    () => entries,
  );
}

const ICON = { neutral: Info, success: CircleCheck, danger: CircleAlert };
const ICON_CLASS = {
  neutral: 'text-tone-blue-solid',
  success: 'text-tone-green-solid',
  danger: 'text-tone-red-solid',
};

function ToastItem({ t }: { t: ToastEntry }) {
  const tone = t.tone ?? 'neutral';
  const duration = t.duration ?? (tone === 'danger' ? 0 : 5000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);

  useEffect(() => {
    if (!duration || paused || !t.open) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToast(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [duration, paused, t.id, t.open]);

  const Icon = ICON[tone];
  return (
    <li
      data-state={t.open ? 'open' : 'closed'}
      className="zd-toast pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-raised p-3 pr-2 text-foreground shadow-overlay"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', ICON_CLASS[tone])} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-5">{t.title}</p>
        {t.description ? (
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{t.description}</p>
        ) : null}
      </div>
      {t.action ? (
        <button
          type="button"
          className="h-8 shrink-0 rounded-sm px-2 pointer-coarse:h-11 text-[0.8125rem] font-semibold text-brand-ink underline-offset-4 hover:bg-brand-soft hover:underline"
          onClick={() => {
            t.action!.onClick();
            dismissToast(t.id);
          }}
        >
          {t.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="inline-flex size-8 shrink-0 items-center pointer-coarse:size-11 justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => dismissToast(t.id)}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

export function Toaster() {
  const list = useToasts();
  const polite = list.filter((t) => t.tone !== 'danger');
  const urgent = list.filter((t) => t.tone === 'danger');
  const cls = 'pointer-events-none flex flex-col gap-2';
  return (
    <section
      aria-label="Avisos"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col gap-2 [--toast-from:-12px] sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-96 sm:[--toast-from:12px]"
    >
      <ol role="status" aria-live="polite" className={cls}>
        {polite.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </ol>
      <ol role="alert" aria-live="assertive" className={cls}>
        {urgent.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </ol>
    </section>
  );
}
