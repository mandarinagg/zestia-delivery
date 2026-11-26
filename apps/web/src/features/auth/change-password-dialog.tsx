/*
 * Cambiar contraseña con la sesión abierta (`POST /auth/change-password`, #14).
 *
 * El servidor verifica la actual, guarda la nueva, cierra las demás sesiones y rota esta: la
 * cookie cambia sola y el `csrfToken` nuevo viene en la respuesta. Sin guardarlo, la próxima
 * acción daría `CSRF_TOKEN_INVALID`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { toast } from '@/components/ui/toast';
import { ApiError, describeApiError } from '@/lib/api';
import { type Session, SESSION_KEY, storeSession } from '@/lib/session';
import { type ChangePasswordValues, MIN_PASSWORD, authApi, changePasswordSchema } from './auth-api';
import { PasswordField, Requirement } from './auth-shell';
import { FormAlert } from './form-alert';

const EMPTY: ChangePasswordValues = { current: '', password: '', confirm: '' };

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);
  // Por `useMutation`: un 401 (sesión vencida) lo maneja el router como en el resto de la app.
  const change = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      authApi.changePassword(values.current, values.password),
  });
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });
  const [current, password, confirm] = useWatch({
    control,
    name: ['current', 'password', 'confirm'],
  });

  function close(next: boolean) {
    if (!next) {
      reset(EMPTY);
      setAlert(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          noValidate
          aria-label="Cambiar contraseña"
          className="flex min-h-0 flex-col"
          onSubmit={handleSubmit(async (values) => {
            setAlert(null);
            try {
              const csrfToken = await change.mutateAsync(values);
              const session = queryClient.getQueryData<Session | null>(SESSION_KEY) ?? null;
              if (session) storeSession(queryClient, { ...session, csrfToken });
              toast({
                tone: 'success',
                title: 'Cambiaste tu contraseña',
                description: 'Cerramos tus sesiones en otros equipos. Esta sigue abierta.',
              });
              close(false);
            } catch (error) {
              if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
                setError(
                  'current',
                  { message: 'No es tu contraseña actual. Revisala y probá de nuevo.' },
                  { shouldFocus: true },
                );
              } else if (error instanceof ApiError && error.status === 401) {
                // La sesión venció: el router ya vuelve al ingreso.
                close(false);
              } else {
                setAlert(describeApiError(error));
              }
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Al guardarla cerramos tus sesiones en otros equipos. En este seguís adentro.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {alert ? <FormAlert>{alert}</FormAlert> : null}
            <PasswordField
              label="Contraseña actual"
              autoComplete="current-password"
              error={errors.current?.message}
              {...register('current')}
            />
            <PasswordField
              label="Contraseña nueva"
              autoComplete="new-password"
              aria-describedby="change-password-reqs"
              error={errors.password?.message}
              {...register('password')}
            />
            <PasswordField
              label="Repetir contraseña nueva"
              autoComplete="new-password"
              error={errors.confirm?.message}
              {...register('confirm')}
            />
            <ul id="change-password-reqs" className="flex flex-col gap-1.5 text-sm">
              <Requirement met={password.length >= MIN_PASSWORD}>
                {`Al menos ${MIN_PASSWORD} caracteres`}
              </Requirement>
              <Requirement met={password.length > 0 && password === confirm}>
                Las dos coinciden
              </Requirement>
              <Requirement met={password.length > 0 && password !== current}>
                Distinta de la actual
              </Requirement>
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
