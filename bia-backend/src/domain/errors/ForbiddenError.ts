import { DomainError } from './DomainError';

/**
 * Domain Error: ForbiddenError
 * Thrown when the user does not have permission to access a resource.
 */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly message = 'Acesso negado.';
}
