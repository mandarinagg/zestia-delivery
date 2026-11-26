import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/form-field';

/** Esquema de ejemplo (demo): no corresponde a ningún contrato real de la API. */
export const sampleFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingresá el nombre del comercio.')
    .max(80, 'Máximo 80 caracteres.'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?595|0)\d{8,9}$/, 'Ingresá un teléfono válido, por ejemplo 0981123456.'),
  zone: z.string().min(1, 'Elegí una zona.'),
  baseFee: z.coerce
    .number({ error: 'Ingresá un monto en números.' })
    .int('El monto no puede tener decimales.')
    .min(0, 'El monto no puede ser negativo.'),
  notes: z.string().max(200, 'Máximo 200 caracteres.').optional(),
  accepted: z.boolean().refine((v) => v, 'Tenés que confirmar los datos para continuar.'),
});

export type SampleFormValues = z.input<typeof sampleFormSchema>;
export type SampleFormOutput = z.output<typeof sampleFormSchema>;

export function SampleForm({ onSubmit }: { onSubmit?: (values: SampleFormOutput) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<SampleFormValues, unknown, SampleFormOutput>({
    resolver: zodResolver(sampleFormSchema),
    defaultValues: { name: '', phone: '', zone: '', baseFee: '', notes: '', accepted: false },
  });

  return (
    <form
      noValidate
      aria-label="Formulario de ejemplo"
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit(async (values) => {
        onSubmit?.(values);
      })}
    >
      <FormField label="Nombre del comercio" required error={errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <FormField
        label="Teléfono"
        required
        help="Con o sin código de país."
        error={errors.phone?.message}
      >
        <Input type="tel" inputMode="tel" {...register('phone')} />
      </FormField>
      <FormField label="Zona" required error={errors.zone?.message}>
        <Select {...register('zone')}>
          <option value="">Elegí una zona</option>
          <option value="centro">Centro (ejemplo)</option>
          <option value="norte">Norte (ejemplo)</option>
        </Select>
      </FormField>
      <FormField
        label="Tarifa base (Gs.)"
        required
        help="Monto entero, sin puntos."
        error={errors.baseFee?.message}
      >
        <Input inputMode="numeric" {...register('baseFee')} />
      </FormField>
      <FormField
        label="Notas"
        help="Opcional."
        error={errors.notes?.message}
        className="sm:col-span-2"
      >
        <Textarea {...register('notes')} />
      </FormField>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sample-accepted"
            aria-invalid={errors.accepted ? true : undefined}
            {...register('accepted')}
          />
          <Label htmlFor="sample-accepted" required>
            Confirmo que los datos son correctos
          </Label>
        </div>
        {errors.accepted ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.accepted.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          Guardar comercio
        </Button>
        <Button type="button" variant="ghost" onClick={() => reset()}>
          Limpiar
        </Button>
        {isSubmitSuccessful ? (
          <p role="status" className="text-sm font-medium text-status-success-fg">
            Guardado (demo, no se envió nada).
          </p>
        ) : null}
      </div>
    </form>
  );
}
