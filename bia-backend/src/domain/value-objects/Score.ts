import { Tier } from './Tier';

/**
 * Value Object: Score
 * Encapsulates score calculation logic for BIA evaluations.
 * The score is the sum of all question response values.
 */
export class Score {
  private constructor(private readonly value: number) {}

  /**
   * Calculates the total score from a map of question responses.
   * @param responses - A record mapping question identifiers to numeric scores.
   * @returns A Score instance with the calculated total.
   */
  static calculate(responses: Record<string, number>): Score {
    const total = Object.values(responses).reduce((a, b) => a + b, 0);
    return new Score(total);
  }

  /**
   * Returns the Tier classification derived from this score.
   */
  get tier(): Tier {
    return Tier.fromScore(this.value);
  }

  /**
   * Returns the raw numeric value of the score.
   */
  get numericValue(): number {
    return this.value;
  }
}
