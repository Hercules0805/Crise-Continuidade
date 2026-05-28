import * as fc from 'fast-check';
import { LegacyResponsePresenter } from '../../src/adapters/presenters/LegacyResponsePresenter';
import { Processo } from '../../src/domain/entities/Processo';
import { RespostaBia } from '../../src/domain/entities/RespostaBia';
import {
  DomainError,
  TokenExpiredError,
  TokenUsedError,
  TokenInvalidError,
  ActionNotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../src/domain/errors';

// --- Arbitraries ---

const respostaBiaArb: fc.Arbitrary<RespostaBia> = fc.record({
  id: fc.uuid(),
  processo_id: fc.uuid(),
  respondente: fc.string({ minLength: 1 }),
  cargo: fc.string({ minLength: 1 }),
  scores: fc.dictionary(fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 10 })),
  score_total: fc.integer({ min: 0, max: 100 }),
  tier: fc.constantFrom('Tier 1 (Crítico)', 'Tier 2 (Essencial)', 'Tier 3 (Suporte)'),
  created_at: fc.date(),
});

const processoArb: fc.Arbitrary<Processo> = fc.record({
  id: fc.uuid(),
  area_id: fc.uuid(),
  processo: fc.string(),
  descricao: fc.string(),
  dependencia: fc.string(),
  rto: fc.string(),
  rpo: fc.string(),
  mtpd: fc.string(),
  biaHomologada: fc.string(),
  tier: fc.string(),
  bcpStatus: fc.string(),
  descricaoFuncional: fc.string(),
  impactoIndisponibilidade: fc.dictionary(fc.string(), fc.string()),
  bcpObjetivo: fc.string(),
  bcpEscopo: fc.string(),
  bcpContatos: fc.array(fc.dictionary(fc.string(), fc.string())),
  bcpRiscos: fc.array(fc.dictionary(fc.string(), fc.string())),
  bcpPreventivas: fc.array(fc.dictionary(fc.string(), fc.string())),
  drpStatus: fc.string(),
  drpObjetivo: fc.string(),
  drpEscopo: fc.string(),
  drpProcedimentos: fc.string(),
  drpCriterios: fc.string(),
  created_at: fc.date(),
  updated_at: fc.date(),
});

const areaNameArb = fc.string({ minLength: 1 });

// --- Property Tests ---

/**
 * Validates: Requirements 1.3
 */
