/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, ConsoleLogger } from '@nestjs/common';
import BetterQueue from 'better-queue';
import * as path from 'path';
import { Worker } from 'worker_threads';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: BetterQueue | null = null;

  constructor() {}

  private initQueue() {
    if (this.queue) return this.queue;

    try {
      this.logger.log('Initializing mail queue...');

      // Use BetterQueue with worker
      const workerFile = path.resolve(
        __dirname,
        process.env.NODE_ENV === 'production'
          ? 'mail.worker.js'
          : 'mail.worker.ts',
      );

      this.queue = new BetterQueue(
        async (task: any, cb: Function) => {
          this.logger.log(`Processing mail task for ${task.to}`);

          const isDev = process.env.NODE_ENV !== 'production';

          try {
            const worker = new Worker(
              isDev
                ? `require('ts-node').register(); require('${workerFile}')`
                : workerFile,
              isDev ? { eval: true, workerData: task } : { workerData: task },
            );

            worker.on('message', (msg) => {
              if (msg.success) {
                this.logger.log(`Mail sent successfully → ${msg.to}`);
                cb(null, msg);
              } else {
                this.logger.error(
                  `Failed to send mail to ${msg.to} | ${msg.error}`,
                );
                cb(new Error(msg.error));
              }
            });

            worker.on('error', (err) => {
              this.logger.error(
                `Worker error sending mail to ${task.to} | ${err.message}`,
              );
              cb(err);
            });

            worker.on('exit', (code) => {
              if (code !== 0) {
                const msg = `Worker exited with code ${code}`;
                this.logger.error(msg);
                cb(new Error(msg));
              }
            });
          } catch (err: any) {
            this.logger.error(
              `Failed to spawn worker for ${task.to} | ${err.message}`,
            );
            cb(err);
          }
        },
        {
          concurrent: 3, // concurrent mails
          maxRetries: 2,
          retryDelay: 1000,
        },
      );

      this.logger.log('Mail queue initialized');
      return this.queue;
    } catch (err: any) {
      this.logger.error(`Fatal error initializing queue | ${err.message}`);
      throw err;
    }
  }

  async sendMail(to: string, subject: string, html: string, from?: string) {
    const queue = this.initQueue();

    this.logger.verbose(
      `Enqueuing mail for ${to} | Subject: ${subject} | From: ${from || 'default'}`,
    );

    return new Promise((resolve, reject) => {
      queue.push({ to, subject, html, from }, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
}
