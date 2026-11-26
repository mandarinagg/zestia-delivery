import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invitation, Member, MembershipStatus } from '@zestia/contracts';
import {
  MailPlus,
  MoreHorizontal,
  Search,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { TONE_CLASS } from '@/components/ui/tone';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/order-states';
import { ROLE_LABEL, useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { ChangeRoleDialog, InviteDialog, describeMemberError } from './member-dialogs';
import { invalidateMembers, invitationListQuery, memberListQuery, membersApi } from './members-api';

type Filter = 'todos' | MembershipStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'DISABLED', label: 'Deshabilitados' },
];

function StatusTag({ tone, children }: { tone: Tone; children: string }) {
  const t = TONE_CLASS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4',
        t.bg,
        t.fg,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', t.solid)} />
      {children}
    </span>
  );
}

function MemberStatus({ member }: { member: Member }) {
  if (member.status === 'DISABLED') return <StatusTag tone="slate">Deshabilitado</StatusTag>;
  if (member.accountStatus === 'DISABLED')
    return <StatusTag tone="amber">Cuenta deshabilitada</StatusTag>;
  return <StatusTag tone="green">Activo</StatusTag>;
}

type PendingAction =
  { kind: 'disable' | 'enable'; member: Member } | { kind: 'revoke'; invitation: Invitation };

