import { Link } from '@tanstack/react-router';
import { ExternalLink, FlaskConical, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { OrderRail } from '@/components/ui/order-rail';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover';
import { CashStatusPill, OrderStatusPill } from '@/components/ui/status-pill';
import { formatMinutes, formatPYG, formatTime } from '@/lib/format';
import { PAYMENT_METHOD_LABEL, STATUS_META } from '@/lib/order-states';
import {
  courierById,
  DEMO_SLA,
  merchantById,
  type DemoCourier,
  type DemoOrder,
} from '../demo-data';
import { ReasonDialog } from '../shared/reason-dialog';
import { nextHappyStatus, overdue } from './board-model';
import { CourierPicker } from './couriers';
import { AgeBadge, IncidentFlag } from './order-card';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

const CANCEL_REASONS = [
  'Lo pidió el comercio',
  'Lo pidió el destinatario',
  'Datos de entrega incompletos',
  'Duplicado',
  'Otro',
];

/** Vista rápida del pedido en un cajón lateral: decidir sin perder el tablero de vista. */
export function OrderSheet({
  order,
  orders,
  now,
  onOpenChange,
  onAssign,
  onAdvance,
  onCancel,
  onResolveIncident,
}: {
  order: DemoOrder | null;
  orders: DemoOrder[];
  now: string;
  onOpenChange: (open: boolean) => void;
  onAssign: (order: DemoOrder, courier: DemoCourier) => void;
  onAdvance: (order: DemoOrder) => void;
  onCancel: (order: DemoOrder, reason: string) => void;
  onResolveIncident: (order: DemoOrder) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <>
      <Dialog open={order !== null} onOpenChange={onOpenChange}>
        {order ? (
          <SheetContent side="right" aria-describedby={`${order.id}-sheet-desc`}>
            <SheetBody
              order={order}
              orders={orders}
              now={now}
              pickerOpen={pickerOpen}
              setPickerOpen={setPickerOpen}
              onAssign={(c) => {
                setPickerOpen(false);
                onAssign(order, c);
              }}
              onAdvance={() => onAdvance(order)}
              onAskCancel={() => setCancelOpen(true)}
              onResolveIncident={() => onResolveIncident(order)}
            />
          </SheetContent>
        ) : null}
      </Dialog>
      {order ? (
        <ReasonDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title={`Cancelar ${order.id}`}
          description="El pedido sale del tablero y se avisa al comercio. Queda en el historial con el motivo."
          reasons={CANCEL_REASONS}
          confirmLabel="Cancelar pedido"
          destructive
          onConfirm={(reason) => onCancel(order, reason)}
        />
      ) : null}
    </>
  );
}

function SheetBody({
  order,
  orders,
  now,
  pickerOpen,
  setPickerOpen,
  onAssign,
  onAdvance,
  onAskCancel,
  onResolveIncident,
}: {
  order: DemoOrder;
  orders: DemoOrder[];
  now: string;
  pickerOpen: boolean;
  setPickerOpen: (o: boolean) => void;
  onAssign: (c: DemoCourier) => void;
  onAdvance: () => void;
  onAskCancel: () => void;
  onResolveIncident: () => void;
}) {
  const merchant = merchantById(order.merchantId);
  const courier = courierById(order.courierId);
  const meta = STATUS_META[order.status];
  const sla = DEMO_SLA[order.status];
  const late = overdue(order, now);
  const next = nextHappyStatus(order.status);
  const cancellable = [
    'RECIBIDO',
    'PENDIENTE_ASIGNACION',
    'ASIGNADO',
    'ACEPTADO',
    'EN_RETIRO',
  ].includes(order.status);

  return (
    <>
      <header className="border-b px-5 pb-4 pr-14 pt-5">
        <DialogTitle className="font-numeric text-2xl font-semibold tracking-[0.01em]">
          {order.id}
        </DialogTitle>
        <DialogDescription id={`${order.id}-sheet-desc`} className="mt-0.5">
          {merchant.name} a {order.dropBarrio}
        </DialogDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OrderStatusPill status={order.status} />
          <CashStatusPill status={order.cash} />
          {order.hasOpenIncident ? <IncidentFlag label={order.incident} /> : null}
        </div>
        <OrderRail status={order.status} size="md" className="mt-4" />
        <p className="mt-2 flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <AgeBadge order={order} now={now} />
          <span>
            {meta.label} desde las {formatTime(order.statusSince)}
            {sla !== undefined ? `. Objetivo: ${formatMinutes(sla)}` : ''}
            {late ? '. Demorado.' : '.'}
          </span>
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        {order.hasOpenIncident ? (
          <section
            aria-label="Incidencia abierta"
            className="my-3 rounded-md border border-tone-red-solid/50 bg-tone-red-bg/60 p-3"
          >
            <p className="font-semibold text-tone-red-fg">Incidencia abierta: {order.incident}</p>
            <p className="mt-1 text-[0.8125rem]">
              Reportada por el repartidor. Resolvela para quitar la marca del tablero.
            </p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onResolveIncident}>
              Marcar resuelta
            </Button>
          </section>
        ) : null}

        <dl className="divide-y">
          <Row label="Retiro">
            <span className="font-semibold">{merchant.name}</span>
            <span className="block text-muted-foreground">{merchant.branch}</span>
          </Row>
          <Row label="Entrega">
            <span className="font-semibold">
              {order.dropBarrio}, {order.city}
            </span>
            <span className="block">{order.address}</span>
            <span className="block text-muted-foreground">{order.reference}</span>
          </Row>
          <Row label="Destinatario">
            {order.recipient}
            <span className="block font-numeric text-muted-foreground">{order.phone}</span>
          </Row>
          <Row label="Cobro">
            <span className="font-numeric text-base font-semibold">
              {order.amount > 0 ? formatPYG(order.amount) : 'Sin importe a cobrar'}
            </span>
            <span className="block text-muted-foreground">
              {PAYMENT_METHOD_LABEL[order.method]}. Envío {formatPYG(order.fee)} a cargo del{' '}
              {order.feePaidBy === 'COMERCIO' ? 'comercio' : 'destinatario'}.
            </span>
          </Row>
          {order.window ? <Row label="Ventana">Entregar entre {order.window}</Row> : null}
          <Row label="Repartidor">
            {courier ? (
              <span className="flex items-center gap-2">
                <Avatar name={courier.name} size="sm" />
                <span className="font-semibold">{courier.name}</span>
              </span>
            ) : order.status === 'PENDIENTE_ASIGNACION' ? (
              <PopoverRoot open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm">
                    <UserPlus aria-hidden="true" />
                    Asignar repartidor
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <CourierPicker orders={orders} onPick={onAssign} />
                </PopoverContent>
              </PopoverRoot>
            ) : (
              <span className="text-muted-foreground">Sin asignar</span>
            )}
          </Row>
          <Row label="Origen">
            {
              { MANUAL: 'Carga manual', PORTAL_COMERCIO: 'Portal del comercio', API: 'API' }[
                order.origin
              ]
            }
            <span className="text-muted-foreground">, creado {formatTime(order.createdAt)}</span>
          </Row>
        </dl>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t bg-subtle px-5 py-3">
        <Link
          to="/panel/prototipo/pedido/$id"
          params={{ id: order.id }}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLink aria-hidden="true" />
          Ver detalle completo
        </Link>
        {next && order.status !== 'PENDIENTE_ASIGNACION' && order.status !== 'RECIBIDO' ? (
          <Button size="sm" variant="ghost" onClick={onAdvance}>
            <FlaskConical aria-hidden="true" />
            Simular: {STATUS_META[next].short.toLowerCase()}
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:bg-tone-red-bg hover:text-tone-red-fg"
            onClick={onAskCancel}
          >
            Cancelar pedido
          </Button>
        ) : null}
      </footer>
    </>
  );
}
