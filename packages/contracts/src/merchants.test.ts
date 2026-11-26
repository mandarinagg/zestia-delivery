import { describe, expect, it } from 'vitest';
import {
  createBranchSchema,
  createMerchantSchema,
  merchantListQuerySchema,
  normalizePhone,
  openingHoursSchema,
  optionalPhoneSchema,
  updateMerchantSchema,
} from './merchants.js';

describe('normalizePhone / optionalPhoneSchema', () => {
  it.each([
    ['0981 123 456', '+595981123456'],
    ['(0981) 123-456', '+595981123456'],
    ['981123456', '+595981123456'],
    ['595981123456', '+595981123456'],
    ['+595 981 123456', '+595981123456'],
    ['00595981123456', '+595981123456'],
    ['021 600 000', '+59521600000'],
    ['+54 11 4000 0000', '+541140000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(optionalPhoneSchema.parse(input)).toBe(expected);
  });

  it('vacío o ausente → null', () => {
    expect(optionalPhoneSchema.parse('')).toBeNull();
    expect(optionalPhoneSchema.parse('   ')).toBeNull();
    expect(optionalPhoneSchema.parse(null)).toBeNull();
    expect(optionalPhoneSchema.parse(undefined)).toBeNull();
  });

  it.each(['abc', '0981-abc', '+12', '1234', '+0981123456', '+5959811234567890'])(
    'rechaza %s',
    (input) => {
      expect(optionalPhoneSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('createMerchantSchema', () => {
  it('normaliza nombre, RUC y teléfono', () => {
    expect(
      createMerchantSchema.parse({
        name: '  La Esquina ',
        ruc: ' 80012345-6 ',
        phone: '0981123456',
      }),
    ).toEqual({ name: 'La Esquina', ruc: '80012345-6', phone: '+595981123456' });
  });

  it('opcionales vacíos → null', () => {
    expect(createMerchantSchema.parse({ name: 'X', ruc: '', phone: '' })).toEqual({
      name: 'X',
      ruc: null,
      phone: null,
    });
  });

  it.each([
    [{ name: '   ' }],
    [{ name: 'x'.repeat(121) }],
    [{ name: 'X', ruc: '80012345' }],
    [{ name: 'X', ruc: '800123456-7' }],
    [{ name: 'X', tenantId: 'otro' }],
    [{ name: 'X', status: 'ARCHIVED' }],
  ])('rechaza %o', (input) => {
    expect(createMerchantSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateMerchantSchema', () => {
  it('acepta cambios parciales y null para borrar opcionales', () => {
    expect(updateMerchantSchema.parse({ phone: null })).toEqual({ phone: null });
    expect(updateMerchantSchema.parse({ name: 'Nuevo' })).toEqual({ name: 'Nuevo' });
  });

  it('rechaza un cuerpo vacío o con estado', () => {
    expect(updateMerchantSchema.safeParse({}).success).toBe(false);
    expect(updateMerchantSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
  });
});

describe('openingHoursSchema', () => {
  it('acepta franjas ordenadas (mañana y tarde) y días cerrados', () => {
    const hours = {
      mon: [
        { from: '08:00', to: '12:00' },
        { from: '14:00', to: '18:30' },
      ],
      sun: [],
    };
    expect(openingHoursSchema.parse(hours)).toEqual(hours);
  });

  it.each([
    [{ mon: [{ from: '18:00', to: '08:00' }] }],
    [{ mon: [{ from: '8:00', to: '12:00' }] }],
    [{ mon: [{ from: '24:00', to: '23:00' }] }],
    [
      {
        mon: [
          { from: '08:00', to: '13:00' },
          { from: '12:00', to: '18:00' },
        ],
      },
    ],
    [{ lunes: [] }],
    [{ mon: Array.from({ length: 4 }, (_, i) => ({ from: `0${i}:00`, to: `0${i}:30` })) }],
  ])('rechaza %o', (hours) => {
    expect(openingHoursSchema.safeParse(hours).success).toBe(false);
  });
});

describe('createBranchSchema', () => {
  it('exige dirección, barrio y ciudad; horario por defecto vacío', () => {
    const parsed = createBranchSchema.parse({
      name: 'Centro',
      address: 'Palma 123',
      neighborhood: 'Catedral',
      city: 'Asunción',
      references: '',
    });
    expect(parsed).toMatchObject({ references: null, phone: null, openingHours: {} });
    expect(createBranchSchema.safeParse({ name: 'Centro' }).success).toBe(false);
  });
});

describe('merchantListQuerySchema', () => {
  it('ignora parámetros desconocidos y aplica el límite por defecto', () => {
    expect(merchantListQuerySchema.parse({ tenantId: 'x' })).toEqual({ limit: 50 });
  });
});