describe('Property 1: Response Format Preservation', () => {
  const EXPECTED_KEYS = [
    'id',
    'area',
    'processo',
    'descricao',
    'dependencia',
    'rto',
    'rpo',
    'mtpd',
    'biaHomologada',
    'tier',
    'bcpStatus',
    'descricaoFuncional',
    'impactoIndisponibilidade',
    'bcpObjetivo',
    'bcpEscopo',
    'bcpContatos',
    'bcpRiscos',
    'bcpPreventivas',
    'drpStatus',
    'drpObjetivo',
    'drpEscopo',
    'drpProcedimentos',
    'drpCriterios',
    'score',
    'avaliado',
    'respostas',
  ];

  it('output has exactly 26 keys (id + area + 20 data fields + score + avaliado + respostas)', () => {
    fc.assert(
      fc.property(processoArb, areaNameArb, (processo, areaName) => {
        const result = LegacyResponsePresenter.formatProcesso(processo, areaName) as Record<string, unknown>;
        const keys = Object.keys(result);
        expect(keys).toHaveLength(26);
        expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
      }),
      { numRuns: 100 }
    );
  });

  it('string fields are strings (never null/undefined)', () => {
    fc.assert(
      fc.property(processoArb, areaNameArb, fc.option(respostaBiaArb, { nil: undefined }), (processo, areaName, resposta) => {
        const result = LegacyResponsePresenter.formatProcesso(processo, areaName, resposta) as Record<string, unknown>;
        const stringFields = [
          'id', 'area', 'processo', 'descricao', 'dependencia',
          'rto', 'rpo', 'mtpd', 'biaHomologada', 'tier',
          'bcpStatus', 'descricaoFuncional', 'bcpObjetivo', 'bcpEscopo',
          'drpStatus', 'drpObjetivo', 'drpEscopo', 'drpProcedimentos', 'drpCriterios',
        ];
        for (const field of stringFields) {
          expect(typeof result[field]).toBe('string');
          expect(result[field]).not.toBeNull();
          expect(result[field]).not.toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('array fields are arrays (never null/undefined)', () => {
    fc.assert(
      fc.property(processoArb, areaNameArb, fc.option(respostaBiaArb, { nil: undefined }), (processo, areaName, resposta) => {
        const result = LegacyResponsePresenter.formatProcesso(processo, areaName, resposta) as Record<string, unknown>;
        const arrayFields = ['bcpContatos', 'bcpRiscos', 'bcpPreventivas'];
        for (const field of arrayFields) {
          expect(Array.isArray(result[field])).toBe(true);
          expect(result[field]).not.toBeNull();
          expect(result[field]).not.toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('score is a number', () => {
    fc.assert(
      fc.property(processoArb, areaNameArb, fc.option(respostaBiaArb, { nil: undefined }), (processo, areaName, resposta) => {
        const result = LegacyResponsePresenter.formatProcesso(processo, areaName, resposta) as Record<string, unknown>;
        expect(typeof result['score']).toBe('number');
      }),
      { numRuns: 100 }
    );
  });

  it('avaliado is a boolean', () => {
    fc.assert(
      fc.property(processoArb, areaNameArb, fc.option(respostaBiaArb, { nil: undefined }), (processo, areaName, resposta) => {
        const result = LegacyResponsePresenter.formatProcesso(processo, areaName, resposta) as Record<string, unknown>;
        expect(typeof result['avaliado']).toBe('boolean');
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 1.5, 1.6
 */
describe('Property 2: API Response Contract', () => {
  it('success() result has success: true and no error field', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        (data) => {
          const result = LegacyResponsePresenter.success(data) as Record<string, unknown>;
          expect(result['success']).toBe(true);
          expect(result).not.toHaveProperty('error');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('success() with no data still has success: true', () => {
    const result = LegacyResponsePresenter.success() as Record<string, unknown>;
    expect(result['success']).toBe(true);
    expect(result).not.toHaveProperty('error');
  });

  it('error() result has error field and no success field', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (message) => {
        const result = LegacyResponsePresenter.error(message) as Record<string, unknown>;
        expect(result['error']).toBe(message);
        expect(result).not.toHaveProperty('success');
      }),
      { numRuns: 100 }
    );
  });

  it('success and error responses never contain both fields simultaneously', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
        (errorMsg, successData) => {
          const successResult = LegacyResponsePresenter.success(successData) as Record<string, unknown>;
          const errorResult = LegacyResponsePresenter.error(errorMsg) as Record<string, unknown>;

          // Success response should not have error
          const successHasBoth = 'success' in successResult && 'error' in successResult;
          expect(successHasBoth).toBe(false);

          // Error response should not have success
          const errorHasBoth = 'success' in errorResult && 'error' in errorResult;
          expect(errorHasBoth).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 2.8
 */
describe('Property 3: Use Case Typed Error Results', () => {
  const domainErrors: DomainError[] = [
    new TokenExpiredError(),
    new TokenUsedError(),
    new TokenInvalidError(),
    new ActionNotFoundError('testAction'),
    new UnauthorizedError(),
    new ForbiddenError(),
  ];

  it('all DomainError subclasses have non-empty string code property', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...domainErrors),
        (error) => {
          expect(typeof error.code).toBe('string');
          expect(error.code.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all DomainError subclasses have non-empty string message property', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...domainErrors),
        (error) => {
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ActionNotFoundError includes the action name in its message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (actionName) => {
          const error = new ActionNotFoundError(actionName);
          expect(error.code).toBe('ACTION_NOT_FOUND');
          expect(error.message).toContain(actionName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('DomainError subclasses are instances of DomainError', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...domainErrors),
        (error) => {
          expect(error).toBeInstanceOf(DomainError);
        }
      ),
      { numRuns: 100 }
    );
  });
});
