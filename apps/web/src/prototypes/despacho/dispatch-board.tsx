/*
 * PROTOTIPO — Despacho en vivo. Datos de ejemplo y estado local; sin API.
 * Muestra: tablero por fase, asignación en ≤ 2 clics (o tecla A), asignación múltiple,
 * demoras por SLA, incidencias abiertas, llegada de pedidos, conexión en tiempo real.
 */
import type { ColumnDef } from '@tanstack/react-table';
import {
  Banknote,
  CircleCheck,
  Clock3,
  Flag,
  FlaskConical,
  LayoutGrid,
  List,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/states';
import { CashStatusPill, OrderStatusPill } from '@/components/ui/status-pill';
import { toast } from '@/components/ui/toast';
import { appConnection, type ConnectionState } from '@/hooks/use-connection-status';
import { useHotkeys } from '@/hooks/use-hotkeys';
import { formatMinutes, formatPYG, formatTime } from '@/lib/format';
import { canViewTransition, withViewTransition } from '@/lib/motion';
import { ORDER_STATUSES, STATUS_META } from '@/lib/order-states';
import { cn } from '@/lib/utils';
import {
  COURIERS,
  courierById,
  DEMO_NOW,
  incomingOrder,
  MERCHANTS,
  merchantById,
  type DemoCourier,
  type DemoOrder,
} from '../demo-data';
import { PrototypeBanner } from '../prototype-banner';
import {
  canAssign,
  CLOSED,
  COLUMNS,
  EMPTY_FILTERS,
  initialOrders,
  isActive,
  matches,
  minutesInState,
  nextHappyStatus,
  overdue,
  sortColumn,
  type BoardFilters,
} from './board-model';
import { CourierList, CourierPicker } from './couriers';
import { AgeBadge, IncidentFlag, OrderCard, shortName } from './order-card';
import { OrderSheet } from './order-sheet';

/** Reloj del prototipo: arranca en DEMO_NOW y avanza con el tiempo real. */
function useDemoClock(): string {
  const [now, setNow] = useState(DEMO_NOW);
  useEffect(() => {
    const start = Date.now();
    const base = new Date(DEMO_NOW).getTime();
    const timer = setInterval(() => {
      setNow(new Date(base + Date.now() - start).toISOString());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function SignalChip({
  icon: Icon,
  label,
  value,
  tone,
  pressed,
  onClick,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
  tone?: 'amber' | 'red';
  pressed?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0',
          tone === 'amber' && 'text-tone-amber-solid',
          tone === 'red' && 'text-tone-red-solid',
          !tone && 'text-muted-foreground',
        )}
      />
      <span className="font-numeric text-lg font-semibold leading-none">{value}</span>
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
    </>
  );
  const cls = cn(
    'inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 pointer-coarse:h-11',
    tone === 'amber' && Number(value) > 0 && 'border-tone-amber-solid/60 bg-tone-amber-bg/50',
    tone === 'red' && Number(value) > 0 && 'border-tone-red-solid/60 bg-tone-red-bg/50',
    !tone && 'border-transparent',
  );
  return onClick ? (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        cls,
        'transition-colors duration-(--dur-fast) hover:border-foreground/40',
        pressed && 'outline-2 outline-offset-1 outline-foreground',
      )}
    >
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export function DispatchPrototype() {
  const now = useDemoClock();
  const [orders, setOrders] = useState<DemoOrder[]>(initialOrders);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<'tablero' | 'lista'>('tablero');
  const [mobileCol, setMobileCol] = useState(COLUMNS[0]!.id);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [couriersOpen, setCouriersOpen] = useState(false);
  const [moving, setMoving] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const incoming = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const searchRef = useRef<HTMLInputElement>(null);

  // La conexión simulada maneja el indicador global; al salir, queda "en vivo".
  useEffect(() => () => appConnection.set('connected'), []);

  useHotkeys({ '/': () => searchRef.current?.focus() });

  const visible = useMemo(
    () => orders.filter((o) => matches(o, filters, now, merchantById(o.merchantId).name)),
    [orders, filters, now],
  );
  const byColumn = useMemo(
    () =>
      COLUMNS.map((col) => ({
        col,
        items: sortColumn(visible.filter((o) => col.statuses.includes(o.status))),
      })),
    [visible],
  );

  const active = orders.filter(isActive);
  const lateCount = active.filter((o) => overdue(o, now) > 0).length;
  const incidentCount = active.filter((o) => o.hasOpenIncident).length;
  const delivered = orders.filter((o) => o.status === 'ENTREGADO').length;
  const cashOnStreet = COURIERS.reduce((s, c) => s + c.cashInHand, 0);
  const openOrder = orders.find((o) => o.id === openId) ?? null;
  const currentFocus = focusId ?? byColumn.find((c) => c.items.length)?.items[0]?.id ?? null;

  /** Cambia pedidos con una transición de vista: las tarjetas viajan a su nueva columna. */
  function update(ids: string[], fn: (o: DemoOrder) => DemoOrder) {
    const apply = () => setOrders((prev) => prev.map((o) => (ids.includes(o.id) ? fn(o) : o)));
    if (view !== 'tablero' || !canViewTransition()) {
      apply();
      return;
    }
    flushSync(() => setMoving(new Set(ids)));
    void withViewTransition(apply).then(() => setMoving(new Set()));
  }

  function assign(ids: string[], courier: DemoCourier) {
    const before = orders.filter((o) => ids.includes(o.id));
    update(ids, (o) => ({
      ...o,
      status: 'ASIGNADO',
      courierId: courier.id,
      statusSince: now,
      isNew: false,
    }));
    setSelected(new Set());
    setAssignFor(null);
    setBulkOpen(false);
    setPulse({ id: courier.id, n: Date.now() });
    toast({
      tone: 'success',
      title:
        ids.length === 1
          ? `${ids[0]} asignado a ${shortName(courier.name)}`
          : `${ids.length} pedidos asignados a ${shortName(courier.name)}`,
      description: 'Le llega a su app. Esperando que acepte.',
      action: {
        label: 'Deshacer',
        onClick: () => {
          const snapshot = new Map(before.map((o) => [o.id, o]));
          update(ids, (o) => snapshot.get(o.id) ?? o);
          toast({ title: 'Asignación deshecha' });
        },
      },
    });
  }

  function simulateIncoming() {
    const n = incoming.current++;
    const order = incomingOrder(n, now);
    setOrders((prev) => [...prev, order]);
    const m = merchantById(order.merchantId);
    setAnnouncement(`Nuevo pedido ${order.id} de ${m.name}, a ${order.dropBarrio}.`);
    setTimeout(() => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, isNew: false } : o)));
    }, 4500);
  }

  function simulateProgress() {
    const candidate = sortColumn(
      orders.filter((o) =>
        ['ASIGNADO', 'ACEPTADO', 'EN_RETIRO', 'RETIRADO', 'EN_CAMINO'].includes(o.status),
      ),
    )[0];
    if (!candidate) return;
    advance(candidate, true);
  }

  function advance(order: DemoOrder, fromCourier = false) {
    const next = nextHappyStatus(order.status);
    if (!next) return;
    update([order.id], (o) => ({
      ...o,
      status: next,
      statusSince: now,
      cash: next === 'ENTREGADO' && o.cash === 'PENDIENTE' ? 'COBRADO' : o.cash,
    }));
    const courier = courierById(order.courierId);
    const text = `${order.id} pasó a ${STATUS_META[next].label.toLowerCase()}${
      fromCourier && courier ? ` (${shortName(courier.name)})` : ''
    }.`;
    if (fromCourier) setAnnouncement(text);
    else toast({ title: text });
  }

  function simulateConnection(state: ConnectionState) {
    appConnection.set(state);
    setConnection(state);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function focusCard(id: string | undefined) {
    if (!id) return;
    setFocusId(id);
    cardRefs.current.get(id)?.focus();
  }

  function onBoardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.matches('article[data-order-id]')) return;
    const id = target.dataset.orderId!;
    const cols = byColumn.filter((c) => c.items.length > 0);
    const ci = cols.findIndex((c) => c.items.some((o) => o.id === id));
    if (ci < 0) return;
    const items = cols[ci]!.items;
    const ri = items.findIndex((o) => o.id === id);
    const order = items[ri]!;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusCard(items[Math.min(ri + 1, items.length - 1)]?.id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusCard(items[Math.max(ri - 1, 0)]?.id);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault();
        const target = cols[ci + (e.key === 'ArrowRight' ? 1 : -1)];
        if (target) focusCard(target.items[Math.min(ri, target.items.length - 1)]?.id);
        break;
      }
      case 'Home':
        e.preventDefault();
        focusCard(items[0]?.id);
        break;
      case 'End':
        e.preventDefault();
        focusCard(items[items.length - 1]?.id);
        break;
      case 'Enter':
        e.preventDefault();
        setOpenId(id);
        break;
      case 'a':
      case 'A':
        if (canAssign(order)) {
          e.preventDefault();
          setAssignFor(id);
        }
        break;
      case 'x':
      case 'X':
        if (canAssign(order)) {
          e.preventDefault();
          toggleSelect(id);
        }
        break;
      case 'Escape':
        if (selected.size) {
          e.preventDefault();
          setSelected(new Set());
        }
        break;
    }
  }

  function renderCard(order: DemoOrder) {
    return (
      <li key={order.id}>
        <OrderCard
          ref={(el) => {
            if (el) cardRefs.current.set(order.id, el);
            else cardRefs.current.delete(order.id);
          }}
          order={order}
          now={now}
          focused={currentFocus === order.id}
          selected={selected.has(order.id)}
          moving={moving.has(order.id)}
          onFocusCard={() => setFocusId(order.id)}
          onOpen={() => setOpenId(order.id)}
          onToggleSelect={() => toggleSelect(order.id)}
          assignSlot={(trigger) => (
            <PopoverRoot
              open={assignFor === order.id}
              onOpenChange={(o) => setAssignFor(o ? order.id : null)}
            >
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <CourierPicker orders={orders} onPick={(c) => assign([order.id], c)} />
              </PopoverContent>
            </PopoverRoot>
          )}
        />
      </li>
    );
  }

  const hasFilters =
    filters.query !== '' ||
    filters.merchantId !== '' ||
    filters.courierId !== '' ||
    filters.onlyLate ||
    filters.onlyIncident;
  const filterCourier = courierById(filters.courierId);

  const listColumns: ColumnDef<DemoOrder>[] = [
    {
      accessorKey: 'id',
      header: 'Pedido',
      cell: (c) => (
        <button
          type="button"
          onClick={() => setOpenId(c.row.original.id)}
          className="rounded-xs font-numeric text-[0.9375rem] font-semibold hover:underline"
        >
          {c.getValue<string>()}
        </button>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      meta: {
        filterLabel: 'Filtrar por estado',
        filterOptions: ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
      },
      sortingFn: (a, b) =>
        ORDER_STATUSES.indexOf(a.original.status) - ORDER_STATUSES.indexOf(b.original.status),
      cell: (c) => (
        <span className="flex items-center gap-1.5">
          <OrderStatusPill status={c.row.original.status} short />
          {c.row.original.hasOpenIncident ? <IncidentFlag label={c.row.original.incident} /> : null}
        </span>
      ),
    },
    {
      id: 'tiempo',
      header: 'En el estado',
      accessorFn: (o) => minutesInState(o, now),
      cell: (c) =>
        CLOSED.includes(c.row.original.status) ? (
          <span className="text-muted-foreground">Cerrado</span>
        ) : (
          <AgeBadge order={c.row.original} now={now} />
        ),
    },
    {
      id: 'comercio',
      header: 'Comercio',
      accessorFn: (o) => merchantById(o.merchantId).name,
    },
    { accessorKey: 'dropBarrio', header: 'Destino' },
    {
      id: 'repartidor',
      header: 'Repartidor',
      accessorFn: (o) => courierById(o.courierId)?.name ?? '',
      cell: (c) =>
        c.getValue<string>() || <span className="text-muted-foreground">Sin asignar</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Cobro',
      meta: { numeric: true },
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-numeric">
            {c.row.original.amount ? formatPYG(c.row.original.amount) : '—'}
          </span>
          <CashStatusPill status={c.row.original.cash} />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PrototypeBanner>
        Datos de ejemplo. Usá el menú Simular para ver llegar pedidos o cortar la conexión.
      </PrototypeBanner>

      <PageHeader
        className="mb-0"
        title="Despacho"
        description={`Miércoles 18 de noviembre, ${formatTime(now)}. Primero lo que más espera.`}
        actions={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'tablero',
                  label: (
                    <>
                      <LayoutGrid aria-hidden="true" className="size-4" />
                      Tablero
                    </>
                  ),
                },
                {
                  value: 'lista',
                  label: (
                    <>
                      <List aria-hidden="true" className="size-4" />
                      Lista
                    </>
                  ),
                },
              ]}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FlaskConical aria-hidden="true" />
                  Simular
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Prototipo</DropdownMenuLabel>
                <DropdownMenuItem onSelect={simulateIncoming}>
                  Llega un pedido nuevo
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={simulateProgress}>
                  Un repartidor avanza un pedido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Conexión en tiempo real</DropdownMenuLabel>
                {(
                  [
                    ['connected', 'En vivo'],
                    ['reconnecting', 'Reconectando'],
                    ['disconnected', 'Sin conexión'],
                  ] as const
                ).map(([state, label]) => (
                  <DropdownMenuItem key={state} onSelect={() => simulateConnection(state)}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 rounded-full',
                        state === 'connected' && 'bg-tone-green-solid',
                        state === 'reconnecting' && 'bg-tone-amber-solid',
                        state === 'disconnected' && 'bg-tone-red-solid',
                      )}
                    />
                    {label}
                    {connection === state ? <span className="sr-only"> (actual)</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="2xl:hidden"
              onClick={() => setCouriersOpen(true)}
            >
              <Users aria-hidden="true" />
              Repartidores
            </Button>
            <Button
              size="sm"
              onClick={() => toast({ title: 'Prototipo: la carga de pedidos llega en R2' })}
            >
              <Plus aria-hidden="true" />
              Nuevo pedido
            </Button>
          </>
        }
      />

      {/* Señales: cada cifra es también un filtro. */}
      <div
        role="group"
        aria-label="Resumen y filtros rápidos"
        className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin"
      >
        <SignalChip
          icon={Clock3}
          label="demorados"
          value={lateCount}
          tone="amber"
          pressed={filters.onlyLate}
          onClick={() => setFilters((f) => ({ ...f, onlyLate: !f.onlyLate }))}
        />
        <SignalChip
          icon={Flag}
          label="con incidencia"
          value={incidentCount}
          tone="red"
          pressed={filters.onlyIncident}
          onClick={() => setFilters((f) => ({ ...f, onlyIncident: !f.onlyIncident }))}
        />
        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
        <SignalChip icon={LayoutGrid} label="en curso" value={active.length} />
        <SignalChip icon={UserPlus} label="por asignar" value={byColumn[0]!.items.length} />
        <SignalChip icon={CircleCheck} label="entregados hoy" value={delivered} />
        <SignalChip icon={Banknote} label="efectivo en la calle" value={formatPYG(cashOnStreet)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Buscar pedido, comercio o barrio"
            aria-keyshortcuts="/"
            placeholder="Buscar pedido, comercio o barrio"
            className="pl-8 pr-8"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
          <Kbd className="pointer-events-none absolute right-2 top-2 pointer-coarse:hidden">/</Kbd>
        </div>
        <Select
          aria-label="Filtrar por comercio"
          className="w-auto min-w-44"
          value={filters.merchantId}
          onChange={(e) => setFilters((f) => ({ ...f, merchantId: e.target.value }))}
        >
          <option value="">Todos los comercios</option>
          {MERCHANTS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        {filterCourier ? (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, courierId: '' }))}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand-soft px-2 text-[0.8125rem] font-semibold text-brand-ink"
          >
            Repartidor: {filterCourier.name}
            <X aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(quitar filtro)</span>
          </button>
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Limpiar filtros
          </Button>
        ) : null}
        <p className="ml-auto hidden text-xs text-muted-foreground xl:block">
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>←</Kbd> <Kbd>→</Kbd> moverse, <Kbd>A</Kbd> asignar,{' '}
          <Kbd>?</Kbd> todos los atajos
        </p>
      </div>

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          {view === 'tablero' ? (
            <>
              {/* Móvil y tablet: una columna a la vez. */}
              <div className="-mx-1 overflow-x-auto px-1 pb-2 xl:hidden">
                <Segmented
                  label="Columna del tablero"
                  value={mobileCol}
                  onChange={setMobileCol}
                  options={byColumn.map(({ col, items }) => ({
                    value: col.id,
                    label: col.title,
                    count: items.length,
                  }))}
                />
              </div>
              <div
                role="region"
                aria-label="Tablero de despacho"
                aria-describedby="board-help"
                onKeyDown={onBoardKeyDown}
                className="grid gap-3 xl:grid-cols-5"
              >
                <p id="board-help" className="sr-only">
                  Cada pedido es una tarjeta. Flechas para moverte entre pedidos y columnas, Enter
                  para abrir, A para asignar, X para seleccionar.
                </p>
                {byColumn.map(({ col, items }) => {
                  const late = items.filter((o) => overdue(o, now) > 0).length;
                  const oldest = items[0] ? minutesInState(items[0], now) : null;
                  return (
                    <section
                      key={col.id}
                      aria-labelledby={`col-${col.id}`}
                      className={cn('min-w-0', mobileCol !== col.id && 'hidden xl:block')}
                    >
                      <header className="sticky -top-4 z-10 -mx-1 mb-2 flex items-end gap-2 bg-background/95 px-1 pb-2 pt-1 backdrop-blur-sm md:-top-6">
                        <div className="min-w-0 flex-1">
                          <h2
                            id={`col-${col.id}`}
                            className="flex items-baseline gap-2 font-display text-base font-semibold"
                          >
                            {col.title}
                            <span className="font-numeric text-xl leading-none">
                              {items.length}
                            </span>
                          </h2>
                          <p className="truncate text-xs text-muted-foreground">
                            {items.length === 0
                              ? col.hint
                              : late > 0
                                ? `${late} demorado${late > 1 ? 's' : ''}, el más antiguo ${formatMinutes(oldest ?? 0)}`
                                : `El más antiguo: ${formatMinutes(oldest ?? 0)}`}
                          </p>
                        </div>
                      </header>
                      {items.length === 0 ? (
                        <p className="rounded-md border border-dashed border-input px-3 py-6 text-center text-[0.8125rem] text-muted-foreground">
                          {hasFilters ? 'Nada con estos filtros' : 'Sin pedidos'}
                        </p>
                      ) : (
                        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                          {items.map(renderCard)}
                        </ol>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          ) : (
            <DataTable
              label="Pedidos de hoy"
              columns={listColumns}
              data={visible}
              getRowId={(o) => o.id}
              pageSize={25}
              searchPlaceholder="Buscar en la lista"
              maxHeightClass="max-h-none"
              rowClassName={(o) => (o.isNew ? 'animate-trace' : undefined)}
              emptyState={
                <EmptyState
                  title="Sin pedidos hoy"
                  description="Cuando entre el primero, aparece acá y en el tablero."
                />
              }
            />
          )}
        </div>

        <aside
          aria-labelledby="couriers-title"
          className="sticky top-0 hidden w-72 shrink-0 rounded-lg border bg-card p-3 2xl:block"
        >
          <h2 id="couriers-title" className="mb-2 px-1 font-display text-base font-semibold">
            Repartidores
          </h2>
          <CourierList
            orders={orders}
            activeId={filters.courierId}
            pulse={pulse}
            onToggle={(id) =>
              setFilters((f) => ({ ...f, courierId: f.courierId === id ? '' : id }))
            }
          />
        </aside>
      </div>

      {selected.size > 0 ? (
        <div className="sticky bottom-0 z-20 -mx-3 mt-2 animate-fade-in border-t bg-card/95 px-3 py-2.5 backdrop-blur-sm sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="font-semibold">
              {selected.size}{' '}
              {selected.size === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}
            </p>
            <PopoverRoot open={bulkOpen} onOpenChange={setBulkOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" className="ml-auto">
                  <UserPlus aria-hidden="true" />
                  Asignar a un repartidor
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" side="top" align="end">
                <CourierPicker
                  orders={orders}
                  count={selected.size}
                  onPick={(c) => assign([...selected], c)}
                />
              </PopoverContent>
            </PopoverRoot>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpiar selección
            </Button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <OrderSheet
        order={openOrder}
        orders={orders}
        now={now}
        onOpenChange={(o) => !o && setOpenId(null)}
        onAssign={(order, c) => assign([order.id], c)}
        onAdvance={(order) => advance(order)}
        onCancel={(order, reason) => {
          setOpenId(null);
          update([order.id], (o) => ({ ...o, status: 'CANCELADO', statusSince: now }));
          toast({ title: `${order.id} cancelado`, description: `Motivo: ${reason}.` });
        }}
        onResolveIncident={(order) => {
          update([order.id], (o) => ({ ...o, hasOpenIncident: false }));
          toast({ tone: 'success', title: `Incidencia de ${order.id} resuelta` });
        }}
      />

      <Dialog open={couriersOpen} onOpenChange={setCouriersOpen}>
        <SheetContent side="right" className="sm:w-[24rem]">
          <div className="border-b px-5 pb-3 pt-5">
            <DialogTitle className="font-display text-xl font-semibold">Repartidores</DialogTitle>
            <DialogDescription>Tocá uno para ver solo sus pedidos.</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <CourierList
              orders={orders}
              activeId={filters.courierId}
              pulse={pulse}
              onToggle={(id) => {
                setFilters((f) => ({ ...f, courierId: f.courierId === id ? '' : id }));
                setCouriersOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );
}
