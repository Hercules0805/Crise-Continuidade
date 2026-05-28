import { DomainEvent } from './DomainEvent';

/**
 * Domain Event: ProcessCreated
 * Published when a new Processo is created in the system.
 */
export class ProcessCreated extends DomainEvent {
  readonly eventType = 'PROCESS_CREATED';

  constructor(
    public readonly processoId: string,
    public readonly areaId: string,
    public readonly processoName: string,
  ) {
    super();
  }
}
