import { DomainError } from './DomainError';

/**
 * Domain Error: TokenExpiredError
 * Thrown when a token has passed its expiration date.
 */
export class TokenExpiredError extends DomainError {
  readonly code = 'TOKEN_EXPIRED';
  readonly message = 'Este link expirou.';
}
