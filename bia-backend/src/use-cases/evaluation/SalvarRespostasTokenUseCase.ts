import { ITokenRepository } from '../interfaces/ITokenRepository';
import { IRespostaBiaRepository } from '../interfaces/IRespostaBiaRepository';
import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { IEventBus } from '../interfaces/IEventBus';
import { Score } from '../../domain/value-objects/Score';
import { EvaluationCompleted } from '../../domain/events/EvaluationCompleted';
import { RespostaBia } from '../../domain/entities/RespostaBia';
import { DomainError, TokenInvalidError, TokenUsedError, TokenExpiredError } from '../../domain/errors';

/**
 * Use Case: SalvarRespostasToken
 * Validates a one-time token, saves BIA evaluation responses,
 * calculates score/tier, updates Processo, publishes event,
 * and marks the token as used.
 *
 * Validates: Requirements 5.1, 5.5, 6.3, 6.4, 6.5, 6.7
 */
export class SalvarRespostasTokenUseCase {
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly respostaBiaRepository: IRespostaBiaRepository,
    private readonly processoRepository: IProcessoRepository,
    private readonly eventBus: IEventBus
  ) {}

  async execute(data: {
    token: string;
    processo_id: string;
    respondente: string;
    cargo: string;
    scores: Record<string, number>;
  }): Promise<{ success: true } | DomainError> {
    // Validate token
    const tokenEntity = await this.tokenRepository.findByToken(data.token);

    if (!tokenEntity) {
      return new TokenInvalidError();
    }

    if (tokenEntity.usado) {
      return new TokenUsedError();
    }

    if (new Date() > tokenEntity.expires_at) {
      return new TokenExpiredError();
    }

    // Calculate score and tier
    const score = Score.calculate(data.scores);
    const tier = score.tier;

    // Save the response
    const resposta: Partial<RespostaBia> = {
      processo_id: data.processo_id,
      respondente: data.respondente,
      cargo: data.cargo,
      scores: data.scores,
      score_total: score.numericValue,
      tier: tier.label,
    };
    await this.respostaBiaRepository.save(resposta as RespostaBia);

    // Update processo tier and RTO
    await this.processoRepository.updateTierAndRto(data.processo_id, tier.label, tier.rto);

    // Publish domain event
    this.eventBus.publish(
      new EvaluationCompleted(data.processo_id, score.numericValue, tier.label, data.respondente)
    );

    // Mark token as used
    await this.tokenRepository.markAsUsed(tokenEntity.id);

    return { success: true };
  }
}
