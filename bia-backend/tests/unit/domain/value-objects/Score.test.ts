import { Score } from '../../../../src/domain/value-objects/Score';
import { Tier } from '../../../../src/domain/value-objects/Tier';

describe('Score', () => {
  describe('calculate', () => {
    it('should return 0 for an empty responses map', () => {
      const score = Score.calculate({});
      expect(score.numericValue).toBe(0);
    });

    it('should sum all response values', () => {
      const score = Score.calculate({ q1: 3, q2: 4, q3: 5 });
      expect(score.numericValue).toBe(12);
    });

    it('should handle a single response', () => {
      const score = Score.calculate({ q1: 7 });
      expect(score.numericValue).toBe(7);
    });
  });

  describe('tier', () => {
    it('should return Tier 1 for score >= 12', () => {
      const score = Score.calculate({ q1: 6, q2: 6 });
      expect(score.tier.level).toBe(1);
      expect(score.tier.label).toBe('Tier 1 (Crítico)');
    });

    it('should return Tier 2 for score >= 6 and < 12', () => {
      const score = Score.calculate({ q1: 3, q2: 3 });
      expect(score.tier.level).toBe(2);
      expect(score.tier.label).toBe('Tier 2 (Essencial)');
    });

    it('should return Tier 3 for score < 6', () => {
      const score = Score.calculate({ q1: 2, q2: 1 });
      expect(score.tier.level).toBe(3);
      expect(score.tier.label).toBe('Tier 3 (Suporte)');
    });
  });
});
