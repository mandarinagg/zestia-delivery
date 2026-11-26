import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * Diálogo y cajón (Sheet) sobre Radix Dialog: atrapa el foco, cierra con Escape,
 * devuelve el foco al disparador y bloquea el scroll del fondo.
 * Movimiento: el diálogo aparece (pop 140 ms), el cajón se desliza desde su borde (320 ms).
 */

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

function Overlay({ className }: { className?: string }) {
  return (
    <Primitive.Overlay className={cn('zd-overlay fixed inset-0 z-50 bg-(--scrim)', className)} />
  );
}

function CloseButton({ className }: { className?: string }) {
  return (
    <Primitive.Close
      aria-label="Cerrar"
      className={cn(
        'absolute right-3 top-3 inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      <X aria-hidden="true" className="size-4" />
    </Primitive.Close>
  );
}

export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: ComponentProps<typeof Primitive.Content> & { hideClose?: boolean }) {
  return (
    <Primitive.Portal>
      <Overlay />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <Primitive.Content
          className={cn(
            'zd-pop pointer-events-auto relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border bg-raised text-foreground shadow-overlay sm:max-w-lg sm:rounded-xl',
            className,
          )}
          {...props}
        >
          {children}
          {hideClose ? null : <CloseButton />}
        </Primitive.Content>
      </div>
    </Primitive.Portal>
  );
}

export type SheetSide = 'left' | 'right' | 'bottom';

/** Cajón lateral (panel) o inferior (móvil, PWA). */
export function SheetContent({
  side = 'right',
  className,
  children,
  hideClose,
  closeClassName,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  side?: SheetSide;
  hideClose?: boolean;
  closeClassName?: string;
}) {
  return (
    <Primitive.Portal>
      <Overlay />
      <Primitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-raised text-foreground shadow-overlay',
          side === 'left' && 'zd-sheet-left inset-y-0 left-0 w-[min(18rem,86vw)] border-r',
          side === 'right' &&
            'zd-sheet-right inset-y-0 right-0 w-full border-l sm:w-[min(32rem,92vw)]',
          side === 'bottom' &&
            'zd-sheet-bottom inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl border-t pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        {...props}
      >
        {side === 'bottom' ? (
          <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
        ) : null}
        {children}
        {hideClose ? null : <CloseButton className={closeClassName} />}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pb-2 pr-12 pt-5', className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-3', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t bg-subtle px-5 py-3 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof Primitive.Title> & { children: ReactNode }) {
  return (
    <Primitive.Title
      className={cn('font-display text-xl font-semibold leading-7', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}
