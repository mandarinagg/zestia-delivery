import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { SampleForm } from '@/components/forms/sample-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectionStatus } from '@/components/ui/connection-status';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/states';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { createConnectionSource, type ConnectionState } from '@/hooks/use-connection-status';
import { formatDateTime, formatPYG } from '@/lib/format';

/* Todo lo de esta página es DATO DE EJEMPLO obvio. No es información real. */

type DemoStatus = 'nuevo' | 'asignado' | 'en_camino' | 'entregado' | 'incidencia';
const STATUS: Record<DemoStatus, { label: string; tone: StatusTone }> = {
  nuevo: { label: 'Nuevo', tone: 'neutral' },
  asignado: { label: 'Asignado', tone: 'info' },
  en_camino: { label: 'En camino', tone: 'warning' },
  entregado: { label: 'Entregado', tone: 'success' },
  incidencia: { label: 'Incidencia', tone: 'danger' },
};

interface DemoRow {
  id: string;
  comercio: string;
  estado: DemoStatus;
  monto: number;
  creado: string;
}

const STATUS_KEYS = Object.keys(STATUS) as DemoStatus[];
const DEMO_ROWS: DemoRow[] = Array.from({ length: 37 }, (_, i) => ({
  id: `DEMO-${String(i + 1).padStart(3, '0')}`,
  comercio: `Comercio de ejemplo ${(i % 5) + 1}`,
  estado: STATUS_KEYS[i % STATUS_KEYS.length]!,
  monto: 10000 + ((i * 7919) % 90) * 1000,
  creado: new Date(Date.UTC(2026, 0, 15, 12, 0) + i * 17 * 60_000).toISOString(),
}));

const columns: ColumnDef<DemoRow>[] = [
  {
    accessorKey: 'id',
    header: 'Pedido',
    cell: (c) => <span className="font-mono text-xs">{c.getValue<string>()}</span>,
  },
  { accessorKey: 'comercio', header: 'Comercio' },
  {
    accessorKey: 'estado',
    header: 'Estado',
    meta: {
      filterLabel: 'Filtrar por estado',
      filterOptions: STATUS_KEYS.map((k) => ({ value: k, label: STATUS[k].label })),
    },
    cell: (c) => {
      const s = STATUS[c.getValue<DemoStatus>()];
      return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
    },
  },
  {
    accessorKey: 'monto',
    header: 'Monto',
    meta: { numeric: true },
    cell: (c) => formatPYG(c.getValue<number>()),
  },
  {
    accessorKey: 'creado',
    header: 'Creado',
    cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue<string>())}</span>,
  },
];

const demoConnection = createConnectionSource('connected');

function Section({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

const TONES: StatusTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
const TONE_LABEL: Record<StatusTone, string> = {
  neutral: 'Neutral',
  info: 'Info',
  success: 'Éxito',
  warning: 'Atención',
  danger: 'Peligro',
};

export function UiShowcasePage() {
  const [conn, setConn] = useState<ConnectionState>('connected');
  const [tableMode, setTableMode] = useState<'ok' | 'loading' | 'error' | 'empty'>('ok');
  const [selected, setSelected] = useState(0);

  function setConnection(next: ConnectionState) {
    demoConnection.set(next);
    setConn(next);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Guía de UI"
        description="Solo para desarrollo y revisión. Todos los datos son de ejemplo."
      />

      <Section title="Estados (StatusPill)" description="Texto + punto + color: nunca solo color.">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <StatusPill key={t} tone={t}>
              {TONE_LABEL[t]}
            </StatusPill>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Por defecto</Badge>
          <Badge variant="secondary">Secundario</Badge>
          <Badge variant="outline">Contorno</Badge>
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap gap-2">
          <Button>
            <Plus aria-hidden className="size-4" />
            Nuevo pedido
          </Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="destructive">Cancelar pedido</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </Section>

      <Section
        title="Tabla densa"
        description="Orden, búsqueda, filtro por estado, selección, paginación y encabezado fijo."
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
              description="Cuando se cree el primero, va a aparecer acá."
              action={<Button>Crear pedido</Button>}
            />
          }
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Filas seleccionadas (callback): {selected}
        </p>
      </Section>

      <Section
        title="Formulario"
        description="react-hook-form + Zod. Enviá vacío para ver los errores."
      >
        <SampleForm />
      </Section>

      <Section title="Vacío, error y carga">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <EmptyState
              title="Sin incidencias"
              description="No hay incidencias abiertas."
              action={<Button variant="outline">Ver historial</Button>}
            />
          </Card>
          <Card>
            <ErrorState onRetry={() => undefined} />
          </Card>
          <Card>
            <LoadingState label="Cargando pedidos…" />
          </Card>
        </div>
        <div className="flex flex-col gap-2" aria-label="Ejemplo de esqueletos">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Section>

      <Section
        title="Conexión en tiempo real"
        description="Interruptor de demostración. Más adelante lo maneja el cliente SSE."
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
        <div className="overflow-hidden rounded-md border">
          <ConnectionStatus source={demoConnection} />
          <p className="p-3 text-sm text-muted-foreground">
            {conn === 'connected'
              ? 'Conectado: el banner no ocupa espacio.'
              : 'Banner visible arriba.'}
          </p>
        </div>
      </Section>
    </div>
  );
}
