// Testes do livro de medicoes (node --test).
const { test } = require('node:test');
const assert = require('node:assert');
const { medicaoDeRespostaBia, idDaMedicao, FONTE, ESCALA } = require('./medicoes');

const respostaOk = () => ({
  area: 'TI',
  processo: 'Backup',
  score: 14,
  tier: 'Tier 1 (Crítico)',
  timestamp: '2026-05-06T17:48:14.000Z',
  respondente: 'fulano@fortestecnologia.com.br',
  reguaVersao: 3,
});

test('resposta de BIA vira uma medição com os campos do livro', () => {
  const m = medicaoDeRespostaBia('resp-1', respostaOk());
  assert.strictEqual(m.sujeitoTipo, 'processo');
  assert.strictEqual(m.sujeitoId, 'TI||Backup');
  assert.strictEqual(m.area, 'TI');
  assert.strictEqual(m.fonte, FONTE.BIA);
  assert.strictEqual(m.escala, ESCALA.SCORE_BIA);
  assert.strictEqual(m.valor, 14);
  assert.strictEqual(m.coletadoEm, '2026-05-06T17:48:14.000Z');
  assert.strictEqual(m.origemId, 'resp-1');
});

// Sem isso, mudar os pesos reescreve o significado de toda a curva em silêncio.
test('a medição carrega a versão da régua que a pontuou', () => {
  assert.strictEqual(medicaoDeRespostaBia('r', respostaOk()).reguaVersao, 3);
  const semRegua = { ...respostaOk(), reguaVersao: undefined };
  assert.strictEqual(medicaoDeRespostaBia('r', semRegua).reguaVersao, 1, 'sem régua registrada, versão 1');
});

test('a classificação fica congelada no momento da medição', () => {
  // Se a regra de tier mudar depois, o ponto antigo continua dizendo o que
  // valia quando foi medido.
  assert.strictEqual(medicaoDeRespostaBia('r', respostaOk()).classificacao, 'Tier 1 (Crítico)');
});

test('validade do BIA é de um ano a partir da coleta', () => {
  const m = medicaoDeRespostaBia('r', respostaOk());
  const dias = Math.round((new Date(m.validoAte) - new Date(m.coletadoEm)) / 86400000);
  assert.strictEqual(dias, 365);
});

// Melhor não registrar do que registrar um ponto que a curva não sabe posicionar.
test('resposta sem data, sem score ou sem processo não vira medição', () => {
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), timestamp: null }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), timestamp: 'nao-e-data' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), score: undefined }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), score: 'abc' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), processo: '' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), area: '  ' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', null), null);
});

test('score zero é medição válida — diferente de não ter score', () => {
  const m = medicaoDeRespostaBia('r', { ...respostaOk(), score: 0 });
  assert.ok(m, 'score 0 é um valor medido, não ausência de valor');
  assert.strictEqual(m.valor, 0);
});

// A chave estavel e o que impede a mesma resposta virar dois pontos na curva
// se o gatilho rodar de novo — Cloud Functions nao garante execucao unica.
test('a mesma resposta sempre gera o mesmo id de medição', () => {
  assert.strictEqual(idDaMedicao(FONTE.BIA, 'resp-1'), idDaMedicao(FONTE.BIA, 'resp-1'));
  assert.notStrictEqual(idDaMedicao(FONTE.BIA, 'resp-1'), idDaMedicao(FONTE.BIA, 'resp-2'));
  assert.notStrictEqual(idDaMedicao(FONTE.BIA, 'x'), idDaMedicao(FONTE.INDICADOR, 'x'));
});
