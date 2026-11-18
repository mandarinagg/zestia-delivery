import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Infraestructura de persistencia. El acceso a datos de negocio va por `TenantDb` (tenancy). */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
