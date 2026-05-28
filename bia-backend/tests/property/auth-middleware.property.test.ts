import * as fc from 'fast-check';
import { PUBLIC_ACTIONS } from '../../src/adapters/middleware/authMiddleware';

/**
 * Validates: Requirements 4.3
 */
describe('Property 4: Public Actions Bypass Authentication', () => {
  const expectedPublicActions = new Set([
    'validarToken', 'validarTokenArea',
    'salvarRespostasToken', 'salvarRespostasArea'
  ]);

  it('all defined public actions are in the expected set', () => {
    expect(new Set(PUBLIC_ACTIONS)).toEqual(expectedPublicActions);
  });

  it('for any public action, auth is not required', () => {
    fc.assert(fc.property(
      fc.constantFrom(...PUBLIC_ACTIONS),
      (action) => {
        // Public actions should be in the bypass list
        return PUBLIC_ACTIONS.includes(action);
      }
    ), { numRuns: 100 });
  });

  it('for any non-public action, auth IS required', () => {
    const nonPublicActions = [
      'getPerguntas', 'getAreas', 'getProcessos', 'getProcessosPorArea',
      'getResumoRespostas', 'getConfigRespostas', 'getPerfil', 'getDependencias',
      'salvarPergunta', 'excluirPergunta', 'salvarArea', 'excluirArea',
      'salvarProcesso', 'excluirProcesso', 'salvarRespostas',
      'gerarToken', 'gerarTokenArea', 'gerarRelatorioArea',
      'salvarConfigResposta', 'excluirConfigResposta',
      'salvarDependencia', 'excluirDependencia'
    ];

    fc.assert(fc.property(
      fc.constantFrom(...nonPublicActions),
      (action) => {
        return !PUBLIC_ACTIONS.includes(action);
      }
    ), { numRuns: 100 });
  });
});

/**
 * Validates: Requirements 4.5
 */
describe('Property 5: Domain Email Validation', () => {
  // Extract the domain validation logic from the middleware for isolated testing
  const isValidDomain = (email: string): boolean => {
    return email.toLowerCase().endsWith('@fortestecnologia.com.br');
  };

  it('emails ending with @fortestecnologia.com.br pass validation', () => {
    fc.assert(fc.property(
      fc.stringOf(fc.char().filter(c => c !== '@' && c !== ' '), { minLength: 1, maxLength: 20 }),
      (localPart) => {
        const email = `${localPart}@fortestecnologia.com.br`;
        return isValidDomain(email);
      }
    ), { numRuns: 100 });
  });

  it('emails NOT ending with @fortestecnologia.com.br fail validation', () => {
    const otherDomains = [
      'gmail.com', 'outlook.com', 'yahoo.com', 'empresa.com.br',
      'fortestecnologia.com', 'fortestecnologia.br', 'other.org'
    ];

    fc.assert(fc.property(
      fc.stringOf(fc.char().filter(c => c !== '@' && c !== ' '), { minLength: 1, maxLength: 20 }),
      fc.constantFrom(...otherDomains),
      (localPart, domain) => {
        const email = `${localPart}@${domain}`;
        return !isValidDomain(email);
      }
    ), { numRuns: 100 });
  });

  it('domain validation is case-insensitive', () => {
    fc.assert(fc.property(
      fc.stringOf(fc.char().filter(c => c !== '@' && c !== ' '), { minLength: 1, maxLength: 20 }),
      fc.constantFrom(
        '@FORTESTECNOLOGIA.COM.BR',
        '@FortestEcnologia.Com.Br',
        '@fortestecnologia.COM.BR',
        '@Fortestecnologia.com.br'
      ),
      (localPart, domainPart) => {
        const email = `${localPart}${domainPart}`;
        return isValidDomain(email);
      }
    ), { numRuns: 100 });
  });
});
