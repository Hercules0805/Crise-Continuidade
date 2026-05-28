import { DomainError } from '../../../../src/domain/errors/DomainError';
import { TokenExpiredError } from '../../../../src/domain/errors/TokenExpiredError';
import { TokenUsedError } from '../../../../src/domain/errors/TokenUsedError';
import { TokenInvalidError } from '../../../../src/domain/errors/TokenInvalidError';
import { ActionNotFoundError } from '../../../../src/domain/errors/ActionNotFoundError';
import { UnauthorizedError } from '../../../../src/domain/errors/UnauthorizedError';
import { ForbiddenError } from '../../../../src/domain/errors/ForbiddenError';

describe('DomainErrors', () => {
  describe('TokenExpiredError', () => {
    it('should have correct code and message', () => {
      const error = new TokenExpiredError();
      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.message).toBe('Este link expirou.');
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('TokenUsedError', () => {
    it('should have correct code and message', () => {
      const error = new TokenUsedError();
      expect(error.code).toBe('TOKEN_USED');
      expect(error.message).toBe('Este link já foi utilizado.');
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('TokenInvalidError', () => {
    it('should have correct code and message', () => {
      const error = new TokenInvalidError();
      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.message).toBe('Token inválido.');
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('ActionNotFoundError', () => {
    it('should have correct code and dynamic message', () => {
      const error = new ActionNotFoundError('unknownAction');
      expect(error.code).toBe('ACTION_NOT_FOUND');
      expect(error.message).toBe('Action não reconhecida: unknownAction');
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should include the action name in the message', () => {
      const error = new ActionNotFoundError('getInvalid');
      expect(error.message).toContain('getInvalid');
    });
  });

  describe('UnauthorizedError', () => {
    it('should have correct code and message', () => {
      const error = new UnauthorizedError();
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Token não fornecido ou inválido.');
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('ForbiddenError', () => {
    it('should have correct code and message', () => {
      const error = new ForbiddenError();
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Acesso negado.');
      expect(error).toBeInstanceOf(DomainError);
    });
  });
});
