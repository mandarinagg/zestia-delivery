/*
 * PROTOTIPO — Detalle de pedido. Datos de ejemplo (DEMO-1043 tiene historial e incidencias
 * completos; el resto se arma con datos genéricos). Las acciones visibles dependen del estado,
 * según la tabla de transiciones de docs/ORDER_STATE_MACHINE.md; acá solo cambian la pantalla.
 */
import { Link, useParams } from '@tanstack/react-router';
import {
  CloudOff,
  Copy,
  Flag,
  MessageCircle,
  Phone,
  RotateCcw,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { CashRail } from '@/components/ui/order-rail';
import { TONE_CLASS } from '@/components/ui/tone';
import { EmptyState } from '@/components/ui/states';
import { CashStatusPill, OrderStatusPill, StatusGlyph } from '@/components/ui/status-pill';
import { toast } from '@/components/ui/toast';
import { formatDate, formatMinutes, formatPYG, formatTime, minutesBetween } from '@/lib/format';
import {
  HAPPY_PATH,
  PAYMENT_METHOD_LABEL,
  STATUS_META,
  type OrderStatus,
} from '@/lib/order-states';
import { cn } from '@/lib/utils';
import {
  courierById,
  DEMO_NOW,
  DEMO_ORDERS,
  HISTORY_1043,
  INCIDENT_CATEGORIES,
  INCIDENTS_1043,
  merchantById,
  VEHICLE_LABEL,
  type DemoIncident,
  type DemoOrder,
  type HistoryEntry,
} from '../demo-data';
import { PrototypeBanner } from '../prototype-banner';
import { ReasonDialog } from '../shared/reason-dialog';
import { AgeBadge } from '../despacho/order-card';

/** Historial genérico para los pedidos de ejemplo que no tienen uno escrito a mano. */
function genericHistory(order: DemoOrder): HistoryEntry[] {
  const meta = STATUS_META[order.status];
  const reached = meta.step ?? meta.branchFrom ?? 0;
  const path: OrderStatus[] = HAPPY_PATH.slice(0, reached + 1);
  if (meta.step === null) path.push(order.status);
  const start = new Date(order.createdAt).getTime();
  const end = new Date(order.statusSince).getTime();
  const courier = courierById(order.courierId);
  return path.map((to, i) => ({
    from: i === 0 ? null : path[i - 1]!,
    to,
    at: new Date(
      i === path.length - 1 ? end : start + ((end - start) * i) / Math.max(1, path.length - 1),
    ).toISOString(),
    actor:
      i === 0
        ? 'Carga manual'
        : to === 'ASIGNADO'
          ? 'Usuario de ejemplo (despacho)'
          : (courier?.name ?? 'Sistema'),
  }));
}

/** Acciones del operador válidas en cada estado (solo para mostrar; la regla vive en el backend). */
function operatorActions(status: OrderStatus) {
  return {
    assign: status === 'PENDIENTE_ASIGNACION',
    reassign: ['ASIGNADO', 'ACEPTADO', 'EN_RETIRO'].includes(status),
    reassignNeedsReason: ['ACEPTADO', 'EN_RETIRO'].includes(status),
    cancel: ['RECIBIDO', 'PENDIENTE_ASIGNACION', 'ASIGNADO', 'ACEPTADO', 'EN_RETIRO'].includes(
      status,
    ),
    giveBack: ['RETIRADO', 'NO_ENTREGADO'].includes(status),
    reschedule: status === 'NO_ENTREGADO',
  };
}

function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `sec-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cn('rounded-lg border bg-card', className)}>
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <h2 id={id} className="font-display text-[1.0625rem] font-semibold">
          {title}
        </h2>
        {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Recorrido grande con etiquetas: el riel del sistema, a escala de página. */
function Journey({ order, history }: { order: DemoOrder; history: HistoryEntry[] }) {
  const meta = STATUS_META[order.status];
  const reached = meta.step ?? meta.branchFrom ?? -1;
  const lastAt = (s: OrderStatus) => [...history].reverse().find((h) => h.to === s)?.at;
  const tone = meta.step === null ? 'bg-tone-slate-solid' : TONE_CLASS[meta.tone].solid;
  return (
    <ol className="grid grid-cols-1 gap-y-2 sm:grid-cols-8 sm:gap-x-1">
      {HAPPY_PATH.map((s, i) => {
        const done = i <= reached;
        const current = i === meta.step;
        const at = done ? lastAt(s) : undefined;
        return (
          <li
            key={s}
            aria-current={current ? 'step' : undefined}
            className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-stretch sm:gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-8 w-1.5 shrink-0 rounded-full sm:h-1.5 sm:w-auto',
                done ? tone : 'bg-muted',
              )}
            />
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-[0.8125rem] leading-4',
                  current
                    ? 'font-semibold text-foreground'
                    : done
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {STATUS_META[s].short}
              </span>
              <span className="block font-numeric text-xs text-muted-foreground">
                {at ? formatTime(at) : done ? '' : '—'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Timeline({ history }: { history: HistoryEntry[] }) {
  const items = [...history].reverse();
  return (
    <ol className="relative flex flex-col">
      {items.map((h, i) => {
        const back = h.to === 'PENDIENTE_ASIGNACION' && h.from && h.from !== 'RECIBIDO';
        const late = h.clientAt ? minutesBetween(h.clientAt, h.at) : 0;
        return (
          <li
            key={`${h.at}-${h.to}-${i}`}
            className="relative grid grid-cols-[3.25rem_1.25rem_1fr] gap-x-2 pb-4 last:pb-0"
          >
            <time
              dateTime={h.at}
              className="pt-px text-right font-numeric text-sm font-semibold tabular-nums"
            >
              {formatTime(h.at)}
            </time>
            <span className="relative flex justify-center">
              {i < items.length - 1 ? (
                <span aria-hidden="true" className="absolute top-5 -bottom-4 w-px bg-border" />
              ) : null}
              <span className="relative mt-0.5 grid size-4 place-items-center rounded-full bg-card">
                {back ? (
                  <Undo2 aria-hidden="true" className="size-3.5 text-tone-amber-solid" />
                ) : (
                  <StatusGlyph status={h.to} />
                )}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{STATUS_META[h.to].label}</span>
                {h.from ? (
                  <span className="text-muted-foreground">
                    {' '}
                    desde {STATUS_META[h.from].short.toLowerCase()}
                  </span>
                ) : null}
              </p>
              <p className="text-[0.8125rem] text-muted-foreground">{h.actor}</p>
              {h.note ? <p className="mt-0.5 text-[0.8125rem]">{h.note}</p> : null}
              {h.clientAt ? (
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-xs bg-tone-blue-bg px-1.5 py-0.5 text-xs font-semibold text-tone-blue-fg">
                  <CloudOff aria-hidden="true" className="size-3.5" />
                  Hecho sin señal a las {formatTime(h.clientAt)}, llegó {late} min después
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function IncidentItem({ incident, onResolve }: { incident: DemoIncident; onResolve: () => void }) {
  const open = !incident.resolvedAt;
  return (
    <li
      className={cn(
        'rounded-md border p-3',
        open ? 'border-tone-red-solid/60 bg-tone-red-bg/40' : 'bg-subtle',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Flag
          aria-hidden="true"
          className={cn(
            'size-4',
            open ? 'fill-current text-tone-red-solid' : 'text-muted-foreground',
          )}
        />
        <p className="font-semibold">{incident.category}</p>
        <span className="text-xs text-muted-foreground">{incident.id}</span>
        <span
          className={cn(
            'ml-auto rounded-xs px-1.5 py-0.5 text-xs font-semibold',
            open ? 'bg-tone-red-bg text-tone-red-fg' : 'bg-tone-green-bg text-tone-green-fg',
          )}
        >
          {open ? 'Abierta' : 'Resuelta'}
        </span>
      </div>
      <p className="mt-1.5 text-sm">{incident.description}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {incident.openedBy}, {formatTime(incident.openedAt)}
      </p>
      {open ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={onResolve}>
          Resolver incidencia
        </Button>
      ) : (
        <p className="mt-2 border-t pt-2 text-[0.8125rem]">
          <span className="font-semibold">Resolución:</span> {incident.resolution}{' '}
          <span className="text-muted-foreground">
            ({incident.resolvedBy}, {formatTime(incident.resolvedAt!)})
          </span>
        </p>
      )}
    </li>
  );
}

export function OrderDetailPrototype() {
  const { id } = useParams({ from: '/panel/prototipo/pedido/$id' });
  const base = DEMO_ORDERS.find((o) => o.id === id);
  const [order, setOrder] = useState<DemoOrder | undefined>(base);
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    base ? (base.id === 'DEMO-1043' ? HISTORY_1043 : genericHistory(base)) : [],
  );
  const [incidents, setIncidents] = useState<DemoIncident[]>(
    base?.id === 'DEMO-1043' ? INCIDENTS_1043 : [],
  );
  const [resolving, setResolving] = useState<DemoIncident | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolutionError, setResolutionError] = useState('');
  const [dialog, setDialog] = useState<null | 'cancel' | 'reassign' | 'giveback' | 'incident'>(
    null,
  );

  if (!order) {
    return (
      <div className="flex flex-col gap-4">
        <PrototypeBanner />
        <div className="rounded-lg border bg-card">
          <EmptyState
            title={`No encontramos el pedido ${id}`}
            description="En este prototipo solo existen los pedidos de ejemplo DEMO-1033 a DEMO-1058."
            action={
              <Link
                to="/panel/prototipo/pedido/$id"
                params={{ id: 'DEMO-1043' }}
                className={buttonVariants({ variant: 'outline' })}
              >
                Ver DEMO-1043
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const merchant = merchantById(order.merchantId);
  const courier = courierById(order.courierId);
  const actions = operatorActions(order.status);
  const openIncidents = incidents.filter((i) => !i.resolvedAt);
  const total = minutesBetween(order.createdAt, DEMO_NOW);

  function transition(to: OrderStatus, note: string) {
    setHistory((h) => [
      ...h,
      { from: order!.status, to, at: DEMO_NOW, actor: 'Usuario de ejemplo (despacho)', note },
    ]);
    setOrder(
      (o) =>
        o && {
          ...o,
          status: to,
          statusSince: DEMO_NOW,
          courierId: to === 'PENDIENTE_ASIGNACION' ? undefined : o.courierId,
        },
    );
  }

  function resolve() {
    if (!resolution.trim()) {
      setResolutionError('Contá cómo se resolvió.');
      return;
    }
    setIncidents((list) =>
      list.map((i) =>
        i.id === resolving!.id
          ? {
              ...i,
              resolvedAt: DEMO_NOW,
              resolvedBy: 'Usuario de ejemplo (despacho)',
              resolution: resolution.trim(),
            }
          : i,
      ),
    );
    setOrder((o) => o && { ...o, hasOpenIncident: openIncidents.length > 1 });
    toast({ tone: 'success', title: `Incidencia ${resolving!.id} resuelta` });
    setResolving(null);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PrototypeBanner backTo="/panel/prototipo/despacho" />

      <PageHeader
        className="mb-0"
        back={{ to: '/panel/prototipo/despacho', label: 'Despacho' }}
        title={<span className="font-numeric tracking-[0.01em]">{order.id}</span>}
        description={`${merchant.name} a ${order.dropBarrio}. Creado el ${formatDate(order.createdAt)} a las ${formatTime(order.createdAt)}, hace ${formatMinutes(total)}.`}
        meta={
          <>
            <OrderStatusPill status={order.status} />
            <CashStatusPill status={order.cash} />
            {openIncidents.length ? (
              <span className="inline-flex items-center gap-1 rounded-xs bg-tone-red-bg px-1.5 py-0.5 text-xs font-semibold text-tone-red-fg">
                <Flag aria-hidden="true" className="size-3 fill-current" />
                {openIncidents.length === 1
                  ? '1 incidencia abierta'
                  : `${openIncidents.length} incidencias abiertas`}
              </span>
            ) : null}
            {STATUS_META[order.status].final ? null : <AgeBadge order={order} now={DEMO_NOW} />}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog('incident')}>
              <Flag aria-hidden="true" />
              Registrar incidencia
            </Button>
            {actions.assign ? (
              <Button
                size="sm"
                onClick={() => toast({ title: 'Asigná desde el tablero en este prototipo' })}
              >
                <UserPlus aria-hidden="true" />
                Asignar
              </Button>
            ) : null}
            {actions.reassign ? (
              <Button variant="outline" size="sm" onClick={() => setDialog('reassign')}>
                <RotateCcw aria-hidden="true" />
                Reasignar
              </Button>
            ) : null}
            {actions.giveBack ? (
              <Button variant="outline" size="sm" onClick={() => setDialog('giveback')}>
                <Undo2 aria-hidden="true" />
                Devolver al comercio
              </Button>
            ) : null}
            {actions.cancel ? (
              <Button variant="destructive" size="sm" onClick={() => setDialog('cancel')}>
                Cancelar pedido
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Recorrido">
            <Journey order={order} history={history} />
            {!actions.cancel && !STATUS_META[order.status].final ? (
              <p className="mt-3 text-[0.8125rem] text-muted-foreground">
                Ya no se puede cancelar: el paquete salió del comercio. Si no se entrega, se
                reprograma o se devuelve.
              </p>
            ) : null}
          </Section>

          {incidents.length ? (
            <Section title="Incidencias">
              <ul className="flex flex-col gap-2">
                {incidents.map((inc) => (
                  <IncidentItem
                    key={inc.id}
                    incident={inc}
                    onResolve={() => {
                      setResolution('');
                      setResolutionError('');
                      setResolving(inc);
                    }}
                  />
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            title="Historial"
            aside={
              <span className="text-xs text-muted-foreground">Hora del servidor, Asunción</span>
            }
          >
            <Timeline history={history} />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Entrega">
            <dl className="flex flex-col gap-3">
              <Field label="Destinatario">
                {order.recipient}
                <span className="block font-numeric text-muted-foreground">{order.phone}</span>
              </Field>
              <Field label="Dirección">
                {order.address}
                <span className="block font-semibold">
                  {order.dropBarrio}
                  {order.city !== order.dropBarrio ? `, ${order.city}` : ''}
                </span>
              </Field>
              <Field label="Referencias">{order.reference}</Field>
              {order.window ? <Field label="Ventana horaria">{order.window}</Field> : null}
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href="https://wa.me/595981000000"
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
              <a
                href="tel:+595981000000"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Phone aria-hidden="true" />
                Llamar
              </a>
            </div>
          </Section>

          <Section title="Cobro" aside={<CashStatusPill status={order.cash} />}>
            <p className="font-numeric text-[1.75rem] font-semibold leading-8">
              {order.amount > 0 ? formatPYG(order.amount) : 'Sin importe'}
            </p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {PAYMENT_METHOD_LABEL[order.method]}
              {order.method === 'EFECTIVO' ? ', lo cobra el repartidor' : ''}
            </p>
            <CashRail status={order.cash} className="mt-3" />
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
              <Field label="Envío">{formatPYG(order.fee)}</Field>
              <Field label="Lo paga">
                {order.feePaidBy === 'COMERCIO' ? 'El comercio' : 'El destinatario'}
              </Field>
            </dl>
          </Section>

          <Section title="Retiro">
            <dl className="flex flex-col gap-3">
              <Field label="Comercio">
                <span className="font-semibold">{merchant.name}</span>
                <span className="block text-muted-foreground">
                  {merchant.branch}, {merchant.barrio}
                </span>
              </Field>
            </dl>
          </Section>

          <Section title="Repartidor">
            {courier ? (
              <div className="flex items-center gap-3">
                <Avatar name={courier.name} size="lg" />
                <div className="min-w-0">
                  <p className="font-semibold">{courier.name}</p>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    {VEHICLE_LABEL[courier.vehicle]}, {courier.zone}
                  </p>
                  {courier.cashInHand > 0 ? (
                    <p className="mt-0.5 text-[0.8125rem]">
                      Efectivo en mano:{' '}
                      <span className="font-numeric font-semibold">
                        {formatPYG(courier.cashInHand)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía sin repartidor.</p>
            )}
          </Section>

          <Section title="Seguimiento del cliente">
            <p className="text-[0.8125rem] text-muted-foreground">
              Link público: muestra solo el estado, la hora estimada y el nombre de la empresa.
              Vence 48 h después del cierre.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-sm bg-muted px-2 py-1.5 text-[0.8125rem]">
                ejemplo.invalid/t/demo-k7Qx
              </code>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Copiar link de seguimiento"
                onClick={() => toast({ tone: 'success', title: 'Link copiado (ejemplo)' })}
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
            <Link
              to="/prototipo/seguimiento"
              className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'mt-2')}
            >
              Ver lo que ve el cliente
            </Link>
          </Section>
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        title={`Cancelar ${order.id}`}
        description="Se avisa al comercio y queda en el historial con el motivo."
        reasons={[
          'Lo pidió el comercio',
          'Lo pidió el destinatario',
          'Datos de entrega incompletos',
          'Duplicado',
          'Otro',
        ]}
        confirmLabel="Cancelar pedido"
        destructive
        onConfirm={(reason, detail) => {
          transition('CANCELADO', [reason, detail].filter(Boolean).join('. '));
          toast({ title: `${order.id} cancelado`, description: `Motivo: ${reason}.` });
        }}
      />
      <ReasonDialog
        open={dialog === 'reassign'}
        onOpenChange={(o) => setDialog(o ? 'reassign' : null)}
        title={`Reasignar ${order.id}`}
        description={
          actions.reassignNeedsReason
            ? 'El repartidor ya aceptó: el motivo es obligatorio. El pedido vuelve a "Por asignar".'
            : 'El pedido vuelve a "Por asignar".'
        }
        reasons={[
          'Problema con el vehículo',
          'Repartidor sin batería o sin señal',
          'Carga mal repartida',
          'Otro',
        ]}
        confirmLabel="Reasignar"
        onConfirm={(reason, detail) => {
          transition(
            'PENDIENTE_ASIGNACION',
            `Reasignación: ${[reason, detail].filter(Boolean).join('. ')}`,
          );
          toast({ tone: 'success', title: `${order.id} volvió a por asignar` });
        }}
      />
      <ReasonDialog
        open={dialog === 'giveback'}
        onOpenChange={(o) => setDialog(o ? 'giveback' : null)}
        title={`Devolver ${order.id} al comercio`}
        description="El repartidor lleva el paquete de vuelta. Queda en devolución hasta que el comercio lo confirme."
        reasons={[
          'Cancelación después del retiro',
          'Destinatario rechazó',
          'Sin forma de reprogramar',
          'Otro',
        ]}
        confirmLabel="Devolver al comercio"
        onConfirm={(reason) => {
          transition('EN_DEVOLUCION', reason);
          toast({ title: `${order.id} en devolución` });
        }}
      />
      <ReasonDialog
        open={dialog === 'incident'}
        onOpenChange={(o) => setDialog(o ? 'incident' : null)}
        title="Registrar incidencia"
        description="La incidencia no cambia el estado del pedido: lo marca para seguimiento hasta que se resuelva."
        reasons={INCIDENT_CATEGORIES}
        confirmLabel="Registrar incidencia"
        onConfirm={(reason, detail) => {
          setIncidents((list) => [
            {
              id: `INC-${210 + list.length}`,
              category: reason,
              description: detail || 'Sin detalle.',
              openedBy: 'Usuario de ejemplo (despacho)',
              openedAt: DEMO_NOW,
            },
            ...list,
          ]);
          setOrder((o) => o && { ...o, hasOpenIncident: true });
          toast({ tone: 'success', title: 'Incidencia registrada' });
        }}
      />

      <Dialog open={resolving !== null} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver {resolving?.id}</DialogTitle>
            <DialogDescription>
              {resolving?.category}: {resolving?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-5">
            <FormField label="Cómo se resolvió" required error={resolutionError || undefined}>
              <Textarea
                rows={3}
                value={resolution}
                onChange={(e) => {
                  setResolution(e.target.value);
                  setResolutionError('');
                }}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolving(null)}>
              Volver
            </Button>
            <Button onClick={resolve}>Marcar resuelta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
