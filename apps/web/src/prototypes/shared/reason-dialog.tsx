import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { Select, Textarea } from '@/components/ui/input';

const schema = z.object({
  reason: z.string().min(1, 'Elegí un motivo.'),
  detail: z.string().trim().max(200, 'Máximo 200 caracteres.'),
});
type Values = z.infer<typeof schema>;

/**
 * Diálogo de "motivo obligatorio" (cancelar, reasignar tras aceptar, devolver).
 * El verbo del botón es la acción: "Cancelar pedido", "Reasignar".
 * PROTOTIPO: los motivos son de ejemplo; en producción vienen del tenant.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  reasons: readonly string[];
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string, detail: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: '', detail: '' } });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          noValidate
          className="flex min-h-0 flex-col"
          onSubmit={handleSubmit((v) => {
            onConfirm(v.reason, v.detail);
            onOpenChange(false);
          })}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4 pb-5">
            <FormField label="Motivo" required error={errors.reason?.message}>
              <Select {...register('reason')}>
                <option value="">Elegí un motivo</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Detalle"
              help="Opcional. Queda en el historial."
              error={errors.detail?.message}
            >
              <Textarea rows={3} {...register('detail')} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
