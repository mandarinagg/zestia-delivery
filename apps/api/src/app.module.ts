import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { buildLoggerParams } from './logging/logger.config';
import { AuditModule } from './modules/audit';
import { AuthModule } from './modules/auth';
import { MembersModule } from './modules/members';
import { MerchantsModule } from './modules/merchants';
import { TenancyModule } from './modules/tenancy';

// Los módulos de negocio viven en src/modules/<nombre>/ (ver README, "Límites de módulos").
@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => buildLoggerParams(env),
    }),
    DatabaseModule,
    TenancyModule,
    // Registra PRINCIPAL_RESOLVER (sesión por cookie) y la protección CSRF global.
    AuthModule,
    AuditModule,
    MerchantsModule,
    MembersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
