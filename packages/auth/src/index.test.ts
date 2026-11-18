import { describe, expect, it } from 'vitest';
import { isRole } from './index.js';

describe('isRole', () => {
  it('reconoce roles válidos y rechaza otros', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('root')).toBe(false);
  });
});
