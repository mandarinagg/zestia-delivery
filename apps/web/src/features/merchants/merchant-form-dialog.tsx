import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  type CreateMerchant,
  type CreateMerchantInput,
  type MerchantSummary,
  createMerchantSchema,
} from '@zestia/contracts';
import { useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { applyApiError } from './form-errors';
import { formatPhone } from './merchant-format';
import { invalidateMerchants, merchantsApi } from './merchants-api';

/**
 * Alta o edición de un comercio. Valida con el mismo esquema que la API
 * (`createMerchantSchema`): el teléfono se normaliza a E.164 y el RUC se revisa por formato.
 */
export function MerchantFormDialog({
  open,
  onOpenChange,
  merchant,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sin comercio: alta. */
  merchant?: MerchantSummary;
  onSaved?: (merchant: MerchantSummary) => void;
}) {
  const queryClient = useQueryClient();
  const editing = merchant !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMerchantInput, unknown, CreateMerchant>({
    resolver: zodResolver(createMerchantSchema),
    values: {
      name: merchant?.name ?? '',
      ruc: merchant?.ruc ?? '',
      phone: formatPhone(merchant?.phone ?? null),
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="flex min-h-0 flex-col"
          onSubmit={handleSubmit(async (values) => {
            try {
              const saved = editing
                ? await merchantsApi.update(merchant.id, values)
                : await merchantsApi.create(values);
              await invalidateMerchants(queryClient);
              toast({
                tone: 'success',
                title: editing ? 'Cambios guardados' : `Creaste ${saved.name}`,
              });
              onOpenChange(false);
              onSaved?.(saved);
            } catch (error) {
              applyApiError(error, setError, {
                duplicate: 'Ya hay un comercio con ese nombre.',
              });
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar comercio' : 'Nuevo comercio'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Los cambios quedan registrados en la auditoría.'
                : 'Después le agregás sus sucursales de retiro.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <FormField label="Nombre" required error={errors.name?.message}>
              <Input autoComplete="organization" {...register('name')} />
            </FormField>
            <FormField
              label="RUC"
              help="Opcional. Formato: 80012345-6."
              error={errors.ruc?.message}
            >
              <Input inputMode="numeric" autoComplete="off" {...register('ruc')} />
            </FormField>
            <FormField
              label="Teléfono de contacto"
              help="Opcional. El de WhatsApp para coordinar retiros. Ejemplo: 0981 123 456."
              error={errors.phone?.message}
            >
              <Input type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear comercio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
