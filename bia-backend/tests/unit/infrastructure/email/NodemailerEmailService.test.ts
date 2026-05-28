import nodemailer from 'nodemailer';

jest.mock('nodemailer');
jest.mock('../../../../src/infrastructure/config/env', () => ({
  env: {
    smtpHost: 'smtp.test.com',
    smtpPort: 587,
    smtpUser: 'test@test.com',
    smtpPass: 'testpass',
  },
}));

import { NodemailerEmailService } from '../../../../src/infrastructure/email/NodemailerEmailService';

describe('NodemailerEmailService', () => {
  let service: NodemailerEmailService;
  let mockSendMail: jest.Mock;

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });
    service = new NodemailerEmailService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create transporter with correct SMTP config', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'testpass',
        },
      });
    });

    it('should set secure to true when port is 465', () => {
      // Clear previous calls
      (nodemailer.createTransport as jest.Mock).mockClear();

      // Override env temporarily
      const envModule = require('../../../../src/infrastructure/config/env');
      const originalPort = envModule.env.smtpPort;
      envModule.env.smtpPort = 465;

      new NodemailerEmailService();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, port: 465 })
      );

      // Restore
      envModule.env.smtpPort = originalPort;
    });
  });

  describe('sendTokenEmail', () => {
    it('should send email with correct parameters', async () => {
      await service.sendTokenEmail('user@example.com', 'Token Subject', '<p>Token body</p>');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'test@test.com',
        to: 'user@example.com',
        subject: 'Token Subject',
        html: '<p>Token body</p>',
      });
    });

    it('should propagate errors from transporter', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

      await expect(
        service.sendTokenEmail('user@example.com', 'Subject', 'Body')
      ).rejects.toThrow('SMTP connection failed');
    });
  });

  describe('sendHtmlReport', () => {
    it('should send HTML report email with correct parameters', async () => {
      const html = '<h1>Report</h1><table><tr><td>Data</td></tr></table>';

      await service.sendHtmlReport('admin@example.com', 'Report Subject', html);

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'test@test.com',
        to: 'admin@example.com',
        subject: 'Report Subject',
        html,
      });
    });
  });

  describe('sendNotification', () => {
    it('should send notification email with correct parameters', async () => {
      const html = '<p>Evaluation completed for Process X</p>';

      await service.sendNotification('notify@example.com', 'Notification', html);

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'test@test.com',
        to: 'notify@example.com',
        subject: 'Notification',
        html,
      });
    });
  });
});
