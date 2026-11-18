import { Command } from 'cmdk';
import { Bike, Car, Footprints, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/ui/status-pill';
import { formatPYG } from '@/lib/format';
import { COURIER_AVAILABILITY } from '@/lib/order-states';
import { cn } from '@/lib/utils';
import {
  COURIERS,
  VEHICLE_LABEL,
  type DemoCourier,
  type DemoOrder,
  type Vehicle,
} from '../demo-data';
import { activeLoad } from './board-model';

const VEHICLE_ICON: Record<Vehicle, typeof Bike> = {
  MOTO: Bike,
  BICI: Bike,
  AUTO: Car,
  A_PIE: Footprints,
};

/** Carga actual como marcas: se lee de un vistazo sin contar números. */
export function LoadMeter({ load, max = 4 }: { load: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-1 rounded-full',
            i < load ? (load >= max ? 'bg-tone-amber-solid' : 'bg-tone-blue-solid') : 'bg-muted',
          )}
        />
      ))}
    </span>
  );
}

function loadText(load: number) {
  return load === 0 ? 'Sin pedidos' : load === 1 ? '1 pedido en curso' : `${load} pedidos en curso`;
}

/**
 * Selector de repartidor para asignar (dentro de un Popover). Lista filtrable con teclado;
 * primero los disponibles y los de menor carga. Fuera de turno: visibles pero no elegibles
 * (la máquina de estados exige DISPONIBLE u OCUPADO).
 */
export function CourierPicker({
  orders,
  onPick,
  count = 1,
}: {
  orders: DemoOrder[];
  onPick: (courier: DemoCourier) => void;
  count?: number;
}) {
  const sorted = [...COURIERS].sort((a, b) => {
    const rank = (c: DemoCourier) =>
      c.availability === 'FUERA_DE_TURNO' ? 2 : c.availability === 'DISPONIBLE' ? 0 : 1;
    return rank(a) - rank(b) || activeLoad(orders, a.id) - activeLoad(orders, b.id);
  });
  return (
    <Command label="Elegir repartidor" loop className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input
          autoFocus
          placeholder={count > 1 ? `Asignar ${count} pedidos a…` : 'Asignar a…'}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Command.List className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          Ningún repartidor con ese nombre.
        </Command.Empty>
        {sorted.map((c) => {
          const load = activeLoad(orders, c.id);
          const off = c.availability === 'FUERA_DE_TURNO';
          const VIcon = VEHICLE_ICON[c.vehicle];
          return (
            <Command.Item
              key={c.id}
              value={c.name}
              disabled={off}
              onSelect={() => onPick(c)}
              className="flex min-h-11 cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:opacity-55 data-[selected=true]:bg-accent"
            >
              <Avatar name={c.name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <VIcon aria-hidden="true" className="size-3.5" />
                  {VEHICLE_LABEL[c.vehicle]},{' '}
                  {off ? 'fuera de turno' : loadText(load).toLowerCase()}
                </span>
              </span>
              {off ? null : <LoadMeter load={load} />}
            </Command.Item>
          );
        })}
      </Command.List>
    </Command>
  );
}

/** Lista de repartidores con disponibilidad, carga y efectivo en mano. Filtra el tablero. */
export function CourierList({
  orders,
  activeId,
  onToggle,
  pulse,
}: {
  orders: DemoOrder[];
  activeId: string;
  onToggle: (id: string) => void;
  /** Repartidor que acaba de recibir un pedido: su fila destella una vez. */
  pulse?: { id: string; n: number } | null;
}) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Repartidores">
      {COURIERS.map((c) => {
        const load = activeLoad(orders, c.id);
        const meta = COURIER_AVAILABILITY[c.availability];
        const active = activeId === c.id;
        return (
          <li key={pulse?.id === c.id ? `${c.id}-${pulse.n}` : c.id}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(c.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-2 text-left hover:bg-subtle',
                active && 'border-brand bg-brand-soft/50',
                pulse?.id === c.id && 'animate-settle',
              )}
            >
              <Avatar name={c.name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[0.8125rem] font-semibold">{c.name}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <StatusPill tone={meta.tone} className="px-1 py-0 text-[0.6875rem]">
                    {meta.label}
                  </StatusPill>
                  <span className="text-xs text-muted-foreground">{loadText(load)}</span>
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <LoadMeter load={load} />
                {c.cashInHand > 0 ? (
                  <span className="font-numeric text-xs text-muted-foreground">
                    {formatPYG(c.cashInHand)}
                    <span className="sr-only"> de efectivo en mano</span>
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
