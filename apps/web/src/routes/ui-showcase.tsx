import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, FlaskConical, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SampleForm } from '@/components/forms/sample-form';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { PageHeader } from '@/components/layout/page-header';
import { PROTOTYPES } from '@/components/layout/nav';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConnectionStatus, LiveIndicator } from '@/components/ui/connection-status';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { CashRail, OrderRail } from '@/components/ui/order-rail';
import { Hint, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, LoadingState, Reveal, Skeleton } from '@/components/ui/states';
import {
  CashStatusPill,
  OrderStatusPill,
  StatusGlyph,
  StatusPill,
} from '@/components/ui/status-pill';
import { toast } from '@/components/ui/toast';
import { TONE_CLASS } from '@/components/ui/tone';
import { createConnectionSource, type ConnectionState } from '@/hooks/use-connection-status';
import { formatDateTime, formatPYG } from '@/lib/format';
import { withViewTransition, vtName, prefersReducedMotion } from '@/lib/motion';
import {
  CASH_META,
  CASH_STATUSES,
  ORDER_STATUSES,
  STATUS_META,
  type OrderStatus,
  type Tone,
} from '@/lib/order-states';
import { cn } from '@/lib/utils';

/* Todo lo de esta página es DATO DE EJEMPLO obvio. No es información real. */

interface DemoRow {
  id: string;
  comercio: string;
  estado: OrderStatus;
  monto: number;
  creado: string;
}

const ACTIVE_STATES = ORDER_STATUSES;
const DEMO_ROWS: DemoRow[] = Array.from({ length: 37 }, (_, i) => ({
  id: `DEMO-${String(i + 1).padStart(3, '0')}`,
  comercio: `Comercio de ejemplo ${(i % 5) + 1}`,
  estado: ACTIVE_STATES[i % ACTIVE_STATES.length]!,
  monto: 10000 + ((i * 7919) % 90) * 1000,
  creado: new Date(Date.UTC(2026, 0, 15, 12, 0) + i * 17 * 60_000).toISOString(),
}));

const columns: ColumnDef<DemoRow>[] = [
  {
    accessorKey: 'id',
    header: 'Pedido',
    cell: (c) => (
      <span className="font-numeric text-[0.9375rem] font-semibold">{c.getValue<string>()}</span>
    ),
  },
  { accessorKey: 'comercio', header: 'Comercio' },
  {
    accessorKey: 'estado',
    header: 'Estado',
    meta: {
      filterLabel: 'Filtrar por estado',
      filterOptions: ORDER_STATUSES.map((k) => ({ value: k, label: STATUS_META[k].label })),
    },
    sortingFn: (a, b) =>
      ORDER_STATUSES.indexOf(a.original.estado) - ORDER_STATUSES.indexOf(b.original.estado),
    cell: (c) => <OrderStatusPill status={c.getValue<OrderStatus>()} short />,
  },
  {
    accessorKey: 'monto',
    header: 'Monto',
    meta: { numeric: true },
    cell: (c) => <span className="font-numeric">{formatPYG(c.getValue<number>())}</span>,
  },
  {
    accessorKey: 'creado',
    header: 'Creado',
    cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue<string>())}</span>,
  },
];

const demoConnection = createConnectionSource('connected');

const SECTIONS = [
  ['principios', 'Principios'],
  ['prototipos', 'Prototipos'],
  ['color', 'Color'],
  ['tipografia', 'Tipografía'],
  ['estados', 'Estados del pedido'],
  ['movimiento', 'Movimiento'],
  ['componentes', 'Componentes'],
  ['tabla', 'Tabla'],
  ['formularios', 'Formularios'],
  ['vacios', 'Vacío, error y carga'],
  ['conexion', 'Conexión'],
  ['forma', 'Espacio, radios y elevación'],
] as const;

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-t`}
      className="scroll-mt-4 border-t pt-6 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-t`} className="font-display text-[1.375rem] font-semibold leading-7">
        {title}
      </h2>
      {lead ? <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{lead}</p> : null}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

