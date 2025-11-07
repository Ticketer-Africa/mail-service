/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
// import { WinstonModule } from 'nest-winston';   // <-- uncomment if you want Winston

/** ------------------------------------------------------------------
 *  1. Custom Nest logger (pino-style JSON in prod, pretty in dev)
 * ------------------------------------------------------------------ */
class NestLogger extends Logger {
  private readonly isProd = process.env.NODE_ENV === 'production';

  private format(...args: any[]) {
    return this.isProd ? JSON.stringify(args) : args;
  }

  log(message: any, context?: string) {
    super.log(this.format(message), context);
  }
  error(message: any, trace?: string, context?: string) {
    super.error(this.format(message), trace, context);
  }
  warn(message: any, context?: string) {
    super.warn(this.format(message), context);
  }
  debug(message: any, context?: string) {
    super.debug(this.format(message), context);
  }
  verbose(message: any, context?: string) {
    super.verbose(this.format(message), context);
  }
}

/** ------------------------------------------------------------------
 *  2. Middleware that logs every request/response
 * ------------------------------------------------------------------ */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new NestLogger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { ip, method, originalUrl } = req;
    const userAgent = req.get('user-agent') ?? '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const duration = Date.now() - start;

      this.logger.log({
        ip,
        method,
        url: originalUrl,
        status: statusCode,
        durationMs: duration,
        contentLength,
        userAgent,
      });
    });

    next();
  }
}

/** ------------------------------------------------------------------
 *  3. App factory – creates the Nest application once
 * ------------------------------------------------------------------ */
let readyHandler: any = null;
const globalLogger = new NestLogger('Bootstrap');

async function createApp() {
  // ----------------------------------------------------------------
  // Choose adapter: Express (default) or Fastify (uncomment below)
  // ----------------------------------------------------------------
  const app = await NestFactory.create(AppModule, {
    // logger: WinstonModule.createLogger({ ... }) // <-- Winston example
    logger: globalLogger,
    // httpAdapter: new FastifyAdapter(), // <-- uncomment for Fastify
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Register the request-logging middleware globally
  app.use(LoggerMiddleware);

  await app.init();

  // ----------------------------------------------------------------
  // Extract the underlying HTTP server (Express or Fastify instance)
  // ----------------------------------------------------------------
  const httpAdapter = app.getHttpAdapter();
  const server = httpAdapter.getInstance();

  globalLogger.log('Nest application successfully created & initialized');
  return server;
}

/** ------------------------------------------------------------------
 *  4. Serverless handler (Vercel, Netlify, AWS Lambda, …)
 * ------------------------------------------------------------------ */
export default async function handler(req: any, res: any) {
  try {
    if (!readyHandler) {
      globalLogger.log('First request → bootstrapping Nest…');
      readyHandler = await createApp();
    }
    return readyHandler(req, res);
  } catch (err) {
    // Global unhandled errors → structured JSON + stack in dev
    const logger = new NestLogger('HandlerError');
    logger.error({
      message: (err as Error).message,
      stack: (err as Error).stack,
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        details:
          process.env.NODE_ENV === 'development'
            ? (err as Error).message
            : undefined,
      });
    }
  }
}
