/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

let readyHandler: any = null;

async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });

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

  // Extract the underlying Express app
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp;
}

export default async function handler(req: any, res: any) {
  if (!readyHandler) {
    readyHandler = await createApp();
  }
  return readyHandler(req, res);
}
