import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  type Branch,
  type CreateBranch,
  type CreateBranchInput,
  type Weekday,
  WEEKDAYS,
  createBranchSchema,
} from '@zestia/contracts';
import { Plus, X } from 'lucide-react';
import { type Control, type UseFormRegister, useFieldArray, useForm } from 'react-hook-form';
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
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { applyApiError } from './form-errors';
import { WEEKDAY_LABEL, formatPhone } from './merchant-format';
import { invalidateMerchants, merchantsApi } from './merchants-api';

const MAX_RANGES = 3;

/** Todos los días presentes (vacío = cerrado) para que cada uno tenga su lista editable. */
function fullWeek(
  hours: Branch['openingHours'] = {},
): Record<Weekday, { from: string; to: string }[]> {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, [...(hours[d] ?? [])]])) as Record<
    Weekday,
    { from: string; to: string }[]
  >;
}

function DayHours({
  day,
  control,
  register,
  error,
}: {
  day: Weekday;
  control: Control<CreateBranchInput, unknown, CreateBranch>;
  register: UseFormRegister<CreateBranchInput>;
  error?: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `openingHours.${day}` });
  const label = WEEKDAY_LABEL[day];
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-1.5 py-2 sm:flex-row sm:gap-3"
    >
      <span className="w-24 shrink-0 pt-1.5 text-sm font-semibold">{label}</span>
      <div className="flex flex-1 flex-col gap-1.5">
        {fields.length === 0 ? (
          <span className="pt-1.5 text-sm text-muted-foreground">Cerrado</span>
        ) : (
          fields.map((field, i) => (
            <div key={field.id} className="flex items-center gap-1.5">
              <Input
                type="time"
                aria-label={`${label}, franja ${i + 1}, abre`}
                className="w-28"
                {...register(`openingHours.${day}.${i}.from`)}
              />
              <span aria-hidden="true">–</span>
              <Input
                type="time"
                aria-label={`${label}, franja ${i + 1}, cierra`}
                className="w-28"
                {...register(`openingHours.${day}.${i}.to`)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar franja ${i + 1} del ${label.toLowerCase()}`}
                onClick={() => remove(i)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      {fields.length < MAX_RANGES ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          aria-label={
            fields.length === 0
              ? `Abrir el ${label.toLowerCase()}`
              : `Agregar franja al ${label.toLowerCase()}`
          }
          onClick={() => {
            const last = fields.at(-1);
            append(last ? { from: last.to, to: last.to } : { from: '08:00', to: '18:00' });
          }}
        >
          <Plus aria-hidden="true" />
          {fields.length === 0 ? 'Abrir' : 'Franja'}
        </Button>
      ) : null}
    </div>
  );
}

/** Primer mensaje de error de las franjas de un día (rango invertido, superposición, formato). */
function dayError(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined;
  const stack: unknown[] = [errors];
  while (stack.length) {
    const node = stack.pop();
    if (node && typeof node === 'object') {
      const message = (node as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      stack.push(...Object.values(node));
    }
  }
  return undefined;
}

/** Alta o edición de una sucursal, con su horario semanal (hasta 3 franjas por día). */
export function BranchFormDialog({
  open,
  onOpenChange,
  merchantId,
  branch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantId: string;
  /** Sin sucursal: alta. */
  branch?: Branch;
}) {
  const queryClient = useQueryClient();
  const editing = branch !== undefined;
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBranchInput, unknown, CreateBranch>({
    resolver: zodResolver(createBranchSchema),
    values: {
      name: branch?.name ?? '',
      address: branch?.address ?? '',
      neighborhood: branch?.neighborhood ?? '',
      city: branch?.city ?? '',
      references: branch?.references ?? '',
      phone: formatPhone(branch?.phone ?? null),
      openingHours: fullWeek(branch?.openingHours),
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
      <DialogContent className="sm:max-w-2xl">
        <form
          noValidate
          className="flex min-h-0 flex-col"
          onSubmit={handleSubmit(async (values) => {
            // Los días sin franjas no se envían (cerrado).
            const openingHours = Object.fromEntries(
              Object.entries(values.openingHours).filter(([, ranges]) => ranges && ranges.length),
            );
            const body = { ...values, openingHours };
            try {
              if (editing) await merchantsApi.updateBranch(merchantId, branch.id, body);
              else await merchantsApi.createBranch(merchantId, body);
              await invalidateMerchants(queryClient);
              toast({
                tone: 'success',
                title: editing ? 'Sucursal actualizada' : `Agregaste ${values.name}`,
              });
              onOpenChange(false);
            } catch (error) {
              applyApiError(error, setError, {
                duplicate: 'Este comercio ya tiene una sucursal con ese nombre.',
              });
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
            <DialogDescription>
              Dónde retiran los repartidores. Barrio y ciudad se usan para las zonas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4 overflow-y-auto">
            <FormField
              label="Nombre"
              required
              help="Ejemplo: Casa central, Sucursal San Lorenzo."
              error={errors.name?.message}
            >
              <Input {...register('name')} />
            </FormField>
            <FormField label="Dirección" required error={errors.address?.message}>
              <Input autoComplete="street-address" {...register('address')} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Barrio" required error={errors.neighborhood?.message}>
                <Input {...register('neighborhood')} />
              </FormField>
              <FormField label="Ciudad" required error={errors.city?.message}>
                <Input autoComplete="address-level2" {...register('city')} />
              </FormField>
            </div>
            <FormField
              label="Referencias"
              help="Opcional. Cómo encontrar el lugar o por dónde entrar."
              error={errors.references?.message}
            >
              <Textarea rows={2} {...register('references')} />
            </FormField>
            <FormField
              label="Teléfono de la sucursal"
              help="Opcional."
              error={errors.phone?.message}
            >
              <Input type="tel" inputMode="tel" {...register('phone')} />
            </FormField>
            <fieldset>
              <legend className="text-sm font-semibold">Horario de retiro</legend>
              <p className="text-xs text-muted-foreground">
                En la hora local de tu empresa. Hasta {MAX_RANGES} franjas por día (por ejemplo,
                mañana y tarde).
              </p>
              <div className="mt-1 divide-y">
                {WEEKDAYS.map((day) => (
                  <DayHours
                    key={day}
                    day={day}
                    control={control}
                    register={register}
                    error={dayError(errors.openingHours?.[day])}
                  />
                ))}
              </div>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar sucursal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
