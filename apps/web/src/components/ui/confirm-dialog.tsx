import { type ReactNode, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

/**
 * Confirmación de una acción con consecuencias (archivar, suspender). El foco arranca en
 * "Cancelar": Enter por inercia no confirma. Mientras `onConfirm` corre, no se puede cerrar.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  busyLabel = 'Procesando…',
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  /** Si resuelve, el diálogo se cierra; si rechaza, queda abierto (el error lo avisa quien llama). */
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent role="alertdialog" hideClose={busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <DialogBody className="text-sm">{children}</DialogBody> : null}
        <DialogFooter>
          <Button variant="outline" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                /* quien llama muestra el error */
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
