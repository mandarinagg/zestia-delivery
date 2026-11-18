/*
 * PROTOTIPO — App del repartidor (PWA), mobile-first.
 * Datos de ejemplo y estado local: no hay API, ni cola offline real, ni service worker.
 * Muestra cómo se verá y se sentirá: una entrega "ahora", acciones de pulgar abajo,
 * señal y cambios sin enviar siempre visibles. Las transiciones respetan la tabla de
 * docs/ORDER_STATE_MACHINE.md para el rol Repartidor, pero la regla real vive en el backend.
 */
import {
  Banknote,
  CloudOff,
  CloudUpload,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { OrderRail } from '@/components/ui/order-rail';
import { Segmented } from '@/components/ui/segmented';
import { OrderStatusPill } from '@/components/ui/status-pill';
import { toast } from '@/components/ui/toast';
import { formatPYG, formatTime } from '@/lib/format';
import { withViewTransition, vtName } from '@/lib/motion';
import { PAYMENT_METHOD_LABEL, STATUS_META, type OrderStatus } from '@/lib/order-states';
import { cn } from '@/lib/utils';
import { COURIERS, DEMO_NOW } from '../demo-data';
import { PrototypeBanner } from '../prototype-banner';
import { COURIER_ORDERS, REJECT_REASONS, type CourierOrder } from './courier-data';
import {
  DeliverSheet,
  FailSheet,
  QueueSheet,
  RejectSheet,
  type QueuedChange,
} from './courier-sheets';

const COURIER = COURIERS.find((c) => c.id === 'c1')!;

/** Prioridad de la lista: lo que está más avanzado va primero (es lo que estás haciendo). */
const PRIORITY: Partial<Record<OrderStatus, number>> = {
  EN_CAMINO: 0,
  RETIRADO: 1,
  EN_RETIRO: 2,
  ACEPTADO: 3,
  ASIGNADO: 4,
};
const PENDING = new Set(Object.keys(PRIORITY));

/** Siguiente paso del repartidor en el camino feliz: botón principal y verbo del aviso. */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; action: string; done: string }>> = {
  ASIGNADO: { to: 'ACEPTADO', action: 'Aceptar', done: 'Pedido aceptado' },
  ACEPTADO: { to: 'EN_RETIRO', action: 'Salgo a retirar', done: 'Saliste a retirar' },
  EN_RETIRO: { to: 'RETIRADO', action: 'Ya lo retiré', done: 'Retiro registrado' },
  RETIRADO: { to: 'EN_CAMINO', action: 'Salgo a entregar', done: 'Saliste a entregar' },
};

function todayLabel(iso: string): string {
  const weekday = new Intl.DateTimeFormat('es-PY', {
    weekday: 'long',
    timeZone: 'America/Asuncion',
  }).format(new Date(iso));
  const day = new Intl.DateTimeFormat('es-PY', {
    day: 'numeric',
    timeZone: 'America/Asuncion',
  }).format(new Date(iso));
  return `Hoy, ${weekday} ${day}`;
}

const isCash = (o: CourierOrder) => o.method === 'EFECTIVO' && o.amount > 0;

/** Recorrido retiro → entrega, dibujado como la marca: punto lleno (origen) y anillo (destino). */
function Route({ order }: { order: CourierOrder }) {
  const pickupPhase = order.status === 'ACEPTADO' || order.status === 'EN_RETIRO';
  return (
    <ol className="relative flex flex-col gap-3 pl-7">
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-[0.6875rem] top-3 w-0.5 rounded-full bg-border"
      />
      <li className="relative">
        <span
          aria-hidden="true"
          className="absolute -left-7 top-1 size-[1.125rem] rounded-full border-[5px] border-card bg-foreground ring-1 ring-foreground"
        />
        <p className="text-sm text-muted-foreground">Retiro</p>
        <p className={cn('font-semibold', pickupPhase && 'text-lg')}>{order.merchant}</p>
        <p className="text-muted-foreground">{order.branch}</p>
      </li>
      <li className="relative">
        <span
          aria-hidden="true"
          className="absolute -left-7 top-1 size-[1.125rem] rounded-full border-[3px] border-foreground bg-card"
        />
        <p className="text-sm text-muted-foreground">Entrega a {order.recipient}</p>
        <p className={cn('font-semibold', !pickupPhase && 'text-lg')}>
          {order.dropBarrio}, {order.city}
        </p>
        <p>{order.address}</p>
        <p className="text-muted-foreground">{order.reference}</p>
      </li>
    </ol>
  );
}

