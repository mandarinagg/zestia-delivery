import { useSyncExternalStore } from 'react';

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

type Listener = () => void;

/**
 * Fuente de estado de conexión. Hoy es un stub controlable a mano; el cliente SSE
 * (más adelante) llamará a `set()` con el estado real. No inventa datos.
 */
export interface ConnectionSource {
  get: () => ConnectionState;
  set: (state: ConnectionState) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createConnectionSource(initial: ConnectionState = 'connected'): ConnectionSource {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: (next) => {
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const appConnection = createConnectionSource();

export function useConnectionStatus(source: ConnectionSource = appConnection): ConnectionState {
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}
