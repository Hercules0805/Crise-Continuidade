import { IRespostaBiaRepository } from '../interfaces/IRespostaBiaRepository';
import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { IEmailService } from '../interfaces/IEmailService';
import { IEventBus } from '../interfaces/IEventBus';
import { Score } from '../../domain/value-objects/Score';
import { EvaluationCompleted } from '../../domain/events/EvaluationCompleted';
import { RespostaBia } from '../../domain/entities/RespostaBia';
import { evaluationNotificationTemplate } from '../../infrastructure/email/templates/evaluationNotificationTemplate';

/**
 * Use Case: SalvarRespostas
 * Saves BIA evaluation responses, calculates score via Score value object,
 * derives tier/RTO, updates Processo, publishes EvaluationCompleted event,
 * and sends notification email.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
export class SalvarRespostasUseCase {
  constructor(
    private readonly respostaBiaRepository: IRespostaBiaRepository,
    private readonly processoRepository: IProcessoRepository,
    private readonly emailService: IEmailService,
    private readonly eventBus: IEventBus,
    private readonly notificationEmail: string
  ) {}

  async execute(data: {
    processo_id: string;
    respondente: string;
    cargo: string;
    scores: Record<string, number>;
  }): Promise<{ success: true }> {
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

    // Send notification email (fire and forget, don't fail the operation)
    try {
      const processo = await this.processoRepository.findById(data.processo_id);
      await this.emailService.sendNotification(
        this.notificationEmail,
        'Nova avaliação BIA concluída',
        evaluationNotificationTemplate({
          areaName: processo?.area_id ?? 'N/A',
          processoName: processo?.processo ?? data.processo_id,
          respondente: data.respondente,
          score: score.numericValue,
          tier: tier.label,
        })
      );
    } catch {
      // Log but don't fail the operation
    }

    return { success: true };
  }
}
