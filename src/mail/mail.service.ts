/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { ConsoleLogger, Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: any = null;

  constructor() {}

  /** Lazy-load queue and log */
  private async getQueue() {
    if (this.queue) {
      this.logger.debug('Reusing existing mail queue instance');
      return this.queue;
    }

    this.logger.log('Initializing mail queue...');
    const PQueue = (await import('p-queue')).default;

    this.queue = new PQueue({
      concurrency: 3,
      interval: 1000,
      intervalCap: 10,
    });

    this.logger.log('Mail queue initialized with concurrency=3, rate=10/sec');
    return this.queue;
  }

  /** Enqueue a mail job */
  async sendMail(to: string, subject: string, html: string, from?: string) {
    const queue = await this.getQueue();

    this.logger.verbose(
      `Enqueuing mail → ${to} | Subject: "${subject}" | From: ${from ?? 'default'}`,
    );

    return queue.add(() => this.runWorker({ to, subject, html, from }));
  }

  /** Worker thread for sending email */
  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js'); // compiled JS
      this.logger.debug(`Spawning worker for ${data.to} → ${workerPath}`);

      const worker = new Worker(workerPath, { workerData: data });

      worker.on('message', (msg) => {
        if (msg.success) {
          this.logger.log(`Mail successfully sent to ${msg.to}`);
          resolve(msg);
        } else {
          this.logger.error(`Mail failed for ${msg.to}: ${msg.error}`);
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        this.logger.error(`Worker error: ${err.message}`);
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          const msg = `Worker exited with code ${code}`;
          this.logger.error(msg);
          reject(new Error(msg));
        } else {
          this.logger.debug(`Worker for ${data.to} exited successfully`);
        }
      });
    });
  }
}
