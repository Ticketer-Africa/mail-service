/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ConsoleLogger, Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: any = null;

  constructor() {}

  private async getQueue() {
    if (this.queue) return this.queue;

    // Dynamic import only once.
    const PQueue = (await import('p-queue')).default;
    this.queue = new PQueue({
      concurrency: 3,
      interval: 1000,
      intervalCap: 10,
    });

    this.logger.log('Mail queue initialized');
    return this.queue;
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    from: string | undefined,
  ) {
    const queue = await this.getQueue();

    return queue.add(() => this.runWorker({ to, subject, html }));
  }

  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js'); // compiled JS

      const worker = new Worker(workerPath, { workerData: data });

      worker.on('message', (msg) => {
        if (msg.success) resolve(msg);
        else reject(new Error(msg.error));
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });
  }
}
