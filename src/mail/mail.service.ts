/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ConsoleLogger, Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: any = null;

  constructor() {}

  /** Lazy-load queue */
  private async getQueue() {
    if (this.queue) {
      this.logger.debug('Queue already exists – reusing it');
      return this.queue;
    }

    this.logger.log('Initializing mail queue...');
    try {
      const PQueue = (await import('p-queue')).default;

      this.queue = new PQueue({
        concurrency: 3,
        interval: 1000,
        intervalCap: 10,
      });

      this.logger.log('Mail queue initialized successfully');
    } catch (err: any) {
      this.logger.error('Failed to import or initialize PQueue', err.stack);
      throw err;
    }

    return this.queue;
  }

  /** Enqueue mail */
  async sendMail(to: string, subject: string, html: string, from?: string) {
    const queue = await this.getQueue();

    this.logger.verbose(
      `Enqueuing mail: to=${to}, subject="${subject}", from=${from ?? 'default'}`,
    );

    return queue.add(async () => {
      this.logger.debug(`Dequeued mail job for ${to}`);
      try {
        const result = await this.runWorker({ to, subject, html, from });
        this.logger.log(`Mail successfully sent to ${to}`);
        return result;
      } catch (err: any) {
        this.logger.error(`Mail job failed for ${to}: ${err.message}`);
        this.logger.debug(err.stack); // step-by-step failure trace
        throw err; // propagate to queue
      }
    });
  }

  /** Worker thread */
  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js');
      this.logger.debug(`Spawning worker for ${data.to} → ${workerPath}`);

      const worker = new Worker(workerPath, { workerData: data });

      worker.on('message', (msg) => {
        if (msg.success) {
          this.logger.debug(`Worker completed successfully for ${data.to}`);
          resolve(msg);
        } else {
          this.logger.error(
            `Worker reported failure for ${data.to}: ${msg.error}`,
          );
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        this.logger.error(`Worker thread error for ${data.to}: ${err.message}`);
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          const msg = `Worker exited with code ${code} for ${data.to}`;
          this.logger.error(msg);
          reject(new Error(msg));
        } else {
          this.logger.debug(`Worker exited normally for ${data.to}`);
        }
      });
    });
  }
}
