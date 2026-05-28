import { DomainEvent } from '../../domain/events/DomainEvent';
import { IEventBus } from '../../use-cases/interfaces/IEventBus';

export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Array<(event: DomainEvent) => void>> = new Map();

  publish(event: DomainEvent): void {
    const eventHandlers = this.handlers.get(event.eventType) || [];
    eventHandlers.forEach(handler => handler(event));
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }
}
