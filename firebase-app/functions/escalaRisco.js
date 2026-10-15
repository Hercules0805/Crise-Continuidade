/**
 * Escala de risco do servidor -- NIST SP 800-30 5x5 (DECISAO 15/10/2026).
 *
 * COPIA da regra de public/risco-consolidado.js (Functions nao enxerga a pasta
 * public/ no deploy). Um teste (escalaRisco.test.js) carrega os dois arquivos
 * e falha se divergirem -- mudar um lado sem o outro quebra o build.
 *
 *   Probabilidade: Muito baixa, Baixa, Moderada, Alta, Muito alta (1-5)
 *   Impacto:       Muito baixo, Baixo, Moderado, Alto, Muito alto (1-5)
 *   Score = P x I (1-25): ordena e entra na carga.
 *   Nivel = matriz da Tabela I-2 do SP 800-30 (nao o produto).
 *
 * Rotulos da escala antiga (3x4: Média, Crítico...) sao normalizados na
 * leitura -- medicao antiga, PCN antigo e dado nao migrado continuam valendo.
 */

'use strict';

const PROBABILIDADES = ['Muito baixa', 'Baixa', 'Moderada', 'Alta', 'Muito alta'];
const IMPACTOS = ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'];
const ORDEM_NIVEL = ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'];
const FAIXAS = ['Muito alto', 'Alto', 'Moderado', 'Baixo', 'Muito baixo'];
const SCORE_MAXIMO = 25;

const _MB = 'Muito baixo';
const _B = 'Baixo';
const _M = 'Moderado';
const _A = 'Alto';
const _MA = 'Muito alto';
const MATRIZ_NIVEL = [
  [_MB, _MB, _MB, _B, _B],
  [_MB, _B, _B, _B, _M],
  [_MB, _B, _M, _M, _A],
  [_MB, _B, _M, _A, _MA],
  [_MB, _B, _M, _A, _MA],
];

const _NIVEIS_POR_CHAVE = {
  'muito baixa': 0, 'muito baixo': 0,
  baixa: 1, baixo: 1,
  media: 2, medio: 2, moderada: 2, moderado: 2,
  alta: 3, alto: 3,
  'muito alta': 4, 'muito alto': 4, critica: 4, critico: 4,
};

function _chave(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizarProbabilidade(v) {
  const i = _NIVEIS_POR_CHAVE[_chave(v)];
  return i === undefined ? '' : PROBABILIDADES[i];
}

function normalizarImpacto(v) {
  const i = _NIVEIS_POR_CHAVE[_chave(v)];
  return i === undefined ? '' : IMPACTOS[i];
}

function normalizarNivel(v) {
  const i = _NIVEIS_POR_CHAVE[_chave(v)];
  return i === undefined ? '' : ORDEM_NIVEL[i];
}

/** Score P x I (1-25), ou null fora da escala. */
function scoreDeRisco(probabilidade, impacto) {
  const p = PROBABILIDADES.indexOf(normalizarProbabilidade(probabilidade));
  const i = IMPACTOS.indexOf(normalizarImpacto(impacto));
  if (p === -1 || i === -1) return null;
  return (p + 1) * (i + 1);
}

/** Nivel pela matriz NIST, ou null fora da escala. */
function nivelPorMatriz(probabilidade, impacto) {
  const p = PROBABILIDADES.indexOf(normalizarProbabilidade(probabilidade));
  const i = IMPACTOS.indexOf(normalizarImpacto(impacto));
  if (p === -1 || i === -1) return null;
  return MATRIZ_NIVEL[p][i];
}

/** Dias ate a proxima reavaliacao, pelo nivel. */
const DIAS_REAVALIACAO = { 'Muito alto': 30, Alto: 90, Moderado: 180, Baixo: 365, 'Muito baixo': 365 };

module.exports = {
  PROBABILIDADES,
  IMPACTOS,
  ORDEM_NIVEL,
  FAIXAS,
  SCORE_MAXIMO,
  MATRIZ_NIVEL,
  DIAS_REAVALIACAO,
  normalizarProbabilidade,
  normalizarImpacto,
  normalizarNivel,
  scoreDeRisco,
  nivelPorMatriz,
};
