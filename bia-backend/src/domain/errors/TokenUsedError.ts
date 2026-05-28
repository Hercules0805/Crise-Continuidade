import { DomainError } from './DomainError';

/**
 * Domain Error: TokenUsedError
 * Thrown when a token has already been consumed.
 */
export class TokenUsedError extends DomainError {
  readonly code = 'TOKEN_USED';
  readonly message = 'Este link já foi utilizado.';
}
