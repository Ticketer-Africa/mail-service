/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import path from 'path';

// Cache the PQueue class
let PQueuePromise: Promise<any> | null = null;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private queue: any | null = null;
  private queueInitPromise: Promise<void> | null = null;

  constructor() {
    // Don't await here — constructor can't be async
    // We'll lazy-init on first use
  }

  private async ensureQueue(): Promise<any> {
    if (this.queue) return this.queue;

    if (this.queueInitPromise) {
      await this.queueInitPromise; // Wait if already initializing
      return this.queue!;
    }

    this.queueInitPromise = this.initQueue();
    await this.queueInitPromise;
    return this.queue!;
  }

  private async initQueue(): Promise<void> {
    if (!PQueuePromise) {
      PQueuePromise = import('p-queue').then((mod) => mod.default);
    }

    const PQueue = await PQueuePromise;

    this.queue = new PQueue({
      concurrency: 3,
      interval: 1000,
      intervalCap: 10,
    });

    this.logger.log('Mail queue initialized with concurrency=3, rate=10/sec');
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<any> {
    const queue = await this.ensureQueue(); // Safe: always returns initialized queue
    return queue.add(() => this.runWorker({ to, subject, html, from }));
  }

  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js');
      const worker = new Worker(workerPath, { workerData: data });

      const cleanup = () => {
        worker.removeAllListeners();
      };

      worker.on('message', (msg: any) => {
        cleanup();
        if (msg.success) {
          this.logger.log(`Mail sent to ${msg.to}`);
          resolve(msg);
        } else {
          this.logger.error(`Failed mail to ${msg.to}`, msg.error);
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err: Error) => {
        cleanup();
        this.logger.error('Worker error', err);
        reject(err);
      });

      worker.on('exit', (code: number) => {
        if (code !== 0) {
          const err = new Error(`Worker exited with code ${code}`);
          this.logger.error('Worker exited abnormally', err);
          // Only reject if not already resolved/rejected
          if (
            !worker.listenerCount('message') &&
            !worker.listenerCount('error')
          ) {
            reject(err);
          }
        }
      });
    });
  }
}
