import { ITokenRepository } from '../interfaces/ITokenRepository';
import { IRespostaBiaRepository } from '../interfaces/IRespostaBiaRepository';
import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { IEventBus } from '../interfaces/IEventBus';
import { Score } from '../../domain/value-objects/Score';
import { EvaluationCompleted } from '../../domain/events/EvaluationCompleted';
import { RespostaBia } from '../../domain/entities/RespostaBia';
import { DomainError, TokenInvalidError, TokenUsedError, TokenExpiredError } from '../../domain/errors';

/**
 * Use Case: SalvarRespostasArea
 * Validates an area token, saves BIA evaluation responses for multiple processes,
 * calculates score/tier for each, updates each Processo, publishes events,
 * and marks the token as used.
 *
 * Validates: Requirements 5.1, 5.5, 6.3, 6.4, 6.5, 6.7
 */
export class SalvarRespostasAreaUseCase {
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly respostaBiaRepository: IRespostaBiaRepository,
    private readonly processoRepository: IProcessoRepository,
    private readonly eventBus: IEventBus
  ) {}

  async execute(data: {
    token: string;
    respondente: string;
    cargo: string;
    respostas: Array<{
      processo_id: string;
      scores: Record<string, number>;
    }>;
  }): Promise<{ success: true } | DomainError> {
    // Validate area token
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

    // Save responses for each processo
    for (const item of data.respostas) {
      const score = Score.calculate(item.scores);
      const tier = score.tier;

      // Save the response
      const resposta: Partial<RespostaBia> = {
        processo_id: item.processo_id,
        respondente: data.respondente,
        cargo: data.cargo,
        scores: item.scores,
        score_total: score.numericValue,
        tier: tier.label,
      };
      await this.respostaBiaRepository.save(resposta as RespostaBia);

      // Update processo tier and RTO
      await this.processoRepository.updateTierAndRto(item.processo_id, tier.label, tier.rto);

      // Publish domain event
      this.eventBus.publish(
        new EvaluationCompleted(item.processo_id, score.numericValue, tier.label, data.respondente)
      );
    }

    // Mark token as used
    await this.tokenRepository.markAsUsed(tokenEntity.id);

    return { success: true };
  }
}