function MoneyLine({ order, big }: { order: CourierOrder; big?: boolean }) {
  if (isCash(order)) {
    const done = order.cash === 'COBRADO';
    return (
      <div
        className={cn(
          'flex flex-wrap items-baseline justify-between gap-x-3 rounded-md px-3 py-2',
          done ? 'bg-tone-blue-bg text-tone-blue-fg' : 'bg-tone-amber-bg text-tone-amber-fg',
        )}
      >
        <span className="font-semibold">{done ? 'Cobrado en efectivo' : 'Cobrar en efectivo'}</span>
        <span
          className={cn('font-numeric font-semibold', big ? 'text-[2rem] leading-10' : 'text-xl')}
        >
          {formatPYG(order.collected ?? order.amount)}
        </span>
      </div>
    );
  }
  return (
    <p className="rounded-md bg-muted px-3 py-2 font-semibold">
      Ya pagado ({PAYMENT_METHOD_LABEL[order.method]}). No cobrás nada.
    </p>
  );
}

function ContactRow({ order }: { order: CourierOrder }) {
  const pickupPhase = order.status === 'ACEPTADO' || order.status === 'EN_RETIRO';
  const place = pickupPhase
    ? `${order.merchant} ${order.branch}`
    : `${order.dropBarrio} ${order.city}`;
  const link = cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'flex-1 px-2');
  return (
    <div className="grid grid-cols-3 gap-2">
      <a href={`tel:+${order.phone}`} className={link}>
        <Phone aria-hidden="true" />
        Llamar
      </a>
      <a href={`https://wa.me/${order.phone}`} target="_blank" rel="noreferrer" className={link}>
        <MessageCircle aria-hidden="true" />
        WhatsApp
      </a>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
        target="_blank"
        rel="noreferrer"
        className={link}
        aria-label={`Abrir ${pickupPhase ? 'el retiro' : 'la entrega'} en mapas`}
      >
        <Navigation aria-hidden="true" />
        Mapas
      </a>
    </div>
  );
}

function SyncMark({ order }: { order: CourierOrder }) {
  if (!order.pendingSync) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
      <CloudOff aria-hidden="true" className="size-4" />
      Pendiente de envío
    </span>
  );
}

function CurrentCard({ order }: { order: CourierOrder }) {
  return (
    <article
      aria-labelledby={`cur-${order.id}`}
      style={{ viewTransitionName: vtName('courier', order.id) }}
      className="flex flex-col gap-4 rounded-xl border-2 border-foreground/80 bg-card p-4"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id={`cur-${order.id}`} className="font-numeric text-2xl font-semibold">
            <span className="sr-only">Entrega actual: </span>
            {order.id}
          </h2>
          <OrderStatusPill status={order.status} className="px-2 py-1 text-sm" />
        </div>
        <OrderRail status={order.status} size="md" />
        <SyncMark order={order} />
        {order.window ? (
          <p className="text-sm font-semibold">Entregar entre {order.window}</p>
        ) : null}
      </header>
      <Route order={order} />
      <MoneyLine order={order} big />
      <ContactRow order={order} />
    </article>
  );
}

