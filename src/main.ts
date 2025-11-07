/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';

let readyHandler: any = null;
const logger = new Logger('Bootstrap');

async function createApp() {
  logger.log('Creating Nest application...');

  const app = await NestFactory.create(AppModule, {
    logger: new Logger('Nest'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();

  logger.log('Nest application successfully initialized');

  return expressApp;
}

export default async function handler(req: any, res: any) {
  try {
    if (!readyHandler) {
      logger.log('First request - bootstrapping Nest app...');
      readyHandler = await createApp();
    }

    logger.verbose(`Handling ${req.method} ${req.originalUrl || req.url}`);
    return readyHandler(req, res);
  } catch (error) {
    logger.error(
      'Unhandled error in serverless handler',
      (error as Error).stack,
    );
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
