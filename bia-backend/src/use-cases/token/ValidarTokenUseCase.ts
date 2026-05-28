import { ITokenRepository } from '../interfaces/ITokenRepository';
import { DomainError } from '../../domain/errors/DomainError';
import { TokenExpiredError } from '../../domain/errors/TokenExpiredError';
import { TokenUsedError } from '../../domain/errors/TokenUsedError';
import { TokenInvalidError } from '../../domain/errors/TokenInvalidError';
import { Token } from '../../domain/entities';

export type ValidarTokenResult =
  | { success: true; token: Token }
  | { success: false; error: DomainError };

export class ValidarTokenUseCase {
  constructor(private readonly tokenRepository: ITokenRepository) {}

  async execute(tokenId: string): Promise<ValidarTokenResult> {
    const token = await this.tokenRepository.findByToken(tokenId);

    if (!token) {
      return { success: false, error: new TokenInvalidError() };
    }

    if (token.usado) {
      return { success: false, error: new TokenUsedError() };
    }

    if (new Date() > token.expires_at) {
      return { success: false, error: new TokenExpiredError() };
    }

    return { success: true, token };
  }
}
