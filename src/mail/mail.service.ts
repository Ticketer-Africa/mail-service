/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, ConsoleLogger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

interface MailTask {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Use Gmail SMTP - more reliable than OAuth2 in serverless
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // Use app password, not regular password
      },
      // Timeout settings for serverless
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Mail transporter verification failed:', error);
      } else {
        this.logger.log('Mail transporter ready');
      }
    });
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<void> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: from || `"Ticketer" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    };

    try {
      this.logger.log(`Sending mail to ${to}`);

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Mail sent successfully to ${to} - Message ID: ${result.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send mail to ${to}:`, error);
      throw new Error(`Mail sending failed: ${error.message}`);
    }
  }

  // For high-volume scenarios, use a cloud-based queue service
  async sendMailWithRetry(
    to: string,
    subject: string,
    html: string,
    from?: string,
    maxRetries = 3,
  ): Promise<void> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sendMail(to, subject, html, from);
        return; // Success - exit function
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Mail send attempt ${attempt}/${maxRetries} failed for ${to}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }
  }
}
