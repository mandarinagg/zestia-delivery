/*
 * PROTOTIPO — hojas inferiores de la app del repartidor (entrega, no entrega, rechazo, cola).
 * Solo estado local; no hay llamadas a la API.
 */
import { CloudOff } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SheetContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatPYG, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INCIDENT_CATEGORIES } from '../demo-data';
import type { CourierOrder } from './courier-data';

function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-[30rem] text-[1.0625rem]"
        closeClassName="size-11"
      >
        <DialogHeader className="pt-3">
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-base">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <DialogBody className="pb-4">{children}</DialogBody>
        {footer ? (
          <DialogFooter className="gap-3 bg-card pb-4 sm:flex-col sm:justify-stretch">
            {footer}
          </DialogFooter>
        ) : null}
      </SheetContent>
    </Dialog>
  );
}

/** Lista de opciones grande (radio nativo, 52 px por fila) para elegir con el pulgar. */
function ChoiceList({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-col divide-y rounded-lg border">
        {options.map((o) => (
          <label
            key={o}
            className={cn(
              'flex min-h-13 cursor-pointer items-center gap-3 px-3 py-2 first:rounded-t-lg last:rounded-b-lg',
              value === o && 'bg-accent font-semibold text-accent-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="size-5 shrink-0 accent-primary"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DeliverSheet({
  order,
  onOpenChange,
  onConfirm,
}: {
  order: CourierOrder | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (collected?: number) => void;
}) {
  const [other, setOther] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const cash = order ? order.method === 'EFECTIVO' && order.amount > 0 : false;

  function reset(open: boolean) {
    if (!open) {
      setOther(false);
      setValue('');
      setError(null);
    }
    onOpenChange(open);
  }

  function confirmOther() {
    const n = Number(value.replace(/\./g, ''));
    if (!value.trim() || !Number.isSafeInteger(n) || n <= 0) {
      setError('Ingresá el monto en guaraníes, sin decimales. Ejemplo: 80000.');
      return;
    }
    onConfirm(n);
    reset(false);
  }

  return (
    <BottomSheet
      open={order !== null}
      onOpenChange={reset}
      title="Registrar entrega"
      description={order ? `${order.id} para ${order.recipient}` : undefined}
      footer={
        order ? (
          cash ? (
            <>
              <Button
                size="xl"
                className="w-full"
                onClick={() => {
                  onConfirm(order.amount);
                  reset(false);
                }}
              >
                Cobré {formatPYG(order.amount)}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                aria-expanded={other}
                onClick={() => setOther((o) => !o)}
              >
                Cobré otro monto
              </Button>
            </>
          ) : (
            <Button
              size="xl"
              className="w-full"
              onClick={() => {
                onConfirm();
                reset(false);
              }}
            >
              Confirmar entrega
            </Button>
          )
        ) : null
      }
    >
      {order && cash ? (
        <div className="rounded-lg bg-tone-amber-bg p-4 text-tone-amber-fg">
          <p className="text-base font-semibold">Cobrar en efectivo</p>
          <p className="font-numeric text-[2.5rem] font-semibold leading-tight">
            {formatPYG(order.amount)}
          </p>
        </div>
      ) : order ? (
        <p className="rounded-lg bg-tone-green-bg p-4 font-semibold text-tone-green-fg">
          No hay nada para cobrar: ya está pagado.
        </p>
      ) : null}
      {other ? (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor={inputId} className="font-semibold">
            Monto cobrado (Gs.)
          </label>
          <Input
            id={inputId}
            inputMode="numeric"
            autoFocus
            className="h-13 text-xl"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
          {error ? (
            <p
              id={`${inputId}-err`}
              role="alert"
              className="text-sm font-semibold text-destructive"
            >
              {error}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Despacho va a ver la diferencia con lo esperado.
            </p>
          )}
          <Button size="xl" variant="secondary" className="w-full" onClick={confirmOther}>
            Registrar con este monto
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

export function FailSheet({
  order,
  onOpenChange,
  onConfirm,
}: {
  order: CourierOrder | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (category: string) => void;
}) {
  const [category, setCategory] = useState<string>('');
  return (
    <BottomSheet
      open={order !== null}
      onOpenChange={(o) => {
        if (!o) setCategory('');
        onOpenChange(o);
      }}
      title="No pude entregar"
      description="Elegí qué pasó. Despacho decide si se reprograma o vuelve al comercio."
      footer={
        <Button
          size="xl"
          className="w-full"
          disabled={!category}
          onClick={() => {
            onConfirm(category);
            setCategory('');
          }}
        >
          Registrar incidencia
        </Button>
      }
    >
      <ChoiceList
        name="incidencia"
        legend="Qué pasó"
        options={INCIDENT_CATEGORIES.filter((c) => c !== 'Comercio cerrado')}
        value={category}
        onChange={setCategory}
      />
    </BottomSheet>
  );
}

export function RejectSheet({
  order,
  onOpenChange,
  onConfirm,
  reasons,
}: {
  order: CourierOrder | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  reasons: readonly string[];
}) {
  const [reason, setReason] = useState('');
  return (
    <BottomSheet
      open={order !== null}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
      title="Rechazar pedido"
      description={
        order ? `${order.id} vuelve a despacho para que lo asignen a otra persona.` : undefined
      }
      footer={
        <Button
          size="xl"
          variant="destructive"
          className="w-full"
          disabled={!reason}
          onClick={() => {
            onConfirm(reason);
            setReason('');
          }}
        >
          Rechazar pedido
        </Button>
      }
    >
      <ChoiceList
        name="motivo"
        legend="Motivo del rechazo"
        options={reasons}
        value={reason}
        onChange={setReason}
      />
    </BottomSheet>
  );
}

export interface QueuedChange {
  key: number;
  orderId: string;
  label: string;
  at: string;
}

export function QueueSheet({
  open,
  onOpenChange,
  queue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueuedChange[];
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Cambios sin enviar"
      description="Están guardados en este teléfono. Se envían solos, en orden, cuando vuelve la señal."
    >
      {queue.length === 0 ? (
        <p className="py-4 text-muted-foreground">No hay cambios pendientes.</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {queue.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-3 py-3">
              <CloudOff aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.label}</span>
                <span className="block text-sm text-muted-foreground">{c.orderId}</span>
              </span>
              <span className="font-numeric text-lg">
                <span className="sr-only">Hora del teléfono: </span>
                {formatTime(c.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </BottomSheet>
  );
}
