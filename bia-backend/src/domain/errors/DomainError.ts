/**
 * Domain Error: Base abstract class
 * All domain-specific errors extend this class.
 * Contains a machine-readable code and a human-readable message.
 */
export abstract class DomainError {
  abstract readonly code: string;
  abstract readonly message: string;
}
