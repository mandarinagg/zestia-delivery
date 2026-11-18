import { Loader2, WifiOff } from 'lucide-react';
import { useConnectionStatus, type ConnectionSource } from '@/hooks/use-connection-status';
import { cn } from '@/lib/utils';

/**
 * Banner de conexión en tiempo real. No ocupa lugar cuando todo está bien;
 * cuando se corta, baja desde la barra superior (220 ms) y se anuncia con role="status".
 */
export function ConnectionStatus({
  source,
  lastUpdate,
}: {
  source?: ConnectionSource;
  /** Hora de la última actualización recibida (ya formateada), si se conoce. */
  lastUpdate?: string;
}) {
  const state = useConnectionStatus(source);
  const since = lastUpdate ? ` Última actualización: ${lastUpdate}.` : '';

  return (
    <div role="status" aria-live="polite">
      {state === 'reconnecting' ? (
        <div className="zd-banner flex items-center gap-2 border-b border-tone-amber-solid/40 bg-tone-amber-bg px-4 py-2 text-[0.8125rem] font-semibold text-tone-amber-fg">
          <Loader2
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          <span>
            Reconectando… lo que ves puede estar desactualizado.
            <span className="font-normal">{since}</span>
          </span>
        </div>
      ) : null}
      {state === 'disconnected' ? (
        <div className="zd-banner flex items-center gap-2 border-b border-tone-red-solid/40 bg-tone-red-bg px-4 py-2 text-[0.8125rem] font-semibold text-tone-red-fg">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Sin conexión. Lo que ves puede estar desactualizado; no se pierden tus cambios.
            <span className="font-normal">{since}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

const LIVE = {
  connected: { label: 'En vivo', dot: 'bg-tone-green-solid text-tone-green-solid', fg: '' },
  reconnecting: {
    label: 'Reconectando',
    dot: 'bg-tone-amber-solid text-tone-amber-solid',
    fg: 'text-tone-amber-fg',
  },
  disconnected: {
    label: 'Sin conexión',
    dot: 'bg-tone-red-solid text-tone-red-solid',
    fg: 'text-tone-red-fg',
  },
} as const;

/**
 * Indicador compacto para la barra superior. Conectado: un punto verde que respira lento
 * (la única animación ambiental del panel; se apaga con reduced motion).
 * El anuncio a lectores de pantalla lo hace el banner, no este indicador.
 */
export function LiveIndicator({
  source,
  className,
  compact,
}: {
  source?: ConnectionSource;
  className?: string;
  compact?: boolean;
}) {
  const state = useConnectionStatus(source);
  const s = LIVE[state];
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-sm px-2 text-[0.8125rem] font-semibold',
        s.fg,
        className,
      )}
      title={compact ? s.label : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          s.dot,
          state === 'connected' && 'animate-breathe motion-reduce:animate-none',
          state === 'reconnecting' && 'animate-pulse motion-reduce:animate-none',
        )}
      />
      <span className={cn(compact && 'sr-only')}>{s.label}</span>
    </span>
  );
}
