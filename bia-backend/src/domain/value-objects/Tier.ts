/**
 * Value Object: Tier
 * Encapsulates tier classification logic for process criticality.
 * 
 * Tier 1 (Crítico): score >= 12, RTO < 4 horas
 * Tier 2 (Essencial): 6 <= score < 12, RTO 4h a 24 horas
 * Tier 3 (Suporte): score < 6, RTO > 24 horas
 */
export class Tier {
  private constructor(
    public readonly label: string,
    public readonly level: number
  ) {}

  /**
   * Classifies a numeric score into the appropriate tier.
   */
  static fromScore(score: number): Tier {
    if (score >= 12) return new Tier('Tier 1 (Crítico)', 1);
    if (score >= 6) return new Tier('Tier 2 (Essencial)', 2);
    return new Tier('Tier 3 (Suporte)', 3);
  }

  /**
   * Returns the Recovery Time Objective associated with this tier.
   */
  get rto(): string {
    switch (this.level) {
      case 1: return '< 4 horas';
      case 2: return '4h a 24 horas';
      default: return '> 24 horas';
    }
  }
}
