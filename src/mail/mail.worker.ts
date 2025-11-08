/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { parentPort, workerData } from 'worker_threads';
import nodemailer from 'nodemailer';

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
      from: from || `"Ticketer" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });

    parentPort?.postMessage({ success: true, to });
  } catch (err: any) {
    parentPort?.postMessage({
      success: false,
      error: err?.message || 'Unknown error',
      to,
    });
  }
}

sendMail();
