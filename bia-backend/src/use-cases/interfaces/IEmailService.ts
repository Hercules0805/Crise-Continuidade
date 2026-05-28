export interface IEmailService {
  sendTokenEmail(to: string, subject: string, body: string): Promise<void>;
  sendHtmlReport(to: string, subject: string, html: string): Promise<void>;
  sendNotification(to: string, subject: string, html: string): Promise<void>;
}
