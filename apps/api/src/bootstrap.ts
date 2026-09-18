import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ENV, type Env } from './config/env';
import { ErrorFilter } from './common/error.filter';
import { requestId } from './common/request-id';

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

/** Costruisce l'app, usata da main.ts e dai test end-to-end. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  const env = app.get<Env>(ENV);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.use(requestId);
  app.use(securityHeaders);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['x-request-id'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
