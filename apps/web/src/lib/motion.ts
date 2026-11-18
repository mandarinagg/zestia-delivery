import { flushSync } from 'react-dom';

/** true si la persona pidió reducir el movimiento en su sistema. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** El navegador soporta View Transitions y la persona no pidió reducir movimiento. */
export function canViewTransition(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !prefersReducedMotion()
  );
}

/**
 * Aplica un cambio de estado de UI dentro de una View Transition, para que los elementos con
 * `view-transition-name` viajen de su posición vieja a la nueva (p. ej. una tarjeta que cambia
 * de columna al asignarse). Sin soporte del navegador o con reduced motion, aplica el cambio
 * directo. Costo: 0 KB de JS; la animación la hace el compositor.
 * Devuelve una promesa que se resuelve al terminar la animación (o enseguida si no hubo).
 */
export function withViewTransition(update: () => void): Promise<void> {
  if (!canViewTransition()) {
    update();
    return Promise.resolve();
  }
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  return transition.finished.catch(() => undefined);
}

/** Nombre de transición seguro a partir de un id (solo [a-z0-9-]). */
export function vtName(prefix: string, id: string): string {
  return `${prefix}-${id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}
