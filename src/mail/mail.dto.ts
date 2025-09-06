/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendMailDto {
  @IsEmail({}, { message: 'Recipient email must be a valid email address' })
  to: string;

  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'HTML body is required' })
  html: string;

  @IsOptional()
  @IsEmail({}, { message: 'From must be a valid email address' })
  from?: string;
}
