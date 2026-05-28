import { Tier } from '../../../../src/domain/value-objects/Tier';

describe('Tier', () => {
  describe('fromScore', () => {
    it('should classify score 12 as Tier 1 (Crítico)', () => {
      const tier = Tier.fromScore(12);
      expect(tier.level).toBe(1);
      expect(tier.label).toBe('Tier 1 (Crítico)');
    });

    it('should classify score 24 as Tier 1 (Crítico)', () => {
      const tier = Tier.fromScore(24);
      expect(tier.level).toBe(1);
      expect(tier.label).toBe('Tier 1 (Crítico)');
    });

    it('should classify score 6 as Tier 2 (Essencial)', () => {
      const tier = Tier.fromScore(6);
      expect(tier.level).toBe(2);
      expect(tier.label).toBe('Tier 2 (Essencial)');
    });

    it('should classify score 11 as Tier 2 (Essencial)', () => {
      const tier = Tier.fromScore(11);
      expect(tier.level).toBe(2);
      expect(tier.label).toBe('Tier 2 (Essencial)');
    });

    it('should classify score 5 as Tier 3 (Suporte)', () => {
      const tier = Tier.fromScore(5);
      expect(tier.level).toBe(3);
      expect(tier.label).toBe('Tier 3 (Suporte)');
    });

    it('should classify score 0 as Tier 3 (Suporte)', () => {
      const tier = Tier.fromScore(0);
      expect(tier.level).toBe(3);
      expect(tier.label).toBe('Tier 3 (Suporte)');
    });
  });

  describe('rto', () => {
    it('should return "< 4 horas" for Tier 1', () => {
      const tier = Tier.fromScore(12);
      expect(tier.rto).toBe('< 4 horas');
    });

    it('should return "4h a 24 horas" for Tier 2', () => {
      const tier = Tier.fromScore(6);
      expect(tier.rto).toBe('4h a 24 horas');
    });

    it('should return "> 24 horas" for Tier 3', () => {
      const tier = Tier.fromScore(3);
      expect(tier.rto).toBe('> 24 horas');
    });
  });
});
