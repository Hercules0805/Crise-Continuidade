// Calculo CVSS 3.1 e matriz "sem CVSS" da aba Severidade (node --test).
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../public/cvss31.js');

const nota = (vetor) => C.calcular(C.lerVetor('CVSS:3.1/' + vetor));

test('notas de referencia da especificacao/NVD', () => {
  assert.strictEqual(nota('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 9.8);
  assert.strictEqual(nota('AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H'), 10);
  assert.strictEqual(nota('AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N'), 6.1);
  assert.strictEqual(nota('AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H'), 7.8);
  assert.strictEqual(nota('AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N'), 5.9);
  assert.strictEqual(nota('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'), 7.5);
  assert.strictEqual(nota('AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H'), 8.8);
  assert.strictEqual(nota('AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'), 4.6);
});

test('sem impacto nenhum a nota e zero, nao importa o resto', () => {
  assert.strictEqual(nota('AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:N'), 0);
});

test('escopo alterado muda o peso do privilegio (PR:L/PR:H)', () => {
  assert.strictEqual(nota('AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N'), 6.4);
  assert.strictEqual(nota('AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H'), 9.1);
});

test('faltando metrica: calcular null, paraVetor vazio, faltam conta', () => {
  const r = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H' };
  assert.strictEqual(C.calcular(r), null);
  assert.strictEqual(C.paraVetor(r), '');
  assert.strictEqual(C.faltam(r), 1);
  assert.strictEqual(C.faltam({}), 8);
});

test('ida e volta entre respostas e vetor', () => {
  const r = { AV: 'A', AC: 'H', PR: 'L', UI: 'R', S: 'C', C: 'L', I: 'N', A: 'H' };
  const v = C.paraVetor(r);
  assert.strictEqual(v, 'CVSS:3.1/AV:A/AC:H/PR:L/UI:R/S:C/C:L/I:N/A:H');
  assert.deepStrictEqual(C.lerVetor(v), r);
});

test('lerVetor aceita 3.0, ordem trocada, minusculas e metricas temporais', () => {
  const r = C.lerVetor('cvss:3.0/C:H/I:H/A:H/AV:N/AC:L/PR:N/UI:N/S:U/E:P/RL:O');
  assert.deepStrictEqual(r, { C: 'H', I: 'H', A: 'H', AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U' });
});

test('lerVetor recusa vetor invalido, incompleto, repetido ou de outra versao', () => {
  assert.strictEqual(C.lerVetor(''), null);
  assert.strictEqual(C.lerVetor('9.8'), null);
  assert.strictEqual(C.lerVetor('CVSS:3.1/AV:N/AC:L'), null);
  assert.strictEqual(C.lerVetor('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), null);
  assert.strictEqual(C.lerVetor('CVSS:3.1/AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), null);
  assert.strictEqual(C.lerVetor('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'), null);
});

test('avaliacao pela metade: vetor parcial guarda e le de volta, mas nunca vira nota', () => {
  const r = { AV: 'N', PR: 'L', C: 'H' };
  const v = C.paraVetor(r, { parcial: true });
  assert.strictEqual(v, 'CVSS:3.1/AV:N/PR:L/C:H');
  assert.deepStrictEqual(C.lerVetor(v, { parcial: true }), r);
  assert.strictEqual(C.lerVetor(v), null);
  assert.strictEqual(C.calcular(C.lerVetor(v, { parcial: true })), null);
  assert.strictEqual(C.paraVetor({}, { parcial: true }), '');
  assert.strictEqual(C.lerVetor('CVSS:3.1/AV:Z', { parcial: true }), null);
});

test('matriz sem CVSS: cantos, diagonal e resposta faltando', () => {
  assert.strictEqual(C.sugerirSeveridade('Baixo', 'Difícil'), 'Baixa');
  assert.strictEqual(C.sugerirSeveridade('Grave', 'Muito fácil'), 'Crítica');
  assert.strictEqual(C.sugerirSeveridade('Alto', 'Fácil'), 'Alta');
  assert.strictEqual(C.sugerirSeveridade('Moderado', 'Possível'), 'Média');
  assert.strictEqual(C.sugerirSeveridade('Grave', ''), null);
  assert.strictEqual(C.sugerirSeveridade('Inventado', 'Fácil'), null);
});

test('toda opcao da tela tem rotulo e explicacao', () => {
  C.METRICAS.forEach((m) => {
    assert.ok(m.pergunta && m.grupo, m.codigo);
    m.opcoes.forEach((o) => assert.ok(o.rotulo && o.explicacao, m.codigo + ':' + o.codigo));
  });
  assert.strictEqual(C.METRICAS.length, 8);
});
