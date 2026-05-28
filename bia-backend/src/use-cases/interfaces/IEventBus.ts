import { DomainEvent } from '../../domain/events/DomainEvent';

export interface IEventBus {
  publish(event: DomainEvent): void;
  subscribe(eventType: string, handler: (event: DomainEvent) => void): void;
}
