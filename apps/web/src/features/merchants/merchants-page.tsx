import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { MerchantStatus } from '@zestia/contracts';
import { Building2, Plus, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useCan } from '@/lib/session';
import { MerchantFormDialog } from './merchant-form-dialog';
import { MerchantStatusBadge, formatPhone } from './merchant-format';
import { merchantListQuery } from './merchants-api';

type Filter = 'vigentes' | MerchantStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'vigentes', label: 'Vigentes' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'SUSPENDED', label: 'Suspendidos' },
  { value: 'ARCHIVED', label: 'Archivados' },
];

/** Listado de comercios (#19): por nombre, búsqueda en el servidor y "Cargar más" por cursor. */
export function MerchantsPage() {
  const canManage = useCan('merchants:manage');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('vigentes');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);

  const query = useInfiniteQuery(
    merchantListQuery({ status: filter === 'vigentes' ? undefined : filter, q: q || undefined }),
  );
  const merchants = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="Comercios"
        description="Los comercios que te encargan entregas y sus sucursales de retiro."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Nuevo comercio
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Estado" options={FILTERS} value={filter} onChange={setFilter} />
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Buscar por nombre o RUC</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Buscar por nombre o RUC"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </label>
      </div>

      {query.isPending ? (
        <TableSkeleton rows={5} columns={4} />
      ) : query.isError ? (
        <ErrorState
          description="No pudimos traer los comercios."
          onRetry={() => void query.refetch()}
        />
      ) : merchants.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={q ? 'No hay comercios que coincidan' : 'Todavía no hay comercios'}
            description={
              q
                ? 'Probá con otra parte del nombre o con el RUC.'
                : canManage
                  ? 'Creá el primero para empezar a cargar sus pedidos.'
                  : 'Cuando alguien de administración los cargue, aparecen acá.'
            }
            action={
              !q && canManage ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" />
                  Nuevo comercio
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Comercios</caption>
            <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Nombre
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Estado
                </th>
                <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">
                  RUC
                </th>
                <th scope="col" className="hidden px-3 py-2 font-semibold md:table-cell">
                  Teléfono
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Sucursales
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {merchants.map((m) => (
                <tr key={m.id} className="hover:bg-subtle">
                  <td className="px-3 py-2.5">
                    <Link
                      to="/panel/comercios/$merchantId"
                      params={{ merchantId: m.id }}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <MerchantStatusBadge status={m.status} />
                  </td>
                  <td className="hidden px-3 py-2.5 font-numeric sm:table-cell">{m.ruc ?? '—'}</td>
                  <td className="hidden px-3 py-2.5 font-numeric md:table-cell">
                    {formatPhone(m.phone) || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-numeric">{m.branchCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.hasNextPage ? (
            <div className="border-t p-2 text-center">
              <Button
                variant="ghost"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                aria-busy={query.isFetchingNextPage || undefined}
              >
                {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {canManage ? (
        <MerchantFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(m) =>
            void navigate({ to: '/panel/comercios/$merchantId', params: { merchantId: m.id } })
          }
        />
      ) : null}
    </>
  );
}
