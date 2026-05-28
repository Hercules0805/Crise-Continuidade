import { GerarTokenAreaUseCase } from '../../../../src/use-cases/token/GerarTokenAreaUseCase';
import { ITokenRepository } from '../../../../src/use-cases/interfaces/ITokenRepository';
import { IEmailService } from '../../../../src/use-cases/interfaces/IEmailService';
import { Token } from '../../../../src/domain/entities';

describe('GerarTokenAreaUseCase', () => {
  let tokenRepository: jest.Mocked<ITokenRepository>;
  let emailService: jest.Mocked<IEmailService>;
  let useCase: GerarTokenAreaUseCase;
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
    useCase = new GerarTokenAreaUseCase(tokenRepository, emailService, tokenBaseUrl);
  });

  it('should generate an area token with tipo=area and processo_id=null', async () => {
    const result = await useCase.execute({
      area_id: 'area-123',
      email: 'user@example.com',
      areaName: 'Financeiro',
    });

    expect(result.success).toBe(true);
    expect(result.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const savedToken = tokenRepository.save.mock.calls[0][0];
    expect(savedToken.tipo).toBe('area');
    expect(savedToken.processo_id).toBeNull();
    expect(savedToken.area_id).toBe('area-123');
    expect(savedToken.usado).toBe(false);
  });

  it('should return the correct area link format', async () => {
    const result = await useCase.execute({
      area_id: 'area-123',
      email: 'user@example.com',
      areaName: 'Financeiro',
    });

    expect(result.link).toBe(`${tokenBaseUrl}/avaliacao-area?token=${result.token}`);
  });

  it('should send an email with area name and 7-day validity', async () => {
    await useCase.execute({
      area_id: 'area-123',
      email: 'user@example.com',
      areaName: 'Financeiro',
    });

    expect(emailService.sendTokenEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = emailService.sendTokenEmail.mock.calls[0];
    expect(to).toBe('user@example.com');
    expect(subject).toContain('Financeiro');
    expect(body).toContain('Financeiro');
    expect(body).toContain('7 dias');
  });

  it('should store token with 7-day expiry', async () => {
    const now = new Date();
    await useCase.execute({
      area_id: 'area-123',
      email: 'user@example.com',
      areaName: 'Financeiro',
    });

    const savedToken = tokenRepository.save.mock.calls[0][0];
    const expectedExpiry = new Date(now);
    expectedExpiry.setDate(expectedExpiry.getDate() + 7);
    const diffMs = Math.abs(savedToken.expires_at.getTime() - expectedExpiry.getTime());
    expect(diffMs).toBeLessThan(5000);
  });
});
