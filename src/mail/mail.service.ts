/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, ConsoleLogger, OnModuleDestroy } from '@nestjs/common';
import BetterQueue from 'better-queue';
import * as path from 'path';
import { Worker } from 'worker_threads';

// Import SQLiteStore as a CommonJS module
const SQLiteStore = require('better-queue-sqlite');

// Define the MailTask interface for type safety
interface MailTask {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new ConsoleLogger(MailService.name);
  private queue: BetterQueue<MailTask> | null = null;
  private queueInitializing = false;
  private readonly activeWorkers = new Set<Worker>();

  constructor() {}

  onModuleDestroy() {
    // Clean up queue and active workers on shutdown
    if (this.queue) {
      this.queue.destroy();
      this.queue = null;
    }

    // Terminate any remaining workers
    this.activeWorkers.forEach((worker) => {
      worker.terminate();
    });
    this.activeWorkers.clear();
  }

  private async initQueue(): Promise<BetterQueue<MailTask>> {
    if (this.queue) return this.queue;

    // Prevent race condition on concurrent initialization
    if (this.queueInitializing) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.queue) {
            clearInterval(checkInterval);
            resolve(this.queue);
          }
        }, 50);
      });
    }

    this.queueInitializing = true;

    try {
      this.logger.log('Initializing mail queue...');

      // Inline worker code
      const workerCode = `
        const { parentPort, workerData } = require('worker_threads');
        const nodemailer = require('nodemailer');

        async function sendMail() {
          const { to, subject, html, from } = workerData;

          try {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
              },
            });

            await transporter.sendMail({
              from: from || \`"Ticketer" <\${process.env.MAIL_USER}>\`,
              to,
              subject,
              html,
            });

            parentPort.postMessage({ success: true, to });
          } catch (err) {
            parentPort.postMessage({
              success: false,
              error: err.message || 'Unknown error',
              to,
            });
          }
        }

        sendMail();
      `;

      this.queue = new BetterQueue<MailTask>(
        (task: MailTask, cb: (error: Error | null, result?: any) => void) => {
          this.logger.log(`Processing mail task for ${task.to}`);

          let worker: Worker | null = null;

          try {
            // Create worker with inline code
            worker = new Worker(workerCode, {
              eval: true,
              workerData: task,
            });

            this.logger.log(`Worker created for ${task.to}`);

            this.activeWorkers.add(worker);

            // Set timeout for worker execution
            const timeout = setTimeout(() => {
              worker?.terminate();
              this.activeWorkers.delete(worker!);
              cb(new Error(`Worker timeout for ${task.to}`));
            }, 30000); // 30 second timeout

            worker.on('message', (msg) => {
              clearTimeout(timeout);
              this.activeWorkers.delete(worker!);

              if (msg.success) {
                this.logger.log(`Mail sent successfully → ${msg.to}`);
                worker?.terminate();
                cb(null, msg);
              } else {
                this.logger.error(
                  `Failed to send mail to ${msg.to} | ${msg.error}`,
                );
                worker?.terminate();
                cb(new Error(msg.error));
              }
            });

            worker.on('error', (err) => {
              clearTimeout(timeout);
              this.activeWorkers.delete(worker!);
              this.logger.error(
                `Worker error sending mail to ${task.to} | ${err.message}`,
              );
              cb(err);
              worker?.terminate();
            });

            worker.on('exit', (code) => {
              clearTimeout(timeout);
              this.activeWorkers.delete(worker!);

              if (code !== 0) {
                const msg = `Worker exited with code ${code}`;
                this.logger.error(msg);
                if (!cb.toString().includes('called')) {
                  cb(new Error(msg));
                }
              }
            });
          } catch (err: any) {
            if (worker) {
              this.activeWorkers.delete(worker);
            }
            this.logger.error(
              `Failed to spawn worker for ${task.to} | ${err.message}`,
            );
            cb(err);
          }
        },
        {
          // Temporarily remove SQLite store to test
          // store: new SQLiteStore({
          //   path: path.resolve(__dirname, '../../queue.db'),
          // }),
          concurrent: 3,
          maxRetries: 2,
          retryDelay: 1000,
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
      this.queueInitializing = false;
      return this.queue;
    } catch (err: any) {
      this.queueInitializing = false;
      this.logger.error(`Fatal error initializing queue | ${err.message}`);
      throw err;
    }
  }

  async sendMail(to: string, subject: string, html: string, from?: string) {
    const queue = await this.initQueue();

    this.logger.verbose(
      `Enqueuing mail for ${to} | Subject: ${subject} | From: ${from || 'default'}`,
    );

    return new Promise((resolve, reject) => {
      this.logger.log(`Pushing task to queue for ${to}`);

      queue.push({ to, subject, html, from }, (err: any, result: any) => {
        this.logger.log(`Queue callback triggered for ${to}`);
        if (err) {
          this.logger.error(`Queue push failed: ${err.message}`);
          reject(err);
        } else {
          this.logger.log(`Queue push successful for ${to}`);
          resolve(result);
        }
      });

      this.logger.log(`Task pushed, waiting for callback...`);
    });
  }

  // Utility method to check queue status
  getQueueStatus() {
    return {
      initialized: !!this.queue,
      activeWorkers: this.activeWorkers.size,
    };
  }
}