const TONES: { tone: Tone; name: string; use: string }[] = [
  { tone: 'slate', name: 'Pizarra', use: 'Entrada (recibido, por asignar), cancelado, neutro' },
  { tone: 'blue', name: 'Azul', use: 'Asignación (asignado, aceptado), cobrado' },
  { tone: 'teal', name: 'Verde agua', use: 'Retiro (en retiro, retirado), liquidado' },
  { tone: 'violet', name: 'Violeta', use: 'En camino' },
  { tone: 'green', name: 'Verde', use: 'Entregado, rendido, disponible' },
  { tone: 'red', name: 'Rojo', use: 'No entregado, incidencia abierta, error' },
  { tone: 'amber', name: 'Ámbar', use: 'Demora (SLA vencido), por cobrar, reconectando' },
  { tone: 'earth', name: 'Tierra', use: 'Devolución (en devolución, devuelto)' },
];

const SURFACES = [
  ['background', 'Fondo de la app'],
  ['card', 'Superficie'],
  ['subtle', 'Hover, pie de cajón'],
  ['muted', 'Relleno, riel vacío'],
  ['accent', 'Selección neutra'],
  ['primary', 'Acción principal (tinta)'],
  ['brand', 'Lapacho: marca, foco, lo nuevo'],
  ['brand-soft', 'Tinte de llegada'],
  ['sidebar', 'Barra lateral'],
] as const;

const SURFACE_CLASS: Record<(typeof SURFACES)[number][0], string> = {
  background: 'bg-background',
  card: 'bg-card',
  subtle: 'bg-subtle',
  muted: 'bg-muted',
  accent: 'bg-accent',
  primary: 'bg-primary',
  brand: 'bg-brand',
  'brand-soft': 'bg-brand-soft',
  sidebar: 'bg-sidebar',
};

const MOTION_TOKENS = [
  ['--dur-instant', '90 ms', 'Salida de menús, presión de botón'],
  ['--dur-fast', '140 ms', 'Hover, color, aparición de popover y tooltip'],
  ['--dur-base', '220 ms', 'Avisos, banners, cierre de cajón'],
  ['--dur-slow', '320 ms', 'Apertura de cajón, llegada de pedido'],
  ['--dur-move', '420 ms', 'Tarjeta que cambia de columna (View Transition)'],
  ['--dur-trace', '4 s', 'Rastro lapacho de un pedido nuevo (se apaga solo)'],
  ['--ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)', 'Entradas: llega rápido, frena suave'],
  ['--ease-in', 'cubic-bezier(0.5, 0, 0.75, 0)', 'Salidas: se va sin rebote'],
  ['--ease-standard', 'cubic-bezier(0.3, 0, 0.2, 1)', 'Cambios de color y fundidos'],
  ['--ease-move', 'cubic-bezier(0.25, 0.9, 0.3, 1.04)', 'Desplazamientos: leve asentamiento'],
] as const;

