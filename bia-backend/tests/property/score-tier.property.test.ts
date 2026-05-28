import * as fc from 'fast-check';
import { Score } from '../../src/domain/value-objects/Score';
import { Tier } from '../../src/domain/value-objects/Tier';

/**
 * Validates: Requirements 5.1
 */
describe('Property 6: Score Calculation Correctness', () => {
  it('Score.calculate returns arithmetic sum of all values', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.integer({ min: 0, max: 10 })),
        (responses) => {
          const score = Score.calculate(responses);
          const expectedSum = Object.values(responses).reduce((a, b) => a + b, 0);
          return score.numericValue === expectedSum;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 5.2, 5.3, 5.4
 */
describe('Property 7: Tier and RTO Classification', () => {
  it('Tier.fromScore classifies correctly at all boundaries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (score) => {
          const tier = Tier.fromScore(score);
          if (score >= 12) {
            return tier.label === 'Tier 1 (Crítico)' && tier.rto === '< 4 horas';
          } else if (score >= 6) {
            return tier.label === 'Tier 2 (Essencial)' && tier.rto === '4h a 24 horas';
          } else {
            return tier.label === 'Tier 3 (Suporte)' && tier.rto === '> 24 horas';
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('classification boundaries are mutually exclusive and collectively exhaustive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        (score) => {
          const tier = Tier.fromScore(score);
          // Exactly one tier must match
          const isTier1 = tier.label === 'Tier 1 (Crítico)';
          const isTier2 = tier.label === 'Tier 2 (Essencial)';
          const isTier3 = tier.label === 'Tier 3 (Suporte)';
          const matchCount = [isTier1, isTier2, isTier3].filter(Boolean).length;
          return matchCount === 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});
