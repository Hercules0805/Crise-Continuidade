import * as fc from 'fast-check';
import { SalvarRespostasUseCase } from '../../src/use-cases/evaluation/SalvarRespostasUseCase';
import { InMemoryEventBus } from '../../src/infrastructure/events/InMemoryEventBus';
import { EvaluationCompleted } from '../../src/domain/events/EvaluationCompleted';
import { DomainEvent } from '../../src/domain/events/DomainEvent';
import { IRespostaBiaRepository } from '../../src/use-cases/interfaces/IRespostaBiaRepository';
import { IProcessoRepository } from '../../src/use-cases/interfaces/IProcessoRepository';
import { IEmailService } from '../../src/use-cases/interfaces/IEmailService';
import { RespostaBia } from '../../src/domain/entities/RespostaBia';
import { Processo } from '../../src/domain/entities/Processo';
import { Score } from '../../src/domain/value-objects/Score';

// Mock repositories
class MockRespostaBiaRepository implements IRespostaBiaRepository {
  async findByProcesso(): Promise<RespostaBia[]> { return []; }
  async findLatestByProcesso(): Promise<RespostaBia | null> { return null; }
  async findAll(): Promise<RespostaBia[]> { return []; }
  async save(r: RespostaBia): Promise<RespostaBia> { return r; }
}

class MockProcessoRepository implements IProcessoRepository {
  async findAll(): Promise<Processo[]> { return []; }
  async findByArea(): Promise<Processo[]> { return []; }
  async findById(): Promise<Processo | null> { return null; }
  async save(p: Processo): Promise<Processo> { return p; }
  async delete(): Promise<void> {}
  async updateTierAndRto(): Promise<void> {}
}

class MockEmailService implements IEmailService {
  async sendTokenEmail(): Promise<void> {}
  async sendHtmlReport(): Promise<void> {}
  async sendNotification(): Promise<void> {}
}

/**
 * Validates: Requirements 13.2
 */
describe('Property 17: Domain Events Published on Evaluation', () => {
  it('EvaluationCompleted event is published with correct data on every evaluation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 10 })),
        async (processoId, respondente, cargo, scores) => {
          const eventBus = new InMemoryEventBus();
          const publishedEvents: DomainEvent[] = [];
          eventBus.subscribe('EVALUATION_COMPLETED', (event) => publishedEvents.push(event));

          const useCase = new SalvarRespostasUseCase(
            new MockRespostaBiaRepository(),
            new MockProcessoRepository(),
            new MockEmailService(),
            eventBus,
            'notify@test.com'
          );

          await useCase.execute({ processo_id: processoId, respondente, cargo, scores });

          // Verify exactly one event was published
          expect(publishedEvents.length).toBe(1);

          const event = publishedEvents[0] as EvaluationCompleted;
          const expectedScore = Score.calculate(scores);

          // Verify event data matches the evaluation
          expect(event.processoId).toBe(processoId);
          expect(event.score).toBe(expectedScore.numericValue);
          expect(event.tier).toBe(expectedScore.tier.label);
          expect(event.respondent).toBe(respondente);
        }
      ),
      { numRuns: 100 }
    );
  });
});
