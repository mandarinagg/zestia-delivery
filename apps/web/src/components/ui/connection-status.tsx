import { Loader2, WifiOff } from 'lucide-react';
import { useConnectionStatus, type ConnectionSource } from '@/hooks/use-connection-status';

/**
 * Banner de conexión en tiempo real. No ocupa lugar cuando todo está bien.
 * Usa role="status" para anunciar el cambio sin robar el foco.
 */
export function ConnectionStatus({ source }: { source?: ConnectionSource }) {
  const state = useConnectionStatus(source);

  return (
    <div role="status" aria-live="polite">
      {state === 'reconnecting' ? (
        <div className="flex items-center gap-2 border-b bg-status-warning-bg px-4 py-2 text-sm font-medium text-status-warning-fg">
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          Reconectando… los datos pueden estar desactualizados.
        </div>
      ) : null}
      {state === 'disconnected' ? (
        <div className="flex items-center gap-2 border-b bg-status-danger-bg px-4 py-2 text-sm font-medium text-status-danger-fg">
          <WifiOff aria-hidden="true" className="size-4" />
          Sin conexión. Los datos que ves pueden estar desactualizados.
        </div>
      ) : null}
    </div>
  );
}
