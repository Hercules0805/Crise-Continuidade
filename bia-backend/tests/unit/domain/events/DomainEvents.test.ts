import { DomainEvent } from '../../../../src/domain/events/DomainEvent';
import { EvaluationCompleted } from '../../../../src/domain/events/EvaluationCompleted';
import { ProcessCreated } from '../../../../src/domain/events/ProcessCreated';
import { TierChanged } from '../../../../src/domain/events/TierChanged';

describe('DomainEvents', () => {
  describe('EvaluationCompleted', () => {
    it('should store all fields and set occurredAt', () => {
      const event = new EvaluationCompleted('proc-1', 15, 'Tier 1 (Crítico)', 'user@test.com');
      expect(event.eventType).toBe('EVALUATION_COMPLETED');
      expect(event.processoId).toBe('proc-1');
      expect(event.score).toBe(15);
      expect(event.tier).toBe('Tier 1 (Crítico)');
      expect(event.respondent).toBe('user@test.com');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event).toBeInstanceOf(DomainEvent);
    });
  });

  describe('ProcessCreated', () => {
    it('should store all fields and set occurredAt', () => {
      const event = new ProcessCreated('proc-1', 'area-1', 'Processo Financeiro');
      expect(event.eventType).toBe('PROCESS_CREATED');
      expect(event.processoId).toBe('proc-1');
      expect(event.areaId).toBe('area-1');
      expect(event.processoName).toBe('Processo Financeiro');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event).toBeInstanceOf(DomainEvent);
    });
  });

  describe('TierChanged', () => {
    it('should store all fields and set occurredAt', () => {
      const event = new TierChanged('proc-1', 'Tier 3 (Suporte)', 'Tier 1 (Crítico)', 14);
      expect(event.eventType).toBe('TIER_CHANGED');
      expect(event.processoId).toBe('proc-1');
      expect(event.oldTier).toBe('Tier 3 (Suporte)');
      expect(event.newTier).toBe('Tier 1 (Crítico)');
      expect(event.score).toBe(14);
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event).toBeInstanceOf(DomainEvent);
    });
  });
});
