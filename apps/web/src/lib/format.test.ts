import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatPYG,
  nextDay,
  toDateInput,
  zonedDayStartToUtc,
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

describe('días en la zona del tenant (filtros por fecha)', () => {
  it('inicio del día en Asunción (UTC−3) en UTC', () => {
    expect(zonedDayStartToUtc('2026-11-18')).toBe('2026-11-18T03:00:00.000Z');
    expect(zonedDayStartToUtc('2026-11-18', 'UTC')).toBe('2026-11-18T00:00:00.000Z');
  });

  it('respeta los cambios de hora: medianoche inexistente y día con hora repetida', () => {
    // São Paulo, 2018-11-04: a las 00:00 se adelantó a 01:00 (−03 → −02).
    expect(zonedDayStartToUtc('2018-11-04', 'America/Sao_Paulo')).toBe('2018-11-04T03:00:00.000Z');
    // São Paulo, 2019-02-17: a las 00:00 volvió a las 23:00 del 16 (−02 → −03).
    expect(zonedDayStartToUtc('2019-02-16', 'America/Sao_Paulo')).toBe('2019-02-16T02:00:00.000Z');
    expect(zonedDayStartToUtc('2019-02-17', 'America/Sao_Paulo')).toBe('2019-02-17T03:00:00.000Z');
  });

  it('día siguiente y día local de un instante', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(toDateInput('2026-11-18T02:30:00Z')).toBe('2026-11-17');
  });

  it('rechaza días mal formados', () => {
    expect(() => zonedDayStartToUtc('18/11/2026')).toThrow(RangeError);
    expect(() => nextDay('2026-1-1')).toThrow(RangeError);
  });
});