/** Invitaciones abiertas: pendientes y vencidas, con reenviar y revocar. */
function InvitationsSection({
  invitations,
  canManage,
  canManageOwners,
  onRevoke,
}: {
  invitations: Invitation[];
  canManage: boolean;
  canManageOwners: boolean;
  onRevoke: (invitation: Invitation) => void;
}) {
  const queryClient = useQueryClient();
  const [resending, setResending] = useState<string | null>(null);
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="invitaciones" className="mb-8">
      <h2 id="invitaciones" className="mb-3 font-display text-xl font-semibold">
        Invitaciones abiertas{' '}
        <span className="font-numeric text-muted-foreground">{invitations.length}</span>
      </h2>
      <ul className="divide-y rounded-lg border bg-card">
        {invitations.map((inv) => {
          const expired = inv.status === 'EXPIRED';
          const actionable = canManage && (inv.role !== 'OWNER' || canManageOwners);
          return (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{inv.email}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{ROLE_LABEL[inv.role]}</span>
                  <span aria-hidden="true">·</span>
                  {expired ? (
                    <StatusTag tone="amber">Vencida</StatusTag>
                  ) : (
                    <span>Vence el {formatDate(inv.expiresAt)}</span>
                  )}
                  {inv.invitedBy ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Invitó {inv.invitedBy.name}</span>
                    </>
                  ) : null}
                </p>
              </div>
              {actionable ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resending === inv.id}
                    aria-busy={resending === inv.id || undefined}
                    aria-label={`Reenviar la invitación a ${inv.email}`}
                    onClick={async () => {
                      setResending(inv.id);
                      try {
                        await membersApi.resend(inv.id);
                        toast({
                          tone: 'success',
                          title: 'Invitación reenviada',
                          description: 'El enlace anterior dejó de servir.',
                        });
                      } catch (error) {
                        toast({
                          tone: 'danger',
                          title: 'No se pudo reenviar',
                          description: describeMemberError(error),
                        });
                      } finally {
                        setResending(null);
                        await invalidateMembers(queryClient);
                      }
                    }}
                  >
                    <MailPlus aria-hidden="true" />
                    {resending === inv.id ? 'Enviando…' : 'Reenviar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Revocar la invitación a ${inv.email}`}
                    onClick={() => onRevoke(inv)}
                  >
                    Revocar
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Usuarios de la empresa (#18): miembros, invitaciones abiertas y acciones según el rol. */
export function MembersPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const canManage = useCan('users:manage');
  const canManageOwners = useCan('users:manage-owners');
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<Member | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const members = useInfiniteQuery(
    memberListQuery({ status: filter === 'todos' ? undefined : filter, q: q || undefined }),
  );
  const invitations = useQuery(invitationListQuery);
  const rows = members.data?.pages.flatMap((p) => p.data) ?? [];
  const selfId = session?.user.id;

  /** ¿Quien mira puede tocar a este miembro? (La API lo vuelve a validar.) */
  const editable = (m: Member) =>
    canManage && m.userId !== selfId && (m.role !== 'OWNER' || canManageOwners);

  async function confirmPending() {
    if (!pending) return;
    try {
      if (pending.kind === 'revoke') {
        await membersApi.revoke(pending.invitation.id);
        toast({ tone: 'success', title: 'Invitación revocada' });
      } else if (pending.kind === 'disable') {
        await membersApi.disable(pending.member.id);
        toast({ tone: 'success', title: `Deshabilitaste a ${pending.member.name}` });
      } else {
        await membersApi.enable(pending.member.id);
        toast({ tone: 'success', title: `Habilitaste a ${pending.member.name}` });
      }
    } catch (error) {
      toast({
        tone: 'danger',
        title: 'No se pudo completar',
        description: describeMemberError(error),
      });
      throw error;
    } finally {
      await invalidateMembers(queryClient);
    }
  }

  const confirmCopy =
    pending?.kind === 'revoke'
      ? {
          title: 'Revocar invitación',
          description: `El enlace que le llegó a ${pending.invitation.email} deja de servir.`,
          confirm: 'Revocar',
        }
      : pending?.kind === 'disable'
        ? {
            title: `Deshabilitar a ${pending.member.name}`,
            description:
              'Deja de poder entrar a esta empresa desde su próxima acción. Su cuenta y sus otras empresas no cambian. Lo podés volver a habilitar.',
            confirm: 'Deshabilitar',
          }
        : pending?.kind === 'enable'
          ? {
              title: `Habilitar a ${pending.member.name}`,
              description: 'Vuelve a entrar a esta empresa con el mismo rol que tenía.',
              confirm: 'Habilitar',
            }
          : null;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quiénes usan el panel de tu empresa y con qué rol."
        actions={
          canManage ? (
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden="true" />
              Invitar
            </Button>
          ) : null
        }
      />

      {invitations.data ? (
        <InvitationsSection
          invitations={invitations.data.data}
          canManage={canManage}
          canManageOwners={canManageOwners}
          onRevoke={(invitation) => setPending({ kind: 'revoke', invitation })}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Estado" options={FILTERS} value={filter} onChange={setFilter} />
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Buscar por nombre o correo</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Buscar por nombre o correo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </label>
      </div>

      {members.isPending ? (
        <TableSkeleton rows={4} columns={4} />
      ) : members.isError ? (
        <ErrorState
          description="No pudimos traer los usuarios."
          onRetry={() => void members.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<Users className="size-5" />}
            title="No hay usuarios que coincidan"
            description="Probá con otra parte del nombre o del correo, o cambiá el filtro."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Usuarios</caption>
            <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Nombre
                </th>
                <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">
                  Correo
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Rol
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Estado
                </th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-subtle">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{m.name}</span>
                    {m.userId === selfId ? (
                      <Badge variant="brand" className="ml-2">
                        Vos
                      </Badge>
                    ) : null}
                    <span className="block text-xs text-muted-foreground sm:hidden">{m.email}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">{m.email}</td>
                  <td className="px-3 py-2.5">{ROLE_LABEL[m.role]}</td>
                  <td className="px-3 py-2.5">
                    <MemberStatus member={m} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {editable(m) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Acciones de ${m.name}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.status === 'ACTIVE' ? (
                            <>
                              <DropdownMenuItem onSelect={() => setChangingRole(m)}>
                                <UserCog aria-hidden="true" />
                                Cambiar rol
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPending({ kind: 'disable', member: m })}
                              >
                                <UserMinus aria-hidden="true" />
                                Deshabilitar
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => setPending({ kind: 'enable', member: m })}
                            >
                              <UserPlus aria-hidden="true" />
                              Habilitar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.hasNextPage ? (
            <div className="border-t p-2 text-center">
              <Button
                variant="ghost"
                onClick={() => void members.fetchNextPage()}
                disabled={members.isFetchingNextPage}
                aria-busy={members.isFetchingNextPage || undefined}
              >
                {members.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {canManage ? (
        <InviteDialog
          open={inviting}
          onOpenChange={setInviting}
          canManageOwners={canManageOwners}
        />
      ) : null}
      {changingRole ? (
        <ChangeRoleDialog
          member={changingRole}
          canManageOwners={canManageOwners}
          onOpenChange={(open) => (open ? undefined : setChangingRole(null))}
        />
      ) : null}
      {pending && confirmCopy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setPending(null))}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirm}
          destructive={pending.kind !== 'enable'}
          onConfirm={confirmPending}
        />
      ) : null}
    </>
  );
}
