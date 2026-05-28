/**
 * Domain Event: Base class
 * All domain events extend this class.
 * Contains the timestamp of occurrence and the event type identifier.
 */
export abstract class DomainEvent {
  readonly occurredAt: Date;
  abstract readonly eventType: string;

  constructor() {
    this.occurredAt = new Date();
  }
}
