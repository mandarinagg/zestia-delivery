import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { Branch, MerchantDetail } from '@zestia/contracts';
import { Archive, MapPin, MoreHorizontal, Pause, Pencil, Play, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { ApiError, describeApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/session';
import { BranchFormDialog } from './branch-form-dialog';
import { MerchantFormDialog } from './merchant-form-dialog';
import { MerchantStatusBadge, describeHours, formatPhone } from './merchant-format';
import {
  type MerchantTransition,
  invalidateMerchants,
  merchantDetailQuery,
  merchantsApi,
} from './merchants-api';

const route = getRouteApi('/panel/comercios/$merchantId');

const TRANSITION_COPY: Record<
  MerchantTransition,
  { title: string; description: string; confirm: string; done: string; destructive?: boolean }
> = {
  suspend: {
    title: 'Suspender comercio',
    description:
      'Mientras esté suspendido no se le van a poder cargar pedidos nuevos. Lo podés reactivar cuando quieras.',
    confirm: 'Suspender',
    done: 'Comercio suspendido',
  },
  reactivate: {
    title: 'Reactivar comercio',
    description: 'Vuelve a quedar disponible para cargarle pedidos.',
    confirm: 'Reactivar',
    done: 'Comercio reactivado',
  },
  archive: {
    title: 'Archivar comercio',
    description:
      'Deja de aparecer en los listados y ya no se puede modificar. Su historial se conserva. Esta acción no se puede deshacer.',
    confirm: 'Archivar',
    done: 'Comercio archivado',
    destructive: true,
  },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function BranchCard({
  branch,
  canEdit,
  onEdit,
  onArchive,
}: {
  branch: Branch;
  canEdit: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{branch.name}</h3>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {branch.address} · {branch.neighborhood}, {branch.city}
            </span>
          </p>
          {branch.references ? (
            <p className="mt-1 text-sm text-muted-foreground">{branch.references}</p>
          ) : null}
          {branch.phone ? (
            <p className="mt-1 font-numeric text-sm">{formatPhone(branch.phone)}</p>
          ) : null}
        </div>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${branch.name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onArchive}>
                <Archive aria-hidden="true" />
                Archivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Horario de retiro</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {describeHours(branch.openingHours).map(({ day, text }) => (
            <div key={day} className="contents">
              <dt className="text-muted-foreground">
                {
                  {
                    mon: 'Lun',
                    tue: 'Mar',
                    wed: 'Mié',
                    thu: 'Jue',
                    fri: 'Vie',
                    sat: 'Sáb',
                    sun: 'Dom',
                  }[day]
                }
              </dt>
              <dd className="font-numeric">{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </li>
  );
}

function MerchantView({ merchant }: { merchant: MerchantDetail }) {
  const queryClient = useQueryClient();
  const canManage = useCan('merchants:manage');
  const editable = canManage && merchant.status !== 'ARCHIVED';
  const [editing, setEditing] = useState(false);
  const [transition, setTransition] = useState<MerchantTransition | null>(null);
  const [branchForm, setBranchForm] = useState<{ branch?: Branch } | null>(null);
  const [archivingBranch, setArchivingBranch] = useState<Branch | null>(null);

  /** Ejecuta un cambio; ante error avisa y relanza para que el diálogo quede abierto. */
  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast({ tone: 'success', title: done });
    } catch (error) {
      const archived = error instanceof ApiError && error.code === 'MERCHANT_ARCHIVED';
      const invalid = error instanceof ApiError && error.code === 'INVALID_STATUS_TRANSITION';
      toast({
        tone: 'danger',
        title: 'No se pudo completar',
        description:
          archived || invalid
            ? 'El estado del comercio cambió mientras tanto. Ya lo actualizamos.'
            : describeApiError(error),
      });
      throw error;
    } finally {
      await invalidateMerchants(queryClient);
    }
  }

  const copy = transition ? TRANSITION_COPY[transition] : null;

  return (
    <>
      <PageHeader
        back={{ to: '/panel/comercios', label: 'Comercios' }}
        title={merchant.name}
        meta={
          <>
            <MerchantStatusBadge status={merchant.status} />
            <span className="text-xs text-muted-foreground">
              Alta {formatDate(merchant.createdAt)}
            </span>
          </>
        }
        actions={
          editable ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                Editar
              </Button>
              {merchant.status === 'ACTIVE' ? (
                <Button variant="outline" onClick={() => setTransition('suspend')}>
                  <Pause aria-hidden="true" />
                  Suspender
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setTransition('reactivate')}>
                  <Play aria-hidden="true" />
                  Reactivar
                </Button>
              )}
              <Button variant="ghost" onClick={() => setTransition('archive')}>
                <Archive aria-hidden="true" />
                Archivar
              </Button>
            </>
          ) : null
        }
      />

      {merchant.status === 'ARCHIVED' ? (
        <p role="note" className="mb-5 rounded-md border bg-subtle px-3 py-2 text-sm">
          Este comercio está archivado: se muestra solo para consulta.
        </p>
      ) : null}

      <dl className="mb-8 grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Field label="RUC">
          <span className="font-numeric">{merchant.ruc ?? '—'}</span>
        </Field>
        <Field label="Teléfono de contacto">
          <span className="font-numeric">{formatPhone(merchant.phone) || '—'}</span>
        </Field>
        <Field label="Última modificación">{formatDate(merchant.updatedAt)}</Field>
      </dl>

      <section aria-labelledby="sucursales">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="sucursales" className="font-display text-xl font-semibold">
            Sucursales{' '}
            <span className="font-numeric text-muted-foreground">{merchant.branchCount}</span>
          </h2>
          {editable ? (
            <Button variant="outline" size="sm" onClick={() => setBranchForm({})}>
              <Plus aria-hidden="true" />
              Agregar sucursal
            </Button>
          ) : null}
        </div>
        {merchant.branches.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={<Store className="size-5" />}
              title="Sin sucursales"
              description="Cargá al menos una para saber dónde retirar sus pedidos."
              action={
                editable ? (
                  <Button onClick={() => setBranchForm({})}>
                    <Plus aria-hidden="true" />
                    Agregar sucursal
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {merchant.branches.map((b) => (
              <BranchCard
                key={b.id}
                branch={b}
                canEdit={editable}
                onEdit={() => setBranchForm({ branch: b })}
                onArchive={() => setArchivingBranch(b)}
              />
            ))}
          </ul>
        )}
      </section>

      {editable ? (
        <>
          <MerchantFormDialog open={editing} onOpenChange={setEditing} merchant={merchant} />
          <BranchFormDialog
            open={branchForm !== null}
            onOpenChange={(open) => (open ? undefined : setBranchForm(null))}
            merchantId={merchant.id}
            branch={branchForm?.branch}
          />
        </>
      ) : null}
      {copy && transition ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setTransition(null))}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          destructive={copy.destructive}
          onConfirm={() => run(() => merchantsApi.transition(merchant.id, transition), copy.done)}
        />
      ) : null}
      {archivingBranch ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setArchivingBranch(null))}
          title={`Archivar ${archivingBranch.name}`}
          description="La sucursal deja de aparecer para cargar pedidos. Su historial se conserva."
          confirmLabel="Archivar"
          destructive
          onConfirm={() =>
            run(
              () => merchantsApi.archiveBranch(merchant.id, archivingBranch.id),
              'Sucursal archivada',
            )
          }
        />
      ) : null}
    </>
  );
}

/** Detalle de un comercio (#19): datos, estado y sucursales. Archivados: solo lectura. */
export function MerchantDetailPage() {
  const { merchantId } = route.useParams();
  const query = useQuery(merchantDetailQuery(merchantId));

  if (query.isPending) return <LoadingState label="Cargando comercio" />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return notFound ? (
      <EmptyState
        icon={<Store className="size-5" />}
        title="No encontramos este comercio"
        description="Puede que el enlace esté mal o que sea de otra empresa."
      />
    ) : (
      <ErrorState
        description="No pudimos traer el comercio."
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <MerchantView merchant={query.data} />;
}
