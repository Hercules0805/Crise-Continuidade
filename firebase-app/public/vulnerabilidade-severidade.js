/**
 * Severidade final de uma Vulnerabilidade.
 *
 * REGRA UNICA: vem do CVSS quando ele existe (faixas padrao NVD -- ver
 * https://nvd.nist.gov/vuln-metrics/cvss), e so cai pra `severidadeManual`
 * (escolhida a mao na tela) quando o CVSS nao se aplica. E o que a planilha
 * de origem deste catalogo ja faz na pratica: a linha "Information Disclosure"
 * tem CVSS "Nao se aplica" mas Severidade "Alta" escolhida a mao -- nunca o
 * contrario (quando ha CVSS, a severidade manual nao e consultada).
 *
 * SENTIDO: MAIOR e PIOR (igual criticidade de fornecedor-criticidade.js,
 * diferente da nota de conformidade de fornecedor-score.js).
 *
 * Exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VulnerabilidadeSeveridade = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SENTIDO = 'maiorPior';

  /** Faixas fechadas, mesmo vocabulario aceito em severidadeManual. */
  var FAIXAS = ['Baixa', 'Média', 'Alta', 'Crítica'];

  /**
   * Faixa a partir do CVSS (0-10), pelas bandas padrao NVD. `null` quando o
   * CVSS nao foi informado ou nao e um numero valido -- CVSS 0 e informado
   * de verdade (sem severidade pratica), nao ausencia.
   */
  function faixaPorCVSS(cvss) {
    if (cvss === null || cvss === undefined || cvss === '') return null;
    var n = Number(cvss);
    if (!Number.isFinite(n)) return null;
    if (n >= 9) return 'Crítica';
    if (n >= 7) return 'Alta';
    if (n >= 4) return 'Média';
    return 'Baixa';
  }

  var CORES = {
    'Crítica': { cor: 'var(--risk-critical)', fundo: 'var(--risk-critical-surface)' },
    'Alta': { cor: 'var(--risk-high)', fundo: '#fff3e0' },
    'Média': { cor: 'var(--risk-medium)', fundo: '#fff8e1' },
    'Baixa': { cor: 'var(--risk-low)', fundo: '#e8f5e9' },
  };

  /**
   * Severidade final de uma vulnerabilidade `{ cvss, severidadeManual }`.
   * Devolve `{ rotulo, cor, fundo }` -- mesmo formato de
   * FornecedorCriticidade.faixa/RiscoConsolidado.faixaScore.
   */
  function faixa(vuln) {
    var v = vuln || {};
    var rotulo = faixaPorCVSS(v.cvss) || (FAIXAS.indexOf(v.severidadeManual) !== -1 ? v.severidadeManual : null);
    if (!rotulo) return { rotulo: 'Não informado', cor: '#999', fundo: '#f5f5f5' };
    var c = CORES[rotulo];
    return { rotulo: rotulo, cor: c.cor, fundo: c.fundo };
  }

  return {
    SENTIDO: SENTIDO,
    FAIXAS: FAIXAS,
    faixaPorCVSS: faixaPorCVSS,
    faixa: faixa,
  };
}));