function QueueCard({ order, onOpen }: { order: CourierOrder; onOpen: () => void }) {
  const isNew = order.status === 'ASIGNADO';
  return (
    <li style={{ viewTransitionName: vtName('courier', order.id) }}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left hover:bg-subtle',
          isNew && 'border-brand shadow-[inset_4px_0_0_var(--brand)]',
        )}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="font-numeric text-lg font-semibold">{order.id}</span>
          <OrderStatusPill status={order.status} className="text-sm" />
        </span>
        <span className="block">
          <span className="font-semibold">{order.merchant}</span>
          <span className="text-muted-foreground"> a {order.dropBarrio}</span>
        </span>
        {isNew ? (
          <span className="text-sm font-semibold text-brand-ink">
            Nuevo: tocá para aceptarlo o rechazarlo
          </span>
        ) : null}
        <span className="flex w-full items-center justify-between gap-2 text-sm">
          <span className={cn(isCash(order) ? 'font-semibold' : 'text-muted-foreground')}>
            {isCash(order) ? `Cobrar ${formatPYG(order.amount)}` : 'Ya pagado'}
          </span>
          <SyncMark order={order} />
        </span>
        <OrderRail status={order.status} />
      </button>
    </li>
  );
}

function DoneRow({ order }: { order: CourierOrder }) {
  return (
    <li
      style={{ viewTransitionName: vtName('courier', order.id) }}
      className="flex items-center gap-3 px-3 py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-numeric text-lg font-semibold">{order.id}</span>
          <OrderStatusPill status={order.status} />
        </span>
        <span className="block text-muted-foreground">
          {order.dropBarrio}, {formatTime(order.updatedAt)}
        </span>
        <SyncMark order={order} />
      </span>
      <span className="text-right">
        {isCash(order) && order.cash === 'COBRADO' ? (
          <span className="font-numeric text-lg font-semibold">
            {formatPYG(order.collected ?? order.amount)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Sin efectivo</span>
        )}
      </span>
    </li>
  );
}

export function CourierPrototype() {
  const [orders, setOrders] = useState<CourierOrder[]>(COURIER_ORDERS);
  const [tab, setTab] = useState<'pendientes' | 'hechas'>('pendientes');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedChange[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [deliverFor, setDeliverFor] = useState<CourierOrder | null>(null);
  const [failFor, setFailFor] = useState<CourierOrder | null>(null);
  const [rejectFor, setRejectFor] = useState<CourierOrder | null>(null);
  const [announce, setAnnounce] = useState('');
  const [mountedAt] = useState(() => Date.now());
  const seq = useRef(0);

  /** Reloj del prototipo: arranca en DEMO_NOW y avanza con el tiempo real. */
  const now = () => new Date(new Date(DEMO_NOW).getTime() + (Date.now() - mountedAt)).toISOString();

  const pending = useMemo(
    () =>
      orders
        .filter((o) => PENDING.has(o.status))
        .sort((a, b) => PRIORITY[a.status]! - PRIORITY[b.status]!),
    [orders],
  );
  const done = orders.filter((o) => !PENDING.has(o.status));
  const cashInHand = orders
    .filter((o) => o.cash === 'COBRADO')
    .reduce((sum, o) => sum + (o.collected ?? o.amount), 0);
  const current = pending.find((o) => o.id === currentId) ?? pending[0] ?? null;
  const rest = pending.filter((o) => o !== current);

  function apply(id: string, patch: Partial<CourierOrder>, label: string, toastTitle: string) {
    const at = now();
    void withViewTransition(() => {
      setOrders((list) =>
        list.map((o) =>
          o.id === id ? { ...o, ...patch, updatedAt: at, pendingSync: !online } : o,
        ),
      );
    });
    if (!online) {
      setQueue((q) => [...q, { key: ++seq.current, orderId: id, label, at }]);
    }
    const next = patch.status ? STATUS_META[patch.status].label.toLowerCase() : '';
    setAnnounce(`${id}: ${next || label.toLowerCase()}.${online ? '' : ' Guardado sin señal.'}`);
    toast({
      title: toastTitle,
      description: online ? id : `${id}. Se envía cuando vuelva la señal.`,
      tone: 'success',
    });
  }

  function advance(order: CourierOrder) {
    const step = NEXT[order.status];
    if (!step) return;
    apply(order.id, { status: step.to }, step.action, step.done);
  }

  function deliver(order: CourierOrder, collected?: number) {
    apply(
      order.id,
      isCash(order)
        ? { status: 'ENTREGADO', cash: 'COBRADO', collected: collected ?? order.amount }
        : { status: 'ENTREGADO' },
      'Entregué',
      'Entrega registrada',
    );
    setDeliverFor(null);
    setCurrentId(null);
  }

  function fail(order: CourierOrder, category: string) {
    apply(
      order.id,
      { status: 'NO_ENTREGADO' },
      `No entregado: ${category}`,
      'Incidencia registrada',
    );
    setFailFor(null);
    setCurrentId(null);
  }

  function reject(order: CourierOrder, reason: string) {
    void withViewTransition(() => setOrders((list) => list.filter((o) => o.id !== order.id)));
    if (!online) {
      setQueue((q) => [
        ...q,
        { key: ++seq.current, orderId: order.id, label: `Rechazado: ${reason}`, at: now() },
      ]);
    }
    setAnnounce(`${order.id} rechazado. Vuelve a despacho.`);
    toast({ title: 'Pedido rechazado', description: `${order.id} vuelve a despacho.` });
    setRejectFor(null);
    setCurrentId(null);
  }

  function setSignal(next: boolean) {
    setOnline(next);
    if (!next) {
      setAnnounce('Sin señal. Tus cambios se guardan en el teléfono.');
      return;
    }
    if (queue.length === 0) {
      setAnnounce('Volvió la señal.');
      return;
    }
    setSyncing(true);
    setAnnounce(`Volvió la señal. Enviando ${queue.length} cambios…`);
    window.setTimeout(() => {
      const n = queue.length;
      setQueue([]);
      setOrders((list) => list.map((o) => (o.pendingSync ? { ...o, pendingSync: false } : o)));
      setSyncing(false);
      setAnnounce('Cambios enviados.');
      toast({
        title: 'Cambios enviados',
        description: `${n} ${n === 1 ? 'cambio se envió' : 'cambios se enviaron'} con la hora en que los hiciste.`,
        tone: 'success',
      });
    }, 1200);
  }

  const step = current ? NEXT[current.status] : undefined;

  return (
    <div className="min-h-dvh bg-background">
      <main
        id="contenido"
        className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col text-[1.0625rem] leading-6"
      >
        <div className="px-3 pt-3">
          <PrototypeBanner className="text-xs">Datos de ejemplo. Nada se envía.</PrototypeBanner>
        </div>

        <header className="flex flex-col gap-3 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base text-muted-foreground first-letter:uppercase">
                {todayLabel(DEMO_NOW)}
              </p>
              <h1 className="font-display text-[1.875rem] font-semibold leading-9">
                {COURIER.name}
              </h1>
            </div>
            <span
              className={cn(
                'mt-1 inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-base font-semibold',
                online
                  ? 'bg-tone-green-bg text-tone-green-fg'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {online ? (
                <Wifi aria-hidden="true" className="size-5" />
              ) : (
                <WifiOff aria-hidden="true" className="size-5" />
              )}
              {online ? (syncing ? 'Enviando…' : 'Con señal') : 'Sin señal'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 py-2">
              <Banknote aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span>
                Tenés{' '}
                <strong className="font-numeric text-xl font-semibold">
                  {formatPYG(cashInHand)}
                </strong>{' '}
                para rendir
              </span>
            </p>
            {queue.length > 0 ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-start border-foreground"
                aria-haspopup="dialog"
                onClick={() => setQueueOpen(true)}
              >
                <CloudUpload aria-hidden="true" />
                {queue.length} {queue.length === 1 ? 'cambio sin enviar' : 'cambios sin enviar'}
              </Button>
            ) : null}
          </div>
        </header>

        {!online ? (
          <div
            role="status"
            className="zd-banner mx-3 mb-3 flex items-start gap-3 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
            <p>Sin señal. Guardamos tus cambios y los enviamos cuando vuelva.</p>
          </div>
        ) : null}

        <div className="px-4">
          <Segmented
            label="Entregas"
            size="lg"
            className="flex w-full"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pendientes', label: 'Pendientes', count: pending.length },
              { value: 'hechas', label: 'Hechas', count: done.length },
            ]}
          />
        </div>

        <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-4">
          {tab === 'pendientes' ? (
            current ? (
              <>
                <CurrentCard order={current} />
                {rest.length > 0 ? (
                  <section aria-labelledby="despues">
                    <h2 id="despues" className="mb-2 font-display text-xl font-semibold">
                      Después
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {rest.map((o) => (
                        <QueueCard
                          key={o.id}
                          order={o}
                          onOpen={() => {
                            setCurrentId(o.id);
                            window.scrollTo({ top: 0 });
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-input px-4 py-10 text-center">
                <p className="font-display text-2xl font-semibold">No tenés entregas pendientes</p>
                <p className="mt-1 text-muted-foreground">
                  Cuando despacho te asigne un pedido, aparece acá.
                </p>
              </div>
            )
          ) : (
            <section aria-label="Entregas hechas">
              <ul className="divide-y rounded-lg border bg-card">
                {done.map((o) => (
                  <DoneRow key={o.id} order={o} />
                ))}
              </ul>
            </section>
          )}

          <div className="mt-auto rounded-lg border border-dashed border-brand/60 p-3">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">Simular sin señal</span>
                <span className="block text-sm text-muted-foreground">
                  Solo en el prototipo. En la app real se detecta solo.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={!online}
                onChange={(e) => setSignal(!e.target.checked)}
                className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-muted ring-1 ring-input transition-colors duration-(--dur-fast) before:block before:size-6 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-card before:shadow-raised before:transition-transform before:duration-(--dur-fast) checked:bg-primary checked:before:translate-x-[1.375rem]"
              />
            </label>
          </div>
        </div>

        {tab === 'pendientes' && current ? (
          <div className="sticky bottom-0 z-10 border-t bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <p className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden="true" className="size-4" />
              <span className="truncate">
                {current.id}, {current.dropBarrio}
              </span>
            </p>
            {current.status === 'ASIGNADO' ? (
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <Button size="xl" variant="outline" onClick={() => setRejectFor(current)}>
                  Rechazar
                </Button>
                <Button size="xl" onClick={() => advance(current)}>
                  Aceptar
                </Button>
              </div>
            ) : current.status === 'EN_CAMINO' ? (
              <div className="flex flex-col gap-2">
                <Button size="xl" className="w-full" onClick={() => setDeliverFor(current)}>
                  Entregué
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={() => setFailFor(current)}
                >
                  No pude entregar
                </Button>
              </div>
            ) : step ? (
              <Button size="xl" className="w-full" onClick={() => advance(current)}>
                {step.action}
              </Button>
            ) : null}
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </main>

      <DeliverSheet
        order={deliverFor}
        onOpenChange={(o) => !o && setDeliverFor(null)}
        onConfirm={(collected) => deliverFor && deliver(deliverFor, collected)}
      />
      <FailSheet
        order={failFor}
        onOpenChange={(o) => !o && setFailFor(null)}
        onConfirm={(c) => failFor && fail(failFor, c)}
      />
      <RejectSheet
        order={rejectFor}
        reasons={REJECT_REASONS}
        onOpenChange={(o) => !o && setRejectFor(null)}
        onConfirm={(r) => rejectFor && reject(rejectFor, r)}
      />
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} queue={queue} />
    </div>
  );
}
