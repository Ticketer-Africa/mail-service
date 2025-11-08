/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, ConsoleLogger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import Queue from 'better-queue';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: Queue | null = null;

  constructor() {
    this.initQueue();
  }

  private initQueue() {
    if (this.queue) return;

    this.logger.log('Initializing mail queue...');
    this.queue = new Queue(
      async (task: {
        to: string;
        subject: string;
        html: string;
        from?: string;
      }) => {
        this.logger.debug(`Processing mail task for ${task.to}`);
        try {
          const result = await this.runWorker(task);
          this.logger.log(`Mail sent successfully to ${task.to}`);
          return result;
        } catch (err: any) {
          this.logger.error(
            `Failed to send mail to ${task.to}: ${err.message}`,
          );
          throw err;
        }
      },
      {
        concurrent: 3, // Number of concurrent mail sends
        maxRetries: 2, // Retry failed jobs
        retryDelay: 1000, // 1 second before retry
        afterProcessDelay: 500, // slight delay between jobs
      },
    );

    this.queue.on('task_failed', (task, err) => {
      this.logger.error(`Task failed for ${task.to}: ${err.message}`);
    });

    this.queue.on('task_finish', (task, _) => {
      this.logger.debug(`Task finished for ${task.to}`);
    });

    this.logger.log('Mail queue initialized successfully');
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<any> {
    if (!this.queue) this.initQueue();

    this.logger.verbose(`Enqueuing mail for ${to} | Subject: ${subject}`);
    return new Promise((resolve, reject) => {
      this.queue?.push({ to, subject, html, from }, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js');

      this.logger.debug(`Spawning worker for ${data.to}`);
      const worker = new Worker(workerPath, { workerData: data });

      worker.on('message', (msg) => {
        if (msg.success) resolve(msg);
        else reject(new Error(msg.error));
      });

      worker.on('error', (err) => reject(err));
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });
  }
}
