import { DomainError } from './DomainError';

/**
 * Domain Error: UnauthorizedError
 * Thrown when authentication is missing or invalid.
 */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly message = 'Token não fornecido ou inválido.';
}
