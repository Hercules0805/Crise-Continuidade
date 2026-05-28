import { DomainEvent } from './DomainEvent';

/**
 * Domain Event: EvaluationCompleted
 * Published when a BIA evaluation is successfully submitted.
 */
export class EvaluationCompleted extends DomainEvent {
  readonly eventType = 'EVALUATION_COMPLETED';

  constructor(
    public readonly processoId: string,
    public readonly score: number,
    public readonly tier: string,
    public readonly respondent: string,
  ) {
    super();
  }
}
