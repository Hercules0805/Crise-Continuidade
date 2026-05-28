import { DomainError } from './DomainError';

/**
 * Domain Error: ActionNotFoundError
 * Thrown when a request specifies an unrecognized action.
 */
export class ActionNotFoundError extends DomainError {
  readonly code = 'ACTION_NOT_FOUND';
  readonly message: string;

  constructor(action: string) {
    super();
    this.message = `Action não reconhecida: ${action}`;
  }
}
