/*
 * PROTOTIPO — Seguimiento público (/t/:token). Lo ve el cliente final, en su teléfono.
 * Datos de ejemplo. Muestra solo lo que permite SPEC §4.7: estado, hora estimada (rotulada
 * como estimada), nombre de la empresa y nombre de pila de quien lo lleva. Sin teléfono,
 * dirección, montos ni datos internos.
 *
 * Mapeo de estados reales -> hitos para el cliente (4 hitos, lenguaje del cliente):
 *   RECIBIDO, PENDIENTE_ASIGNACION, ASIGNADO, ACEPTADO -> 1 "Recibido"
 *     (para el cliente, asignar repartidor es interno: el pedido sigue "recibido")
 *   EN_RETIRO, RETIRADO                               -> 2 "Preparando" (lo están retirando)
 *   EN_CAMINO                                         -> 3 "En camino"
 *   ENTREGADO                                         -> 4 "Entregado"
 *   NO_ENTREGADO, EN_DEVOLUCION, DEVUELTO, CANCELADO  -> sin hito: mensaje propio, calmo.
 * Link vencido (48 h después del cierre) -> pantalla aparte, sin datos del pedido.
 */
import { Clock, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Wordmark } from '@/components/brand/logo';
import { Segmented } from '@/components/ui/segmented';
import { formatTime } from '@/lib/format';
import type { OrderStatus } from '@/lib/order-states';
import { cn } from '@/lib/utils';
import { DEMO_NOW, DEMO_TENANT, minutesAgo } from '../demo-data';
import { PrototypeBanner } from '../prototype-banner';

export const CUSTOMER_MILESTONES = ['Recibido', 'Preparando', 'En camino', 'Entregado'] as const;

/** Índice del hito (0–3) o null si el estado es un desvío. */
export function milestoneOf(status: OrderStatus): number | null {
  switch (status) {
    case 'RECIBIDO':
    case 'PENDIENTE_ASIGNACION':
    case 'ASIGNADO':
    case 'ACEPTADO':
      return 0;
    case 'EN_RETIRO':
    case 'RETIRADO':
      return 1;
    case 'EN_CAMINO':
      return 2;
    case 'ENTREGADO':
      return 3;
    default:
      return null;
  }
}

type DemoView = 'EN_RETIRO' | 'EN_CAMINO' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO' | 'VENCIDO';

const VIEWS: { value: DemoView; label: string }[] = [
  { value: 'EN_RETIRO', label: 'Preparando' },
  { value: 'EN_CAMINO', label: 'En camino' },
  { value: 'ENTREGADO', label: 'Entregado' },
  { value: 'NO_ENTREGADO', label: 'No entregado' },
  { value: 'CANCELADO', label: 'Cancelado' },
  { value: 'VENCIDO', label: 'Link vencido' },
];

const ETA = '2026-11-18T17:50:00Z'; // 14:50 en Asunción, estimada.

const COPY: Record<
  Exclude<DemoView, 'VENCIDO'>,
  { headline: string; detail: string; updated: number }
> = {
  EN_RETIRO: {
    headline: 'Estamos retirando tu pedido',
    detail: 'Ramón lo está buscando en el comercio. Te avisamos cuando salga hacia vos.',
    updated: 6,
  },
  EN_CAMINO: {
    headline: 'Tu pedido está en camino',
    detail: 'Tené el teléfono a mano por si necesita ubicarte.',
    updated: 2,
  },
  ENTREGADO: {
    headline: 'Tu pedido fue entregado',
    detail: '¡Gracias por elegir a Lomitería Demo!',
    updated: 0,
  },
  NO_ENTREGADO: {
    headline: 'No pudimos entregarlo esta vez',
    detail:
      'No te encontramos en la dirección. Envíos Ejemplo se va a comunicar con vos para coordinar una nueva entrega.',
    updated: 1,
  },
  CANCELADO: {
    headline: 'Este pedido fue cancelado',
    detail: 'Si no esperabas la cancelación, consultá con Lomitería Demo.',
    updated: 12,
  },
};

function TenantMark() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-md bg-muted font-display text-lg font-bold text-foreground"
      >
        EE
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold leading-5">{DEMO_TENANT}</p>
        <p className="text-sm text-muted-foreground">Seguimiento de envío</p>
      </div>
    </div>
  );
}

