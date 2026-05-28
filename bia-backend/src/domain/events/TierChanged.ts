import { DomainEvent } from './DomainEvent';

/**
 * Domain Event: TierChanged
 * Published when a Processo's tier classification changes after evaluation.
 */
export class TierChanged extends DomainEvent {
  readonly eventType = 'TIER_CHANGED';

  constructor(
    public readonly processoId: string,
    public readonly oldTier: string,
    public readonly newTier: string,
    public readonly score: number,
  ) {
    super();
  }
}
