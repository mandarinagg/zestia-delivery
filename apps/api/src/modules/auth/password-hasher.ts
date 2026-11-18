import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  assertArgon2Available,
  hashPassword,
  needsRehash,
  parsePasswordHash,
  verifyPassword,
} from './password-hashing';

/**
 * Hash/verificación de contraseñas con tiempo parejo: si no hay hash (email desconocido,
 * usuario sin contraseña) se verifica igual contra un hash señuelo con los mismos parámetros,
 * para que el tiempo de respuesta no revele si la cuenta existe.
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private dummyHash: Promise<string> | null = null;

  onModuleInit(): void {
    assertArgon2Available();
    this.dummy();
  }

  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  needsRehash(hash: string): boolean {
    return needsRehash(hash);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (hash === null || parsePasswordHash(hash) === null) {
      await verifyPassword(await this.dummy(), password);
      return false;
    }
    return verifyPassword(hash, password);
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
    return this.dummyHash;
  }
}