function Milestones({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Avance del envío">
      {CUSTOMER_MILESTONES.map((label, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        return (
          <li key={label} aria-current={isCurrent ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn(
                'block h-1.5 rounded-full transition-colors duration-500',
                done
                  ? current === 3
                    ? 'bg-tone-green-solid'
                    : 'bg-tone-violet-solid'
                  : 'bg-muted',
              )}
            />
            <span
              className={cn(
                'mt-2 block text-xs leading-4 sm:text-[0.8125rem]',
                done ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
              <span className="sr-only">
                {isCurrent ? ' (ahora)' : done ? ' (listo)' : ' (pendiente)'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TrackingPrototype() {
  const [view, setView] = useState<DemoView>('EN_CAMINO');
  const expired = view === 'VENCIDO';
  const copy = expired ? null : COPY[view];
  const milestone = expired ? null : milestoneOf(view);
  const showEta = view === 'EN_CAMINO' || view === 'EN_RETIRO';
  const showCourier = view === 'EN_CAMINO' || view === 'EN_RETIRO';

  return (
    <div className="min-h-dvh bg-background">
      <main
        id="contenido"
        className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col px-4 py-4"
      >
        <PrototypeBanner className="text-xs">
          Así ve el cliente su link de seguimiento. Datos de ejemplo.
        </PrototypeBanner>
        <div className="mt-3 flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Ver otro estado (solo prototipo)</p>
          <Segmented
            label="Estado de ejemplo"
            options={VIEWS}
            value={view}
            onChange={setView}
            className="grid w-full grid-cols-3"
          />
        </div>

        <div className="mt-6">
          <TenantMark />
        </div>

        {expired ? (
          <section aria-labelledby="titulo" className="mt-10 flex flex-col gap-3">
            <Clock aria-hidden="true" className="size-8 text-muted-foreground" />
            <h1 id="titulo" className="font-display text-[2rem] font-semibold leading-9">
              Este link ya no está disponible
            </h1>
            <p className="text-base text-muted-foreground">
              Los links de seguimiento vencen 48 horas después de cerrado el envío. Si necesitás
              algo, consultá directamente con la empresa.
            </p>
          </section>
        ) : (
          <section aria-labelledby="titulo" className="mt-8 flex flex-col">
            <p className="text-sm text-muted-foreground">Pedido de Lomitería Demo</p>
            <h1
              id="titulo"
              key={view}
              className="animate-fade-in mt-1 font-display text-[2.25rem] font-semibold leading-[2.5rem]"
            >
              {copy!.headline}
            </h1>

            {milestone !== null ? (
              <div className="mt-6">
                <Milestones current={milestone} />
              </div>
            ) : null}

            {showEta ? (
              <div className="mt-6 rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">Llega aprox.</p>
                <p className="flex items-baseline gap-2">
                  <span className="font-numeric text-[2.75rem] font-semibold leading-none">
                    {formatTime(ETA)}
                  </span>
                  <span className="text-base text-muted-foreground">(estimada)</span>
                </p>
                {showCourier ? (
                  <p className="mt-3 border-t pt-3 text-base">
                    Te lo lleva <strong className="font-semibold">Ramón</strong>
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="mt-4 text-base">{copy!.detail}</p>

            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-4 text-sm">
              <dt className="text-muted-foreground">Código</dt>
              <dd className="text-right font-numeric text-base font-semibold">DEMO-1043</dd>
              <dt className="text-muted-foreground">Actualizado</dt>
              <dd className="text-right font-numeric text-base">
                {formatTime(copy!.updated === 0 ? DEMO_NOW : minutesAgo(copy!.updated))}
              </dd>
            </dl>
          </section>
        )}

        <div className="mt-8">
          <a
            href="https://wa.me/595981000000"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-subtle"
          >
            <MessageCircle aria-hidden="true" className="size-5 shrink-0 text-tone-green-solid" />
            <span className="text-base">
              ¿Algún problema?{' '}
              <span className="font-semibold underline underline-offset-4">
                Escribile a Envíos Ejemplo por WhatsApp
              </span>
            </span>
          </a>
        </div>

        <footer className="mt-auto flex items-center justify-center gap-1.5 pt-10 text-xs text-muted-foreground">
          con <Wordmark className="text-[0.8125rem] text-foreground" />
        </footer>
      </main>
    </div>
  );
}
