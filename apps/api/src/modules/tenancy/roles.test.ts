import { ROLES } from '@zestia/auth';
import { membershipRoleSchema } from '@zestia/contracts';
import { describe, expect, it } from 'vitest';
import { MembershipRole } from '../../generated/prisma/enums';

/** Los roles viven en la DB y en los contratos (de donde los toma `@zestia/auth`): tienen que coincidir. */
describe('roles de membresía', () => {
  it('el enum de la DB coincide con @zestia/auth', () => {
    expect(Object.values(MembershipRole).sort()).toEqual([...ROLES].sort());
  });

  it('los contratos coinciden con @zestia/auth', () => {
    expect([...membershipRoleSchema.options].sort()).toEqual([...ROLES].sort());
  });
});
