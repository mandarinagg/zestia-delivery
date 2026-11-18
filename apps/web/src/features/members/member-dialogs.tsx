import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  type CreateInvitation,
  type CreateInvitationInput,
  type Member,
  createInvitationSchema,
} from '@zestia/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { ApiError, describeApiError } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/session';
import { invalidateMembers, membersApi } from './members-api';

/** Qué hace cada rol, en una línea (ver docs/SPEC.md §3). */
export const ROLE_HELP: Record<AssignableRole, string> = {
  OWNER: 'Control total de la empresa, incluidos los demás propietarios.',
  ADMIN: 'Gestiona comercios, usuarios y la configuración.',
  OPERATOR: 'Recibe, asigna y sigue los pedidos.',
  SUPERVISOR: 'Controla la operación y las incidencias.',
};

/** Roles que la persona que administra puede dar (Propietario solo si es Propietaria). */
export function grantableRoles(canManageOwners: boolean): AssignableRole[] {
  return ASSIGNABLE_ROLES.filter((r) => canManageOwners || r !== 'OWNER');
}

/** Mensaje para un error de gestión de usuarios que no va a un campo. */
export function describeMemberError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'SELF_MODIFICATION':
        return 'No podés cambiar tu propio rol ni deshabilitarte. Pedíselo a otra persona propietaria.';
      case 'LAST_OWNER':
        return 'La empresa necesita al menos una persona propietaria activa.';
      case 'PERMISSION_DENIED':
        return 'Solo una persona propietaria puede dar o quitar ese rol.';
      case 'INVALID_STATUS_TRANSITION':
      case 'INVITATION_CLOSED':
        return 'Esto cambió mientras tanto. Ya actualizamos la lista.';
      case 'MAIL_DELIVERY_FAILED':
        return 'No pudimos mandar el correo, así que no se guardó nada. Probá de nuevo en un momento.';
    }
  }
  return describeApiError(error);
}

function RoleSelect({
  roles,
  ...props
}: { roles: AssignableRole[] } & React.ComponentProps<typeof Select>) {
  return (
    <Select {...props}>
      {roles.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
  canManageOwners,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageOwners: boolean;
}) {
  const queryClient = useQueryClient();
  const roles = grantableRoles(canManageOwners);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvitationInput, unknown, CreateInvitation>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: { email: '', role: 'OPERATOR' },
  });
  const role = useWatch({ control, name: 'role' }) as AssignableRole;

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          noValidate
          className="flex min-h-0 flex-col"
          onSubmit={handleSubmit(async (values) => {
            try {
              await membersApi.invite(values);
              await invalidateMembers(queryClient);
              toast({
                tone: 'success',
                title: 'Invitación enviada',
                description: `Le llegó un correo a ${values.email}.`,
              });
              close(false);
            } catch (error) {
              const code = error instanceof ApiError ? error.code : null;
              if (code === 'ALREADY_MEMBER') {
                setError('email', { message: 'Ya es parte de la empresa.' }, { shouldFocus: true });
              } else if (code === 'INVITATION_PENDING') {
                setError(
                  'email',
                  { message: 'Ya tiene una invitación vigente. Reenviala desde la lista.' },
                  { shouldFocus: true },
                );
              } else if (code === 'VALIDATION_FAILED' && error instanceof ApiError) {
                for (const issue of error.issues) {
                  if (issue.path === 'email' || issue.path === 'role') {
                    setError(issue.path, { message: issue.message });
                  }
                }
              } else {
                toast({
                  tone: 'danger',
                  title: 'No se pudo invitar',
                  description: describeMemberError(error),
                });
              }
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>Invitar a la empresa</DialogTitle>
            <DialogDescription>
              Le mandamos un enlace por correo. Con él crea su cuenta o, si ya tiene una, suma esta
              empresa.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <FormField label="Correo" required error={errors.email?.message}>
              <Input type="email" inputMode="email" autoComplete="off" {...register('email')} />
            </FormField>
            <FormField label="Rol" required help={ROLE_HELP[role]} error={errors.role?.message}>
              <RoleSelect roles={roles} {...register('role')} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeRoleDialog({
  member,
  onOpenChange,
  canManageOwners,
}: {
  member: Member;
  onOpenChange: (open: boolean) => void;
  canManageOwners: boolean;
}) {
  const queryClient = useQueryClient();
  const roles = grantableRoles(canManageOwners);
  const initial = (roles as string[]).includes(member.role)
    ? (member.role as AssignableRole)
    : roles[roles.length - 1]!;
  const [role, setRole] = useState<AssignableRole>(initial);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await membersApi.changeRole(member.id, role);
              toast({
                tone: 'success',
                title: `${member.name} ahora es ${ROLE_LABEL[role]}`,
              });
              onOpenChange(false);
            } catch (error) {
              toast({
                tone: 'danger',
                title: 'No se pudo cambiar el rol',
                description: describeMemberError(error),
              });
            } finally {
              setBusy(false);
              await invalidateMembers(queryClient);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Cambiar el rol de {member.name}</DialogTitle>
            <DialogDescription>
              El cambio vale desde su próxima acción y queda en la auditoría.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FormField label="Rol" required help={ROLE_HELP[role]}>
              <RoleSelect
                roles={roles}
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy || role === member.role}
              aria-busy={busy || undefined}
            >
              {busy ? 'Guardando…' : 'Cambiar rol'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
