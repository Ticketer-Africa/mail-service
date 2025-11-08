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
import * as SQLiteStore from 'better-queue-sqlite';
import * as path from 'path';
import { Worker } from 'worker_threads';

// Define the MailTask interface for type safety
interface MailTask {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: BetterQueue<MailTask> | null = null;

  constructor() {}

  private initQueue() {
    if (this.queue) return this.queue;

    try {
      this.logger.log('Initializing mail queue...');

      const workerFile = path.resolve(
        __dirname,
        process.env.NODE_ENV === 'production'
          ? 'mail.worker.js'
          : 'mail.worker.ts',
      );

      this.queue = new BetterQueue<MailTask>(
        async (
          task: MailTask,
          cb: (error: Error | null, result?: any) => void,
        ) => {
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
          store: new SQLiteStore({
            path: path.resolve(__dirname, 'queue.db'), // SQLite database file
          }),
          concurrent: 3, // Process up to 3 emails concurrently
          maxRetries: 2, // Retry failed tasks twice
          retryDelay: 1000, // Wait 1 second between retries
        },
      );

      // Add queue event listeners for monitoring
      this.queue.on('task_finish', (taskId, result) => {
        this.logger.log(`Task ${taskId} completed: ${JSON.stringify(result)}`);
      });

      this.queue.on('task_failed', (taskId, err) => {
        this.logger.error(`Task ${taskId} failed: ${err.message}`);
      });

      this.logger.log('Mail queue initialized with SQLite store');
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
