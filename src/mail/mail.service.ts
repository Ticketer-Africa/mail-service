/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private queue: any;

  constructor() {
    (async () => {
      const { default: PQueue } = await import('p-queue');
      this.queue = new PQueue({
        concurrency: 3,
        interval: 1000,
        intervalCap: 10,
      });
    })();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendMail(to: string, subject: string, html: string, from?: string) {
    if (!this.queue) {
      // fallback until queue is ready
      throw new Error('Queue not initialized yet');
    }
    return this.queue.add(() => this.runWorker({ to, subject, html, from }));
  }

  private runWorker(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.resolve(__dirname, 'mail.worker.js'), {
        workerData: data,
      });

      worker.on('message', (msg) => {
        if (msg.success) {
          this.logger.log(`✅ Mail sent to ${msg.to}`);
          resolve(msg);
        } else {
          this.logger.error(`❌ Failed mail to ${msg.to}`, msg.error);
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        this.logger.error(`Worker crashed`, err.message);
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          this.logger.error(`Worker stopped with code ${code}`);
        }
      });
    });
  }
}
