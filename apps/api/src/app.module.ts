import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { buildLoggerParams } from './logging/logger.config';
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
    MerchantsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
