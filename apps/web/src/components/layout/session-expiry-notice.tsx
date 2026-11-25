/*
 * Aviso antes de que venza la sesión (#14). Solo se monta en el layout autenticado del panel.
 *
 * Qué sabe: los segundos restantes que informó la API en cada respuesta (`lib/session-clock.ts`,
 * compartidos entre pestañas). Qué NO hace: confiar en su reloj para cerrar la sesión. Al llegar
 * a cero le pregunta al servidor con `GET /auth/session-status`, que NO renueva la sesión (si no,
 * un panel abandonado se mantendría vivo solo): 401 → ingreso con el motivo; 200 con un
 * vencimiento más tardío → otra pestaña la renovó, no pasa nada; 200 sin moverlo → quedaban
 * fracciones de segundo, se vuelve a preguntar un poco después. Lo único del aviso que renueva
 * es "Seguir conectado" (`GET /auth/me`), a pedido de la persona. Nunca hay polling.
 *
 * Timers: un solo `setTimeout`, reprogramado cada vez que cambian los vencimientos (llega hasta
 * el aviso, o hasta el vencimiento si ya se descartó), y un intervalo de 1 s solo mientras el
 * diálogo está a la vista. Sin animaciones propias; la entrada del diálogo ya respeta
 * `prefers-reduced-motion` desde el CSS global.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { authApi } from '@/features/auth/auth-api';
import { useLogout } from '@/features/auth/use-logout';
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
import { formatTime } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { getSessionDeadlines, subscribeSessionDeadlines } from '@/lib/session-clock';
import { sessionQuery, storeSession } from '@/lib/session';

/** Cuánto antes del vencimiento aparece el aviso. */
export const SESSION_WARNING_MS = 2 * 60 * 1000;

/**
 * Si el vencimiento absoluto está a menos de esto del de inactividad, renovar no alcanza para
 * nada: la sesión termina igual a esa hora. (Los dos vencimientos llegan de pedidos distintos,
 * con algo de desfase.)
 */
const ABSOLUTE_TOLERANCE_MS = 5_000;

const WARNING_MINUTES = SESSION_WARNING_MS / 60_000;

/** Un vencimiento que sube más que esto entre dos respuestas es una renovación, no desfase. */
const RENEWAL_TOLERANCE_MS = 5_000;

/** Si la sesión seguía válida por fracciones de segundo, se vuelve a preguntar después de esto. */
const RETRY_MARGIN_MS = 2_000;

export type SessionEndReason = 'idle' | 'absolute';