/** Demo: una tarjeta que viaja entre dos columnas con View Transitions. */
function MoveDemo() {
  const [col, setCol] = useState<0 | 1>(0);
  const [moving, setMoving] = useState(false);
  const status: OrderStatus = col === 0 ? 'PENDIENTE_ASIGNACION' : 'ASIGNADO';
  function move() {
    setMoving(true);
    void withViewTransition(() => setCol((c) => (c === 0 ? 1 : 0))).then(() => setMoving(false));
  }
  const card = (
    <div
      style={moving ? { viewTransitionName: vtName('demo', 'move') } : undefined}
      className="flex flex-col gap-1.5 rounded-md border bg-card p-2.5 text-[0.8125rem]"
    >
      <span className="font-numeric text-[0.9375rem] font-semibold">DEMO-001</span>
      <OrderStatusPill status={status} short />
      <OrderRail status={status} />
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {['Por asignar', 'Asignados'].map((t, i) => (
          <div key={t} className="min-h-32 rounded-md border border-dashed border-input p-2">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{t}</p>
            {col === i ? card : null}
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={move} className="self-start">
        {col === 0 ? 'Asignar' : 'Desasignar'}
      </Button>
    </div>
  );
}

function ArrivalDemo() {
  const [items, setItems] = useState<number[]>([1]);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex min-h-32 flex-col gap-2">
        {items.map((n) => (
          <li
            key={n}
            className={cn(
              'flex items-center justify-between rounded-md border bg-card p-2.5 text-[0.8125rem]',
              n > 1 && 'animate-trace',
            )}
          >
            <span className="font-numeric text-[0.9375rem] font-semibold">
              DEMO-{String(100 + n)}
            </span>
            <span className="text-muted-foreground">recién llegado</span>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setItems((l) => [...l.slice(-2), (l.at(-1) ?? 0) + 1])}
      >
        Simular llegada
      </Button>
    </div>
  );
}

function SkeletonDemo() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-32 rounded-md border bg-card p-3">
        {loaded ? (
          <Reveal className="flex flex-col gap-1.5">
            <p className="font-semibold">Lomitería Demo</p>
            <p className="text-[0.8125rem] text-muted-foreground">Sucursal Villa Morra</p>
            <OrderRail status="EN_RETIRO" />
          </Reveal>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-1 h-1 w-full" />
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setLoaded((l) => !l)}
      >
        {loaded ? 'Volver al esqueleto' : 'Cargar contenido'}
      </Button>
    </div>
  );
}

function DemoBox({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-subtle p-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-[0.8125rem] text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  );
}

export function UiShowcasePage() {
  const [conn, setConn] = useState<ConnectionState>('connected');
  const [tableMode, setTableMode] = useState<'ok' | 'loading' | 'error' | 'empty'>('ok');
  const [selected, setSelected] = useState(0);
  const [segment, setSegment] = useState<'tablero' | 'lista'>('tablero');
  const reduced = prefersReducedMotion();

  function setConnection(next: ConnectionState) {
    demoConnection.set(next);
    setConn(next);
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      <nav
        aria-label="Secciones de la guía"
        className="sticky top-0 hidden h-fit w-48 shrink-0 lg:block"
      >
        <ul className="flex flex-col border-l">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[0.8125rem] text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <PageHeader
          className="mb-0"
          title="Guía de UI"
          description="Riel, el sistema de diseño de ZESTIA Delivery. Referencia viva para desarrollo y revisión: todos los datos son de ejemplo."
        />

        <Section id="principios" title="Principios">
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-sidebar p-5 text-sidebar-foreground">
            <LogoMark className="size-12" />
            <div className="min-w-0 flex-1">
              <Wordmark className="text-2xl" />
              <p className="mt-1 text-sm text-sidebar-muted">
                La Z es un recorrido: sale del comercio y llega a la puerta.
              </p>
            </div>
            <div className="w-full max-w-60">
              <OrderRail status="EN_CAMINO" size="md" />
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {[
              [
                'Calma con señales',
                'La pantalla está quieta y en tinta. El color aparece solo cuando significa algo: fase del pedido, demora, incidencia, conexión.',
              ],
              [
                'El tiempo es el dato',
                'Cada pedido muestra cuánto lleva en su estado, en cifras grandes y tabulares. Cuando pasa el objetivo se vuelve ámbar y sube en la lista.',
              ],
              [
                'Color para la fase, forma para el estado',
                'Ocho tonos por fase y un glifo que se llena a medida que avanza. Nada depende solo del color.',
              ],
              [
                'Movimiento que explica',
                'Solo se mueve lo que cambió: la tarjeta viaja a su nueva columna, lo nuevo deja un rastro lapacho que se apaga solo.',
              ],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-brand pl-3">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">{d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="prototipos"
          title="Prototipos"
          lead="Pantallas de alta fidelidad con datos de ejemplo y estado local. No llaman a la API: la funcionalidad real llega en sus issues."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {PROTOTYPES.map((p) => (
              <li key={p.to}>
                <Link
                  to={p.to}
                  params={'params' in p ? p.params : undefined}
                  className="flex h-full items-start gap-3 rounded-lg border bg-card p-3 hover:border-foreground/40"
                >
                  <FlaskConical
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-brand-ink"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-[0.8125rem] text-muted-foreground">
                      {p.description}
                    </span>
                    <code className="mt-1 block truncate text-xs text-muted-foreground">
                      {'href' in p ? p.href : p.to}
                    </code>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="color"
          title="Color"
          lead="Tinta y lapacho son la identidad; los ocho tonos son información. Todos los pares están verificados WCAG AA con pnpm --filter @zestia/web contrast, en claro y oscuro."
        >
          <Sub title="Superficies y marca">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {SURFACES.map(([token, use]) => (
                <li key={token} className="overflow-hidden rounded-md border bg-card">
                  <span
                    aria-hidden="true"
                    className={cn('block h-12 border-b', SURFACE_CLASS[token])}
                  />
                  <span className="block px-2 py-1.5">
                    <code className="block text-xs font-semibold">{token}</code>
                    <span className="block text-xs text-muted-foreground">{use}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Sub>
          <Sub title="Tonos de estado (fondo, texto, sólido)">
            <ul className="grid gap-2 sm:grid-cols-2">
              {TONES.map(({ tone, name, use }) => {
                const t = TONE_CLASS[tone];
                return (
                  <li key={tone} className="flex items-center gap-3 rounded-md border bg-card p-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-11 shrink-0 place-items-center rounded-sm font-display text-lg font-bold',
                        t.bg,
                        t.fg,
                      )}
                    >
                      Aa
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn('h-11 w-2 shrink-0 rounded-full', t.solid)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {name}{' '}
                        <code className="text-xs font-normal text-muted-foreground">
                          tone-{tone}
                        </code>
                      </span>
                      <span className="block text-xs text-muted-foreground">{use}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Sub>
        </Section>

        <Section
          id="tipografia"
          title="Tipografía"
          lead="Dos familias con trabajos distintos, autoalojadas con @fontsource (sin red externa)."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Lectura: Atkinson Hyperlegible Next</p>
              <p className="mt-2 text-2xl">Il1 O0 rn m 5S 8B</p>
              <p className="mt-2 text-sm">
                Diseñada para baja visión: cada letra se distingue de su vecina. Importa para
                códigos, patentes y direcciones leídas al sol o después de ocho horas de turno.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Señalética y cifras: Barlow Semi Condensed
              </p>
              <p className="mt-2 font-numeric text-4xl font-semibold leading-none">
                Gs. 85.000 <span className="text-tone-amber-fg">41 min</span>
              </p>
              <p className="mt-2 text-sm">
                Nacida de la señalización vial: títulos, contadores, tiempos y montos. Angosta, para
                que la cifra grande entre en una tarjeta de 200 px.
              </p>
            </div>
          </div>
          <Sub title="Escala">
            <ul className="divide-y rounded-lg border bg-card">
              {[
                ['font-display text-4xl font-bold', 'Display 36', 'Portada, seguimiento público'],
                ['font-display text-[1.75rem] font-semibold', 'Título 28', 'Título de página'],
                ['font-display text-[1.375rem] font-semibold', 'Sección 22', 'Secciones'],
                ['font-display text-[1.0625rem] font-semibold', 'Bloque 17', 'Columnas, tarjetas'],
                ['text-base', 'Cuerpo 16', 'PWA del repartidor (base)'],
                ['text-sm', 'Cuerpo 14', 'Panel (base)'],
                ['text-[0.8125rem]', 'Detalle 13', 'Tarjetas densas, metadatos'],
                ['text-xs', 'Mínimo 12', 'Etiquetas de estado, ayudas'],
              ].map(([cls, name, use]) => (
                <li
                  key={name}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5"
                >
                  <span className={cn('min-w-0 flex-1 truncate', cls)}>Pedido en camino</span>
                  <span className="text-xs text-muted-foreground">
                    {name}, {use}
                  </span>
                </li>
              ))}
            </ul>
          </Sub>
        </Section>

        <Section
          id="estados"
          title="Estados del pedido"
          lead="Los doce estados reales de docs/ORDER_STATE_MACHINE.md. El riel (ocho tramos) es la firma del sistema: aparece igual en el tablero, el detalle, la app del repartidor y el seguimiento."
        >
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Estados del pedido con su etiqueta, riel y fase</caption>
              <thead className="bg-subtle text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="h-9 px-3 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-3 font-semibold">
                    Etiqueta
                  </th>
                  <th scope="col" className="w-48 px-3 font-semibold">
                    Riel
                  </th>
                  <th scope="col" className="px-3 font-semibold">
                    Corta
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDER_STATUSES.map((s) => (
                  <tr key={s} className="border-t">
                    <td className="px-3 py-2">
                      <code className="text-xs">{s}</code>
                    </td>
                    <td className="px-3 py-2">
                      <OrderStatusPill status={s} />
                    </td>
                    <td className="px-3 py-2">
                      <OrderRail status={s} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-[0.8125rem]">
                        <StatusGlyph status={s} />
                        {STATUS_META[s].short}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Sub title="Cobro (independiente de la entrega)">
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap gap-2">
                  {CASH_STATUSES.map((s) => (
                    <CashStatusPill key={s} status={s} title={CASH_META[s].hint} />
                  ))}
                </div>
                <CashRail status="COBRADO" />
              </div>
            </Sub>
            <Sub title="Señales que se suman a cualquier estado">
              <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
                <p className="flex items-center gap-2">
                  <StatusPill tone="amber">Demorado +7 min</StatusPill>
                  tiempo en el estado mayor al objetivo
                </p>
                <p className="flex items-center gap-2">
                  <StatusPill tone="red">Incidencia abierta</StatusPill>
                  no es un estado, es una marca
                </p>
                <p className="flex items-center gap-2">
                  <Badge variant="brand">Nuevo</Badge>
                  rastro lapacho que se apaga en 4 s
                </p>
              </div>
            </Sub>
          </div>
        </Section>

        <Section
          id="movimiento"
          title="Movimiento"
          lead={
            <>
              Se mueve lo que cambió y nada más; la única animación ambiental es el punto de “En
              vivo”. Sin librería: View Transitions para los desplazamientos y CSS para el resto.
              {reduced ? (
                <strong className="mt-1 block text-foreground">
                  Tu sistema pide reducir el movimiento: las demos cambian sin animar.
                </strong>
              ) : null}
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <DemoBox title="Cambio de estado" note="La tarjeta viaja a su columna (420 ms).">
              <MoveDemo />
            </DemoBox>
            <DemoBox title="Llegada" note="Entra desde arriba y deja un rastro que se apaga.">
              <ArrivalDemo />
            </DemoBox>
            <DemoBox
              title="Esqueleto a contenido"
              note="Fundido de 180 ms, sin saltos ni cascadas."
            >
              <SkeletonDemo />
            </DemoBox>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  tone: 'success',
                  title: 'DEMO-001 asignado a Ramón G.',
                  description: 'Esperando que acepte.',
                  action: {
                    label: 'Deshacer',
                    onClick: () => toast({ title: 'Asignación deshecha' }),
                  },
                })
              }
            >
              Mostrar aviso
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  tone: 'danger',
                  title: 'No se pudo asignar DEMO-001',
                  description: 'El repartidor quedó fuera de turno. Elegí otro.',
                })
              }
            >
              Mostrar error
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Abrir cajón
                </Button>
              </DialogTrigger>
              <SheetContent side="right">
                <DialogHeader>
                  <DialogTitle>Cajón lateral</DialogTitle>
                  <DialogDescription>
                    Entra desde su borde en 320 ms y sale en 220 ms. Atrapa el foco; Escape cierra.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <OrderRail status="RETIRADO" size="md" />
                </DialogBody>
              </SheetContent>
            </Dialog>
          </div>
          <Sub title="Tokens">
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Tokens de movimiento</caption>
                <thead className="bg-subtle text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="h-9 px-3 font-semibold">
                      Token
                    </th>
                    <th scope="col" className="px-3 font-semibold">
                      Valor
                    </th>
                    <th scope="col" className="px-3 font-semibold">
                      Uso
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MOTION_TOKENS.map(([t, v, u]) => (
                    <tr key={t} className="border-t">
                      <td className="px-3 py-2">
                        <code className="text-xs">{t}</code>
                      </td>
                      <td className="px-3 py-2 font-numeric">{v}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sub>
        </Section>

        <Section id="componentes" title="Componentes">
          <Sub title="Botones">
            <div className="flex flex-wrap items-center gap-2">
              <Button>
                <Plus aria-hidden />
                Nuevo pedido
              </Button>
              <Button variant="secondary">Secundario</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="destructive">Cancelar pedido</Button>
              <Button disabled>Deshabilitado</Button>
              <Button variant="link">Enlace</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="xs">xs 28</Button>
              <Button size="sm">sm 32</Button>
              <Button>default 36</Button>
              <Button size="lg">lg 44</Button>
              <Button size="xl">xl 56</Button>
              <Hint label="Eliminar">
                <Button size="icon" variant="outline" aria-label="Eliminar">
                  <Trash2 aria-hidden />
                </Button>
              </Hint>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              En pantallas táctiles (pointer: coarse) xs, sm, default e ícono crecen a 44 px.
            </p>
          </Sub>
          <Sub title="Selección y etiquetas">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Vista de ejemplo"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'tablero', label: 'Tablero', count: 18 },
                  { value: 'lista', label: 'Lista' },
                ]}
              />
              <Badge>Por defecto</Badge>
              <Badge variant="secondary">Secundario</Badge>
              <Badge variant="outline">Contorno</Badge>
              <Badge variant="brand">Nuevo</Badge>
              <span className="text-sm">
                Atajo <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
              </span>
              <span className="flex items-center gap-1.5 text-sm">
                <Avatar name="Ramón Giménez" /> Ramón G.
              </span>
            </div>
          </Sub>
          <Sub title="Capas">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Menú <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Pedido DEMO-001</DropdownMenuLabel>
                  <DropdownMenuItem>Ver detalle</DropdownMenuItem>
                  <DropdownMenuItem>Copiar link de seguimiento</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>Cancelar (no disponible)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <PopoverRoot>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserPlus aria-hidden />
                    Popover
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 text-sm">
                  Los popovers anclan decisiones cortas al lugar donde se tomaron (p. ej. elegir
                  repartidor).
                </PopoverContent>
              </PopoverRoot>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Diálogo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancelar DEMO-001</DialogTitle>
                    <DialogDescription>
                      Los diálogos son para confirmar algo que no se deshace o pedir un dato
                      obligatorio. En el celular suben desde abajo.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost">Volver</Button>
                    <Button variant="destructive">Cancelar pedido</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Sub>
        </Section>

        <Section
          id="tabla"
          title="Tabla"
          lead="Orden, búsqueda, filtro por estado, selección, paginación y encabezado fijo. La altura de fila sigue la densidad elegida en el menú de usuario."
        >
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Estado de la tabla de demostración"
          >
            {(['ok', 'loading', 'error', 'empty'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={tableMode === m ? 'default' : 'outline'}
                aria-pressed={tableMode === m}
                onClick={() => setTableMode(m)}
              >
                {{ ok: 'Con datos', loading: 'Cargando', error: 'Error', empty: 'Vacía' }[m]}
              </Button>
            ))}
          </div>
          <DataTable
            label="Pedidos de ejemplo"
            columns={columns}
            data={tableMode === 'empty' ? [] : DEMO_ROWS}
            getRowId={(r) => r.id}
            selectable
            onSelectionChange={(rows) => setSelected(rows.length)}
            loading={tableMode === 'loading'}
            error={tableMode === 'error'}
            onRetry={() => setTableMode('ok')}
            searchPlaceholder="Buscar pedido o comercio"
            emptyState={
              <EmptyState
                title="Todavía no hay pedidos"
                description="Cuando entre el primero, aparece acá."
                action={<Button>Crear pedido</Button>}
              />
            }
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Filas seleccionadas (callback): {selected}
          </p>
        </Section>

        <Section
          id="formularios"
          title="Formularios"
          lead="react-hook-form + Zod. Un FormField por control; el error se anuncia y queda enlazado al campo. Enviá vacío para ver los errores."
        >
          <div className="rounded-lg border bg-card p-4">
            <SampleForm />
          </div>
        </Section>

        <Section id="vacios" title="Vacío, error y carga">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-card">
              <EmptyState
                title="Sin incidencias abiertas"
                description="Cuando un repartidor reporte una, aparece acá."
                action={<Button variant="outline">Ver resueltas</Button>}
              />
            </div>
            <div className="rounded-lg border bg-card">
              <ErrorState onRetry={() => undefined} />
            </div>
            <div className="rounded-lg border bg-card">
              <LoadingState label="Cargando pedidos…" />
            </div>
          </div>
        </Section>

        <Section
          id="conexion"
          title="Conexión en tiempo real"
          lead="Interruptor de demostración. Más adelante lo maneja el cliente SSE. Conectado no ocupa lugar; cortado, baja un banner y el indicador cambia."
        >
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Estado de conexión de demostración"
          >
            {(['connected', 'reconnecting', 'disconnected'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={conn === s ? 'default' : 'outline'}
                aria-pressed={conn === s}
                onClick={() => setConnection(s)}
              >
                {
                  {
                    connected: 'Conectado',
                    reconnecting: 'Reconectando',
                    disconnected: 'Desconectado',
                  }[s]
                }
              </Button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-12 items-center justify-end border-b px-3">
              <LiveIndicator source={demoConnection} />
            </div>
            <ConnectionStatus source={demoConnection} lastUpdate="14:32" />
            <p className="p-3 text-sm text-muted-foreground">
              {conn === 'connected'
                ? 'Conectado: el banner no ocupa espacio.'
                : 'Banner visible arriba.'}
            </p>
          </div>
        </Section>

        <Section
          id="forma"
          title="Espacio, radios y elevación"
          lead="Escala de 4 px. Los radios crecen con la jerarquía; la sombra es solo para lo que flota sobre la página."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Sub title="Radios">
              <ul className="flex flex-wrap items-end gap-3">
                {[
                  ['rounded-xs', '3', 'etiquetas'],
                  ['rounded-sm', '5', 'campos'],
                  ['rounded-md', '7', 'botones, tarjetas'],
                  ['rounded-lg', '10', 'paneles'],
                  ['rounded-xl', '14', 'capas'],
                ].map(([cls, px, use]) => (
                  <li key={cls} className="flex flex-col items-center gap-1 text-xs">
                    <span
                      aria-hidden="true"
                      className={cn('size-12 border-2 border-foreground/60 bg-card', cls)}
                    />
                    <span className="font-numeric">{px} px</span>
                    <span className="text-muted-foreground">{use}</span>
                  </li>
                ))}
              </ul>
            </Sub>
            <Sub title="Densidad">
              <p className="text-sm">
                Cómoda: filas de 40 px, tarjetas con 12 px de aire. Compacta: 32 px y 8 px. Se elige
                en el menú de usuario y se guarda en el equipo.
              </p>
            </Sub>
            <Sub title="Elevación">
              <div className="flex gap-3">
                <span className="grid h-16 flex-1 place-items-center rounded-md border bg-card text-xs">
                  plano
                </span>
                <span className="grid h-16 flex-1 place-items-center rounded-md border bg-card text-xs shadow-raised">
                  botón
                </span>
                <span className="grid h-16 flex-1 place-items-center rounded-lg border bg-raised text-xs shadow-overlay">
                  capa
                </span>
              </div>
            </Sub>
          </div>
        </Section>
      </div>
    </div>
  );
}
