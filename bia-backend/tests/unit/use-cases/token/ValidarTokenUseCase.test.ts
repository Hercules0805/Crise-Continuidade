import { ValidarTokenUseCase } from '../../../../src/use-cases/token/ValidarTokenUseCase';
import { ITokenRepository } from '../../../../src/use-cases/interfaces/ITokenRepository';
import { Token } from '../../../../src/domain/entities';

describe('ValidarTokenUseCase', () => {
  let tokenRepository: jest.Mocked<ITokenRepository>;
  let useCase: ValidarTokenUseCase;

  beforeEach(() => {
    tokenRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      markAsUsed: jest.fn(),
    };
    useCase = new ValidarTokenUseCase(tokenRepository);
  });

  function makeToken(overrides: Partial<Token> = {}): Token {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    return {
      id: 'token-123',
      area_id: 'area-1',
      processo_id: 'proc-1',
      email: 'user@example.com',
      tipo: 'processo',
      usado: false,
      expires_at: future,
      created_at: new Date(),
      ...overrides,
    };
  }

  it('should return success with token data when token is valid', async () => {
    const token = makeToken();
    tokenRepository.findByToken.mockResolvedValue(token);

    const result = await useCase.execute('token-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.token).toEqual(token);
    }
  });

  it('should return TokenInvalidError when token does not exist', async () => {
    tokenRepository.findByToken.mockResolvedValue(null);

    const result = await useCase.execute('nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_INVALID');
      expect(result.error.message).toBe('Token inválido.');
    }
  });

  it('should return TokenUsedError when token has been used', async () => {
    const token = makeToken({ usado: true });
    tokenRepository.findByToken.mockResolvedValue(token);

    const result = await useCase.execute('token-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_USED');
      expect(result.error.message).toBe('Este link já foi utilizado.');
    }
  });

  it('should return TokenExpiredError when token has expired', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const token = makeToken({ expires_at: past });
    tokenRepository.findByToken.mockResolvedValue(token);

    const result = await useCase.execute('token-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_EXPIRED');
      expect(result.error.message).toBe('Este link expirou.');
    }
  });

  it('should check usado before expiration (used token takes priority)', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const token = makeToken({ usado: true, expires_at: past });
    tokenRepository.findByToken.mockResolvedValue(token);

    const result = await useCase.execute('token-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_USED');
    }
  });
});
