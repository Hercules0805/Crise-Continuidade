import { GerarTokenUseCase } from '../../../../src/use-cases/token/GerarTokenUseCase';
import { ITokenRepository } from '../../../../src/use-cases/interfaces/ITokenRepository';
import { IEmailService } from '../../../../src/use-cases/interfaces/IEmailService';
import { Token } from '../../../../src/domain/entities';

describe('GerarTokenUseCase', () => {
  let tokenRepository: jest.Mocked<ITokenRepository>;
  let emailService: jest.Mocked<IEmailService>;
  let useCase: GerarTokenUseCase;
  const tokenBaseUrl = 'https://bia-forte-2025.web.app';

  beforeEach(() => {
    tokenRepository = {
      findByToken: jest.fn(),
      save: jest.fn().mockImplementation((token: Token) => Promise.resolve(token)),
      markAsUsed: jest.fn(),
    };
    emailService = {
      sendTokenEmail: jest.fn().mockResolvedValue(undefined),
      sendHtmlReport: jest.fn(),
      sendNotification: jest.fn(),
    };
    useCase = new GerarTokenUseCase(tokenRepository, emailService, tokenBaseUrl);
  });

  it('should generate a UUID token and store it with 7-day expiry', async () => {
    const now = new Date();
    const result = await useCase.execute({
      area_id: 'area-123',
      processo_id: 'proc-456',
      email: 'user@example.com',
      areaName: 'TI',
      processoName: 'Backup',
    });

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const savedToken = tokenRepository.save.mock.calls[0][0];
    expect(savedToken.area_id).toBe('area-123');
    expect(savedToken.processo_id).toBe('proc-456');
    expect(savedToken.email).toBe('user@example.com');
    expect(savedToken.tipo).toBe('processo');
    expect(savedToken.usado).toBe(false);

    const expectedExpiry = new Date(now);
    expectedExpiry.setDate(expectedExpiry.getDate() + 7);
    const diffMs = Math.abs(savedToken.expires_at.getTime() - expectedExpiry.getTime());
    expect(diffMs).toBeLessThan(5000); // within 5 seconds tolerance
  });

  it('should return the correct link format', async () => {
    const result = await useCase.execute({
      area_id: 'area-123',
      processo_id: 'proc-456',
      email: 'user@example.com',
      areaName: 'TI',
      processoName: 'Backup',
    });

    expect(result.link).toBe(`${tokenBaseUrl}/avaliacao?token=${result.token}`);
  });

  it('should send an email with area name, process name, and 7-day validity', async () => {
    await useCase.execute({
      area_id: 'area-123',
      processo_id: 'proc-456',
      email: 'user@example.com',
      areaName: 'TI',
      processoName: 'Backup',
    });

    expect(emailService.sendTokenEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = emailService.sendTokenEmail.mock.calls[0];
    expect(to).toBe('user@example.com');
    expect(subject).toContain('TI');
    expect(subject).toContain('Backup');
    expect(body).toContain('Backup');
    expect(body).toContain('TI');
    expect(body).toContain('7 dias');
  });
});
