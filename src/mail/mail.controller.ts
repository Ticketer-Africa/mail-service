import { Controller, Post, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { SendMailDto } from './mail.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  async send(@Body() body: SendMailDto) {
    await this.mailService.sendMail(
      body.to,
      body.subject,
      body.html,
      body.from,
    );
    return { success: true };
  }
}
