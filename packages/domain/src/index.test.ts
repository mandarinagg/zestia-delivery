import { describe, expect, it } from 'vitest';
import { isValidAmount } from './index.js';

describe('isValidAmount', () => {
  it('acepta enteros no negativos', () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(15000)).toBe(true);
  });
  it('rechaza decimales y negativos', () => {
    expect(isValidAmount(10.5)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
  });
});
