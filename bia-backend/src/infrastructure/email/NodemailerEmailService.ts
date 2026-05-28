import nodemailer from 'nodemailer';
import { IEmailService } from '../../use-cases/interfaces/IEmailService';
import { env } from '../config/env';

export class NodemailerEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  }

  async sendTokenEmail(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.smtpUser,
      to,
      subject,
      html: body,
    });
  }

  async sendHtmlReport(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.smtpUser,
      to,
      subject,
      html,
    });
  }

  async sendNotification(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.smtpUser,
      to,
      subject,
      html,
    });
  }
}
