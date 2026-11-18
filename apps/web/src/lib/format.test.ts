import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatPYG,
  formatTime,
  minutesBetween,
} from './format';

describe('formatPYG', () => {
  it.each([
    [0, 'Gs. 0'],
    [999, 'Gs. 999'],
    [25000, 'Gs. 25.000'],
    [1234567, 'Gs. 1.234.567'],
    [-15000, '-Gs. 15.000'],
  ])('%i -> %s', (amount, expected) => {
    expect(formatPYG(amount)).toBe(expected);
  });

  it('rechaza decimales y valores no finitos', () => {
    expect(() => formatPYG(10.5)).toThrow(RangeError);
    expect(() => formatPYG(Number.NaN)).toThrow(RangeError);
  });
});

describe('fechas en zona del tenant', () => {
  it('convierte UTC a America/Asuncion (UTC-3)', () => {
    expect(formatDateTime('2026-11-17T12:00:00Z')).toBe('17/11/2026 09:00');
  });

  it('cruza el día hacia atrás', () => {
    expect(formatDate('2026-11-17T01:30:00Z')).toBe('16/11/2026');
    expect(formatTime('2026-11-17T01:30:00Z')).toBe('22:30');
  });

  it('respeta otra zona horaria', () => {
    expect(formatDateTime('2026-11-17T12:00:00Z', 'UTC')).toBe('17/11/2026 12:00');
  });

  it('usa 24 horas a medianoche', () => {
    expect(formatTime('2026-11-17T03:00:00Z')).toBe('00:00');
  });

  it('rechaza fechas inválidas', () => {
    expect(() => formatDate('no-es-fecha')).toThrow(RangeError);
  });
});

describe('duraciones', () => {
  it.each([
    [0, '< 1 min'],
    [7, '7 min'],
    [59, '59 min'],
    [65, '1 h 05'],
    [130, '2 h 10'],
  ])('%i -> %s', (m, expected) => {
    expect(formatMinutes(m)).toBe(expected);
  });

  it('calcula minutos entre instantes y nunca negativos', () => {
    expect(minutesBetween('2026-11-18T17:00:00Z', '2026-11-18T17:12:59Z')).toBe(12);
    expect(minutesBetween('2026-11-18T17:10:00Z', '2026-11-18T17:00:00Z')).toBe(0);
  });
});