/** `125_000` -> `02:05`. Nunca negativo; redondea hacia arriba para no mostrar `00:00` antes de tiempo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function SessionExpiryNotice() {
  const deadlines = useSyncExternalStore(subscribeSessionDeadlines, getSessionDeadlines);
  const queryClient = useQueryClient();
  const router = useRouter();
  const logout = useLogout();
  const [now, setNow] = useState(() => Date.now());
  const [dismissedAbsolute, setDismissedAbsolute] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);
  /** Próxima pregunta al servidor cuando la anterior encontró la sesión viva por fracciones. */
  const [retry, setRetry] = useState<{ for: number; at: number } | null>(null);
  /** Vencimiento para el que ya se le preguntó al servidor: no se repite hasta que cambie. */
  const checkedFor = useRef<number | null>(null);

  const end = deadlines ? Math.min(deadlines.idle, deadlines.absolute) : null;
  const reason: SessionEndReason =
    deadlines && deadlines.absolute - deadlines.idle <= ABSOLUTE_TOLERANCE_MS ? 'absolute' : 'idle';
  const dismissed = reason === 'absolute' && deadlines?.absolute === dismissedAbsolute;
  // `now` solo lo mueven los timers de abajo: si los vencimientos cambian (otra pestaña
  // renovó), el aviso se cierra solo porque el nuevo vencimiento queda lejos de `now`.
  const warned = end !== null && now >= end - SESSION_WARNING_MS;
  const due = end !== null && now >= end;
  const visible = warned && !dismissed;

  /** 401 en cualquier pregunta: la sesión terminó. Limpia todo y va al ingreso con el motivo. */
  async function endSession(why: SessionEndReason) {
    queryClient.clear();
    storeSession(queryClient, null);
    await router.navigate({
      to: '/ingreso',
      search: { redirect: router.state.location.href, reason: why },
    });
  }

  /** Pregunta al servidor SIN renovar. Ver el comentario del archivo para cada resultado. */
  async function checkStatus(at: number, why: SessionEndReason) {
    if (checkedFor.current === at) return;
    checkedFor.current = at;
    try {
      await authApi.sessionStatus();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await endSession(why);
      // Sin red u otro error: queda el diálogo con 00:00 y "Seguir conectado" para reintentar.
      return;
    }
    const after = getSessionDeadlines();
    if (!after) return; // la sesión se cerró mientras tanto (logout, otra pestaña)
    const newEnd = Math.min(after.idle, after.absolute);
    if (newEnd > at + RENEWAL_TOLERANCE_MS) return; // renovó otra pestaña: se cierra el aviso
    // Seguía válida por fracciones de segundo: volver a preguntar apenas pase lo que queda.
    checkedFor.current = null;
    setRetry({ for: newEnd, at: Math.max(Date.now(), newEnd) + RETRY_MARGIN_MS });
  }

  // Un solo timeout hasta el próximo hito: el aviso, el vencimiento (hora de preguntar) o el
  // reintento. Se reprograma cuando cambia cualquiera de esos datos.
  useEffect(() => {
    if (end === null) return;
    const target =
      retry?.for === end
        ? retry.at
        : due
          ? Date.now()
          : warned || dismissed
            ? end
            : end - SESSION_WARNING_MS;
    const id = window.setTimeout(
      () => {
        const t = Math.max(Date.now(), target);
        setNow(t);
        if (t >= end) void checkStatus(end, reason);
      },
      Math.max(0, target - Date.now()),
    );
    return () => window.clearTimeout(id);
    // `checkStatus` solo usa refs, el cliente de queries y el router: no hace falta reprogramar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlines, dismissed, warned, due, retry]);

  // Cuenta regresiva: un intervalo de 1 s, solo con el diálogo a la vista.
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [visible]);

  async function keepAlive() {
    setRenewing(true);
    try {
      // La única vía del aviso que renueva (GET /auth/me); 401 → la sesión ya había terminado.
      const session = await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
      if (!session) await endSession(reason);
    } catch {
      toast({
        tone: 'danger',
        title: 'No pudimos renovar la sesión',
        description: 'Revisá tu conexión y probá de nuevo.',
      });
    } finally {
      setRenewing(false);
    }
  }

  if (!visible || !deadlines || end === null) return null;
  const remaining = formatCountdown(end - now);

  if (reason === 'absolute') {
    const at = formatTime(new Date(deadlines.absolute).toISOString());
    return (
      <Dialog
        open
        onOpenChange={(open) => (open ? undefined : setDismissedAbsolute(deadlines.absolute))}
      >
        <DialogContent role="alertdialog" hideClose>
          <DialogHeader>
            <DialogTitle>Tu sesión está por terminar</DialogTitle>
            <DialogDescription>
              Tu sesión termina a las {at}, en menos de {WARNING_MINUTES} minutos. Guardá tus
              cambios y volvé a ingresar.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Countdown value={remaining} />
          </DialogBody>
          <DialogFooter>
            <Button autoFocus onClick={() => setDismissedAbsolute(deadlines.absolute)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        role="alertdialog"
        hideClose
        // Sin salida por Escape ni clic afuera: hay que elegir (si no, la sesión se cae callada).
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Tu sesión va a cerrarse por inactividad</DialogTitle>
          <DialogDescription>
            Por seguridad, la sesión se cierra después de un rato sin uso, y eso va a pasar en menos
            de {WARNING_MINUTES} minutos. Si querés seguir, tocá “Seguir conectado”.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Countdown value={remaining} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={renewing} onClick={() => void logout()}>
            Cerrar sesión
          </Button>
          <Button
            autoFocus
            disabled={renewing}
            aria-busy={renewing || undefined}
            onClick={() => void keepAlive()}
          >
            {renewing ? 'Renovando…' : 'Seguir conectado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cuenta regresiva a la vista. `role="timer"` no se anuncia sola; el aviso se lee una vez al abrir. */
function Countdown({ value }: { value: string }) {
  return (
    <p className="flex flex-col items-center gap-1 py-2">
      <span className="text-xs font-medium text-muted-foreground">Tiempo restante</span>
      <span role="timer" aria-live="off" className="font-numeric text-4xl font-semibold">
        {value}
      </span>
    </p>
  );
}
