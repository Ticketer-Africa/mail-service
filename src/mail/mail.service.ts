/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: Transporter;
  private logger = new Logger(MailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendMail(to: string, subject: string, html: string, from?: string) {
    const mailOptions = {
      from: from || `"Ticketer" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Mail sent to ${to} | Subject: ${subject}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`❌ Failed to send mail to ${to}`, error.message);
      } else {
        this.logger.error(
          `❌ Failed to send mail to ${to}`,
          JSON.stringify(error),
        );
      }
      throw error;
    }
  }
}
