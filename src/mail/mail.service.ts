/* eslint-disable */
import { Injectable, Logger } from '@nestjs/common';
import PQueue from 'p-queue';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly queue: PQueue;

  private readonly transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  constructor() {
    this.queue = new PQueue({
      concurrency: 3,
      interval: 1000,
      intervalCap: 10,
    });
  }

  async sendMail(to: string, subject: string, html: string, from?: string) {
    return this.queue.add(async () => {
      try {
        const info = await this.transporter.sendMail({
          from: from || process.env.SMTP_USER,
          to,
          subject,
          html,
        });
        this.logger.log(`✅ Mail sent to ${to}`);
        return info;
      } catch (err) {
        this.logger.error(`❌ Failed mail to ${to}`, err.message);
        throw err;
      }
    });
  }
}
