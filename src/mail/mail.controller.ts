/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { SendMailDto } from './mail.dto';

@Controller('mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) {}

  @Post('send')
  async send(@Body() body: SendMailDto) {
    // Extract fields with safe defaults
    const { to, subject, html, from } = body;

    // === Input Validation ===
    if (!to || !subject || !html) {
      this.logger.warn(
        `Invalid mail request: missing required fields | to=${!!to} subject=${!!subject} html=${!!html}`,
      );
      throw new BadRequestException(
        'Missing required fields: to, subject, and html are mandatory.',
      );
    }

    const requestId = this.generateRequestId(); // Optional: for tracing
    this.logger.log(
      `Mail send request received | ID: ${requestId} | To: ${to} | Subject: "${subject}" | From: ${from ?? 'default'}`,
    );

    try {
      const result = await this.mailService.sendMail(to, subject, html, from);

      this.logger.log(
        `Mail enqueued successfully | ID: ${requestId} | To: ${to} | MessageId: ${result.messageId ?? 'N/A'}`,
      );

      return {
        success: true,
        message: 'Mail queued successfully',
        requestId,
        messageId: result.messageId ?? null,
      };
    } catch (error) {
      // Distinguish between known (e.g. rate limit, worker crash) and unexpected errors
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to enqueue mail | ID: ${requestId} | To: ${to} | Error: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Don't leak internal details to client
      throw new InternalServerErrorException(
        'Failed to send mail. Please try again later.',
      );
    }
  }

  /** Generate a short unique ID for tracing (optional but helpful) */
  private generateRequestId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
  }
}
