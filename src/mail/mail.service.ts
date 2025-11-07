/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
const PQueue = require('p-queue');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private queue = new PQueue({
    concurrency: 3,
    interval: 1000,
    intervalCap: 10,
  });

  async sendMail(to: string, subject: string, html: string, from?: string) {
    this.logger.verbose(`Enqueuing mail → ${to} | Subject: "${subject}"`);
    return this.queue.add(() => this.runWorker({ to, subject, html, from }));
  }

  private runWorker(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'mail.worker.js');
      const worker = new Worker(workerPath, { workerData: data });

      worker.on('message', (msg) =>
        msg.success ? resolve(msg) : reject(new Error(msg.error)),
      );
      worker.on('error', reject);
      worker.on(
        'exit',
        (code) => code !== 0 && reject(new Error(`Worker exited with ${code}`)),
      );
    });
  }
}
