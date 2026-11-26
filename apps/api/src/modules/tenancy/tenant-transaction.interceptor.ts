import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  InternalServerErrorException,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, from, lastValueFrom } from 'rxjs';
import { TenantDb } from './tenant-db';
import { getRequestTenantContext } from './tenant-request';

/**
 * Ejecuta el handler dentro de `TenantDb.run(...)`: una transacción por request con
 * `app.tenant_id` fijado. Si el handler falla, la transacción hace ROLLBACK.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly db: TenantDb) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenant = getRequestTenantContext(context.switchToHttp().getRequest<object>());
    // Sin contexto = el guard no corrió (mala configuración). Fail-closed.
    if (!tenant) throw new InternalServerErrorException();
    return from(
      this.db.run(tenant, () => lastValueFrom(next.handle(), { defaultValue: undefined })),
    );
  }
}
