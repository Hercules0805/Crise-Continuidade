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

// --- Lancamento mensal de indicador ---
const { medicaoDeLancamento } = require('./medicoes');

const lancOk = () => ({
  indicadorId: 'ind-1',
  indicadorNome: '% de patches no prazo',
  mes: '2026-03',
  desempenho: 92,
  lancadoPor: 'analista@fortestecnologia.com.br',
});

test('lançamento vira medição posicionada no mês de referência', () => {
  const m = medicaoDeLancamento('ind-1__2026-03', lancOk());
  assert.strictEqual(m.sujeitoTipo, 'indicador');
  assert.strictEqual(m.valor, 92);
  assert.strictEqual(m.periodo, '2026-03');
  // A medição é sobre o mês, não sobre o instante em que alguém digitou.
  assert.strictEqual(m.coletadoEm, '2026-03-01T00:00:00.000Z');
});

test('indicador não pertence a área, então só admin lê a medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', lancOk()).area, '');
});

// O mes em formato livre era aceito e virava chave do historico, corrompendo
// o "ultimo mes". Na medicao, formato invalido nao entra na curva.
test('mês em formato livre não vira medição', () => {
  for (const mes of ['março/2026', 'jan-26', '2026', '2026-13', '2026-00', '']) {
    assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), mes }), null, `aceitou "${mes}"`);
  }
  assert.ok(medicaoDeLancamento('x', { ...lancOk(), mes: '2026-12' }));
});

test('lançamento sem desempenho não vira medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: null }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: 'abc' }), null);
  assert.ok(medicaoDeLancamento('x', { ...lancOk(), desempenho: 0 }), 'zero é valor medido');
});

test('validade do indicador é de 45 dias', () => {
  const m = medicaoDeLancamento('x', lancOk());
  const dias = Math.round((new Date(m.validoAte) - new Date(m.coletadoEm)) / 86400000);
  assert.strictEqual(dias, 45);
});

test('quem lançou fica registrado na medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', lancOk()).registradoPor, 'analista@fortestecnologia.com.br');
});

// Number(null) e Number('') valem ZERO em JavaScript. Sem guarda, um mes sem
// dado virava medicao de 0% — pior que a ausencia, porque 0% parece desempenho
// pessimo em vez de "nao medido".
test('ausência de valor não vira medição de zero', () => {
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: null }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: '' }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: undefined }), null);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: null }), null);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: '' }), null);
  // E zero de verdade continua sendo medição.
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: 0 }).valor, 0);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: 0 }).valor, 0);
});
