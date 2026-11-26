import { z } from 'zod';

/**
 * Contratos de comercios y sucursales (`/api/v1/merchants`, issue #19). Ver
 * docs/API_CONTRACTS.md. Los mismos esquemas validan el formulario web y la API.
 */

/* --- Teléfono ------------------------------------------------------------------------------ */

/**
 * Normaliza un teléfono a E.164. Sin prefijo internacional se asume Paraguay (+595):
 * `0981 123 456` → `+595981123456`; `00` inicial = `+`. Devuelve `null` si no queda un número
 * posible (la validación final la hace `PHONE_E164`).
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '');
  if (compact === '') return null;
  let digits: string;
  if (compact.startsWith('+')) digits = compact.slice(1);
  else if (compact.startsWith('00')) digits = compact.slice(2);
  else if (compact.startsWith('595')) digits = compact;
  else if (compact.startsWith('0')) digits = `595${compact.slice(1)}`;
  else digits = `595${compact}`;
  return /^\d+$/.test(digits) ? `+${digits}` : null;
}

export const PHONE_E164 = /^\+[1-9]\d{7,14}$/;

/** Teléfono opcional: vacío → `null`; si no, normalizado a E.164. */
export const optionalPhoneSchema = z
  .string()
  .max(32, 'Revisá el teléfono.')
  .nullish()
  .transform((value, ctx) => {
    if (value == null || value.trim() === '') return null;
    const phone = normalizePhone(value);
    if (!phone || !PHONE_E164.test(phone)) {
      ctx.addIssue({ code: 'custom', message: 'Revisá el teléfono. Ejemplo: 0981 123 456.' });
      return z.NEVER;
    }
    return phone;
  });

/* --- Campos -------------------------------------------------------------------------------- */

/** Texto obligatorio: sin espacios alrededor, entre 1 y `max` caracteres. */
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `Ingresá ${label}.`).max(max, `Usá como mucho ${max} caracteres.`);

/** Texto opcional: vacío → `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usá como mucho ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

/** RUC paraguayo `número-dígito verificador` (p. ej. 80012345-6). Solo el formato. */
export const optionalRucSchema = z
  .string()
  .trim()
  .max(12)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{1,8}-\d$/.test(v), {
    message: 'Revisá el RUC. Formato: 80012345-6.',
  });

/* --- Horarios ------------------------------------------------------------------------------ */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM).');

export const timeRangeSchema = z
  .object({ from: timeSchema, to: timeSchema })
  .refine((r) => r.from < r.to, {
    message: 'La hora de cierre tiene que ser posterior a la de apertura.',
    path: ['to'],
  });

/**
 * Horario semanal en hora local del tenant. Día ausente o lista vacía = cerrado. Hasta 3
 * franjas por día, ordenadas y sin superponerse (p. ej. mañana y tarde).
 */
export const openingHoursSchema = z
  .partialRecord(z.enum(WEEKDAYS), z.array(timeRangeSchema).max(3))
  .superRefine((hours, ctx) => {
    for (const day of WEEKDAYS) {
      const ranges = hours[day] ?? [];
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i]!.from < ranges[i - 1]!.to) {
          ctx.addIssue({
            code: 'custom',
            path: [day, i, 'from'],
            message: 'Las franjas tienen que estar en orden y sin superponerse.',
          });
        }
      }
    }
  });
export type OpeningHours = z.infer<typeof openingHoursSchema>;

/* --- Comercios ----------------------------------------------------------------------------- */

export const MERCHANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export const merchantStatusSchema = z.enum(MERCHANT_STATUSES);
export type MerchantStatus = z.infer<typeof merchantStatusSchema>;

export const createMerchantSchema = z.strictObject({
  name: requiredText('el nombre', 120),
  ruc: optionalRucSchema,
  phone: optionalPhoneSchema,
});
export type CreateMerchantInput = z.input<typeof createMerchantSchema>;
export type CreateMerchant = z.output<typeof createMerchantSchema>;

/** Edición parcial: solo los campos enviados cambian (`null` borra un opcional). */
export const updateMerchantSchema = z
  .strictObject({
    name: requiredText('el nombre', 120).optional(),
    ruc: optionalRucSchema.optional(),
    phone: optionalPhoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios.' });
export type UpdateMerchant = z.output<typeof updateMerchantSchema>;

export const MERCHANTS_PAGE_DEFAULT = 50;
export const MERCHANTS_PAGE_MAX = 100;

export const merchantListQuerySchema = z.object({
  /** Por defecto: activos y suspendidos (los archivados solo si se piden). */
  status: merchantStatusSchema.optional(),
  /** Busca en nombre (contiene, sin mayúsculas) o RUC (prefijo). */
  q: z.string().trim().max(120).optional(),
  /** `nextCursor` de la página anterior (opaco). */
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(MERCHANTS_PAGE_MAX).default(MERCHANTS_PAGE_DEFAULT),
});
export type MerchantListQuery = z.infer<typeof merchantListQuerySchema>;

export const merchantSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ruc: z.string().nullable(),
  phone: z.string().nullable(),
  status: merchantStatusSchema,
  /** Sucursales vigentes (no archivadas). */
  branchCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MerchantSummary = z.infer<typeof merchantSummarySchema>;

export const merchantPageSchema = z.object({
  data: z.array(merchantSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MerchantPage = z.infer<typeof merchantPageSchema>;

/* --- Sucursales ---------------------------------------------------------------------------- */

const branchFields = {
  name: requiredText('el nombre de la sucursal', 120),
  address: requiredText('la dirección', 200),
  neighborhood: requiredText('el barrio', 80),
  city: requiredText('la ciudad', 80),
  references: optionalText(300),
  phone: optionalPhoneSchema,
  openingHours: openingHoursSchema.default({}),
};

export const createBranchSchema = z.strictObject(branchFields);
export type CreateBranchInput = z.input<typeof createBranchSchema>;
export type CreateBranch = z.output<typeof createBranchSchema>;

export const updateBranchSchema = z
  .strictObject({
    name: branchFields.name.optional(),
    address: branchFields.address.optional(),
    neighborhood: branchFields.neighborhood.optional(),
    city: branchFields.city.optional(),
    references: branchFields.references.optional(),
    phone: branchFields.phone.optional(),
    openingHours: openingHoursSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios.' });
export type UpdateBranch = z.output<typeof updateBranchSchema>;

export const branchSchema = z.object({
  id: z.uuid(),
  merchantId: z.uuid(),
  name: z.string(),
  address: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  references: z.string().nullable(),
  phone: z.string().nullable(),
  openingHours: openingHoursSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Branch = z.infer<typeof branchSchema>;

/** Detalle: el comercio con sus sucursales vigentes, por nombre. */
export const merchantDetailSchema = merchantSummarySchema.extend({
  branches: z.array(branchSchema),
});
export type MerchantDetail = z.infer<typeof merchantDetailSchema>;

/** Códigos de error propios del módulo (además de 400/401/403/404 genéricos). */
export const merchantErrorCodeSchema = z.enum([
  /** Ya hay un comercio vigente con ese nombre (o una sucursal con ese nombre en el comercio). */
  'DUPLICATE_NAME',
  /** Transición de estado no permitida (p. ej. reactivar uno archivado). */
  'INVALID_STATUS_TRANSITION',
  /** El comercio está archivado: no se puede modificar. */
  'MERCHANT_ARCHIVED',
]);
export type MerchantErrorCode = z.infer<typeof merchantErrorCodeSchema>;
