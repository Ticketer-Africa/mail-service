/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';

// Cache the PQueue class
let PQueuePromise: Promise<any> | null = null;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private queue: any | null = null;
  private queueInitPromise: Promise<void> | null = null;

  constructor() {
    // Constructor stays sync – lazy init on first use
  }

  /** Ensure the PQueue instance is ready */
  private async ensureQueue(): Promise<any> {
    if (this.queue) {
      this.logger.debug('Queue already initialized – reusing instance');
      return this.queue;
    }

    if (this.queueInitPromise) {
      this.logger.verbose('Queue initialization in progress – awaiting');
      await this.queueInitPromise;
      return this.queue!;
    }

    this.logger.log('Starting mail queue initialization');
    this.queueInitPromise = this.initQueue();
    await this.queueInitPromise;
    this.logger.log('Mail queue initialized successfully');
    return this.queue!;
  }

  /** Dynamically import p-queue and create the throttled queue */
  private async initQueue(): Promise<void> {
    try {
      if (!PQueuePromise) {
        this.logger.verbose('Loading p-queue module');
        PQueuePromise = import('p-queue').then((mod) => mod.default);
      }

      const PQueue = await PQueuePromise;

      this.queue = new PQueue({
        concurrency: 3,
        interval: 1000,
        intervalCap: 10,
      });

      this.logger.log('Mail queue initialized with concurrency=3, rate=10/sec');
    } catch (err) {
      this.logger.error(
        'Failed to initialize mail queue',
        (err as Error).stack,
      );
      throw err; // re-throw so callers can handle the failure
    }
  }

  /** Public API – enqueue a mail send */
  async sendMail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<any> {
    this.logger.verbose(
      `Enqueuing mail → ${to} | Subject: "${subject}" | From: ${from ?? 'default'}`,
    );

    const queue = await this.ensureQueue();

    // Wrap the worker call so we can log enqueue success/failure
    return queue.add(async () => {
      this.logger.debug(`Dequeued mail job for ${to}`);
      return this.runWorker({ to, subject, html, from });
    });
  }

  /** Spawn a worker thread that actually sends the e-mail */
  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const isDev = process.env.NODE_ENV !== 'production';
      let workerPath: string;

      if (isDev) {
        // Dev: point to TS file and eval with ts-node
        workerPath = path.resolve(__dirname, 'mail.worker.ts');
      } else {
        // Prod: compiled JS
        workerPath = path.resolve(__dirname, 'mail.worker.js');
      }

      this.logger.debug(`Spawning worker for ${data.to} at ${workerPath}`);

      const worker = new Worker(
        isDev
          ? `
        require('ts-node').register();
        require('${workerPath}');
      `
          : workerPath,
        isDev ? { eval: true, workerData: data } : { workerData: data },
      );

      const cleanup = () => {
        worker.removeAllListeners();
      };

      worker.on('message', (msg: any) => {
        cleanup();
        if (msg.success) resolve(msg);
        else reject(new Error(msg.error ?? 'Unknown error'));
      });

      worker.on('error', (err) => {
        cleanup();
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });
  }
}
