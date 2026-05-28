import { DomainError } from './DomainError';

/**
 * Domain Error: TokenInvalidError
 * Thrown when a token does not exist in the system.
 */
export class TokenInvalidError extends DomainError {
  readonly code = 'TOKEN_INVALID';
  readonly message = 'Token inválido.';
}
