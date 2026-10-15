// A escala do servidor e uma COPIA da do cliente (public/risco-consolidado.js).
// Este teste falha se as duas divergirem em qualquer celula ou rotulo.
const { test } = require('node:test');
const assert = require('node:assert');
const ER = require('./escalaRisco');
const RC = require('../public/risco-consolidado.js');

test('mesmos rótulos, mesma ordem, mesmo máximo', () => {
  assert.deepStrictEqual(ER.PROBABILIDADES, RC.PROBABILIDADES);
  assert.deepStrictEqual(ER.IMPACTOS, RC.IMPACTOS);
  assert.deepStrictEqual(ER.ORDEM_NIVEL, RC.ORDEM_NIVEL);
  assert.deepStrictEqual(ER.FAIXAS, RC.FAIXAS);
  assert.strictEqual(ER.SCORE_MAXIMO, RC.SCORE_MAXIMO);
  assert.deepStrictEqual(ER.DIAS_REAVALIACAO, RC.DIAS_REAVALIACAO);
});

test('mesma matriz NIST e mesmo score, célula a célula (inclusive rótulos antigos)', () => {
  const valores = [...RC.PROBABILIDADES, ...RC.IMPACTOS, 'Média', 'Crítico', 'Crítica', 'Médio', 'Grave', ''];
  valores.forEach((p) => valores.forEach((i) => {
    assert.strictEqual(ER.nivelPorMatriz(p, i), RC.nivelPorMatriz(p, i), `nivel ${p} x ${i}`);
    assert.strictEqual(ER.scoreDeRisco(p, i), RC.scoreDoRisco({ probabilidade: p, impacto: i }), `score ${p} x ${i}`);
  }));
});

test('mesma normalização', () => {
  ['Média', 'media', 'Crítico', 'Moderado', 'Muito alta', 'x', ''].forEach((v) => {
    assert.strictEqual(ER.normalizarProbabilidade(v), RC.normalizarProbabilidade(v), v);
    assert.strictEqual(ER.normalizarImpacto(v), RC.normalizarImpacto(v), v);
    assert.strictEqual(ER.normalizarNivel(v), RC.normalizarNivel(v), v);
  });
});
