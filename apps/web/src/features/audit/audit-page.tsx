import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AuditLogEntry } from '@zestia/contracts';
import { ChevronDown, History, X } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { formatDate, formatTime, nextDay, zonedDayStartToUtc } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type AuditListFilters, auditListQuery } from './audit-api';
import {
  AUDIT_AREA_LABEL,
  type AuditArea,
  describeAction,
  describeActor,
  describeEntity,
  describeField,
  describeMetadata,
  entityLink,
  formatAuditValue,
} from './audit-format';

type Area = 'todo' | AuditArea;

const AREAS: { value: Area; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  ...(Object.keys(AUDIT_AREA_LABEL) as AuditArea[]).map((value) => ({
    value,
    label: AUDIT_AREA_LABEL[value],
  })),
];

/** Agrupa por día en la zona del tenant, manteniendo el orden (más recientes primero). */
function byDay(entries: AuditLogEntry[]): { day: string; entries: AuditLogEntry[] }[] {
  const groups: { day: string; entries: AuditLogEntry[] }[] = [];
  for (const entry of entries) {
    const day = formatDate(entry.occurredAt);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

/** Cambios, datos extra y referencia de un evento. `null` si no hay nada que mostrar. */
function EntryDetail({ entry, id }: { entry: AuditLogEntry; id: string }) {
  const changes = Object.entries(entry.changes ?? {});
  const metadata = describeMetadata(entry.metadata);
  const entityType = entry.entity?.type ?? null;

  return (
    <div id={id} className="space-y-3 border-t bg-subtle px-4 py-3 text-sm sm:pl-20">
      {changes.length > 0 ? (
        <table className="w-full max-w-2xl text-left">
          <caption className="sr-only">Cambios</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-3 font-semibold">
                Campo
              </th>
              <th scope="col" className="py-1 pr-3 font-semibold">
                Antes
              </th>
              <th scope="col" className="py-1 font-semibold">
                Después
              </th>
            </tr>
          </thead>
          <tbody>
            {changes.map(([field, change]) => (
              <tr key={field} className="align-top">
                <th scope="row" className="py-1 pr-3 font-semibold">
                  {describeField(field)}
                </th>
                {'redacted' in change ? (
                  <td colSpan={2} className="py-1 text-muted-foreground">
                    Dato protegido: cambió, pero el valor no se guarda.
                  </td>
                ) : (
                  <>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {formatAuditValue(field, change.from, entityType)}
                    </td>
                    <td className="py-1">{formatAuditValue(field, change.to, entityType)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {metadata.length > 0 || entry.entity ? (
        <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {entry.entity ? (
            <>
              <dt className="font-semibold">Sobre</dt>
              <dd>{describeEntity(entry.entity.type)}</dd>
            </>
          ) : null}
          {metadata.map((m) => (
            <div key={m.label} className="contents">
              <dt className="font-semibold">{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {entry.correlationId ? (
        <p className="text-xs text-muted-foreground">
          Referencia para soporte: <span className="font-mono">{entry.correlationId}</span>
        </p>
      ) : null}
    </div>
  );
}

function Entry({
  entry,
  open,
  onToggle,
  onFilterActor,
}: {
  entry: AuditLogEntry;
  open: boolean;
  onToggle: () => void;
  onFilterActor: (actor: { id: string; name: string }) => void;
}) {
  const actor = describeActor(entry.actor);
  const link = entityLink(entry);
  const detailId = `auditoria-${entry.id}`;

  return (
    <li>
      <div className="flex items-start gap-3 px-4 py-3">
        <time
          dateTime={entry.occurredAt}
          className="w-12 shrink-0 pt-0.5 font-numeric text-sm text-muted-foreground"
        >
          {formatTime(entry.occurredAt)}
        </time>
        <div className="min-w-0 flex-1">
          <p>
            {actor.known && entry.actor.id ? (
              <button
                type="button"
                className="rounded-xs font-semibold underline decoration-input underline-offset-4 hover:decoration-foreground"
                aria-label={`${actor.label}: ver solo sus acciones`}
                onClick={() => onFilterActor({ id: entry.actor.id!, name: actor.label })}
              >
                {actor.label}
              </button>
            ) : (
              <span className="font-semibold">{actor.label}</span>
            )}{' '}
            {describeAction(entry.action)}
          </p>
          {link ? (
            <Link
              to="/panel/comercios/$merchantId"
              params={{ merchantId: link.merchantId }}
              className="mt-0.5 inline-block rounded-xs text-xs font-semibold text-muted-foreground underline decoration-input underline-offset-4 hover:text-foreground"
            >
              {link.label}
            </Link>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="xs"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={onToggle}
        >
          Detalle
          <ChevronDown
            aria-hidden="true"
            className={cn('transition-transform duration-(--dur-fast)', open && 'rotate-180')}
          />
        </Button>
      </div>
      {open ? <EntryDetail entry={entry} id={detailId} /> : null}
    </li>
  );
}

/** Auditoría de la empresa (#17): quién hizo qué y cuándo, con los cambios campo por campo. */
export function AuditPage() {
  const [area, setArea] = useState<Area>('todo');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const rangeInvalid = fromDay !== '' && toDay !== '' && toDay < fromDay;
  // "Hasta" incluye el día elegido: la API toma `to` como exclusivo → inicio del día siguiente.
  const filters: AuditListFilters = {
    action: area === 'todo' ? undefined : area,
    actorId: actor?.id,
    from: fromDay ? zonedDayStartToUtc(fromDay) : undefined,
    to: toDay ? zonedDayStartToUtc(nextDay(toDay)) : undefined,
  };
  const filtered = area !== 'todo' || actor !== null || fromDay !== '' || toDay !== '';
  const audit = useInfiniteQuery({ ...auditListQuery(filters), enabled: !rangeInvalid });
  const entries = audit.data?.pages.flatMap((p) => p.data) ?? [];

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo en tu empresa. Los datos personales no se guardan: solo queda registrado que cambiaron."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented label="Área" options={AREAS} value={area} onChange={setArea} />
        <FormField label="Desde" className="w-40">
          <Input
            type="date"
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => setFromDay(e.target.value)}
          />
        </FormField>
        <FormField
          label="Hasta"
          className="w-40"
          error={rangeInvalid ? 'Tiene que ser igual o posterior a "Desde".' : undefined}
        >
          <Input
            type="date"
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => setToDay(e.target.value)}
          />
        </FormField>
        {fromDay || toDay ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFromDay('');
              setToDay('');
            }}
          >
            Quitar fechas
          </Button>
        ) : null}
      </div>

      {actor ? (
        <p className="mb-4 inline-flex items-center gap-1 rounded-sm bg-brand-soft py-0.5 pl-2.5 pr-0.5 text-sm font-semibold">
          Solo acciones de {actor.name}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar el filtro: ver las acciones de todas las personas`}
            onClick={() => setActor(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </p>
      ) : null}

      {rangeInvalid ? null : audit.isPending ? (
        <TableSkeleton rows={5} columns={3} />
      ) : audit.isError ? (
        <ErrorState
          description="No pudimos traer la auditoría."
          onRetry={() => void audit.refetch()}
        />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<History className="size-5" />}
            title={filtered ? 'No hay actividad con estos filtros' : 'Todavía no hay actividad'}
            description={
              filtered
                ? 'Probá con otras fechas u otra área.'
                : 'Acá van a aparecer los cambios en comercios y usuarios de la empresa.'
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {byDay(entries).map((group) => (
            <section key={group.day} aria-label={`Actividad del ${group.day}`}>
              <h2 className="mb-2 font-numeric text-sm font-semibold text-muted-foreground">
                {group.day}
              </h2>
              <ol className="divide-y rounded-lg border bg-card">
                {group.entries.map((entry) => (
                  <Entry
                    key={entry.id}
                    entry={entry}
                    open={expanded.has(entry.id)}
                    onToggle={() => toggle(entry.id)}
                    onFilterActor={setActor}
                  />
                ))}
              </ol>
            </section>
          ))}
          {audit.hasNextPage ? (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => void audit.fetchNextPage()}
                disabled={audit.isFetchingNextPage}
                aria-busy={audit.isFetchingNextPage || undefined}
              >
                {audit.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
