import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { configureHttpApp } from './http/configure-app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureHttpApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
