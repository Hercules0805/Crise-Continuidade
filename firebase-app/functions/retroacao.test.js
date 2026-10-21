const { test } = require('node:test');
const assert = require('node:assert');
const { planoRetroativo } = require('./retroacao');
const retratoRisco = require('./retratoRisco');

const med = (riscoId, coletadoEm, extra) => Object.assign({
  sujeitoTipo: 'risco', sujeitoId: riscoId, fonte: 'risco', valor: 12, valorFinanceiro: 1000, area: 'TI',
  probabilidade: 'Alta', impacto: 'Moderado', classificacao: 'Em Tratamento', coletadoEm,
}, extra);

test('planoRetroativo: inicio pela identificacao; vulnerabilidade usa a deteccao se mais antiga; copia a primeira medicao', () => {
  const riscos = [
    { id: 'r1', titulo: 'Manual antigo', dataIdentificacao: '2026-02-01', origem: 'Manual' },
    { id: 'r2', titulo: 'De vulnerabilidade', dataIdentificacao: '2026-10-20', origem: 'Vulnerabilidade', vulnerabilidadeId: 'v1' },
    { id: 'r3', titulo: 'Ja comeca na identificacao', dataIdentificacao: '2026-09-20', origem: 'Manual' },
    { id: 'r4', titulo: 'Encerrado na primeira', dataIdentificacao: '2026-01-10', origem: 'Manual' },
    { id: 'r5', titulo: 'Sem medicao', dataIdentificacao: '2026-01-10', origem: 'Manual' },
  ];
  const vulns = { v1: { dataDeteccao: '2026-03-15' } };
  const medicoes = {
    r1: [med('r1', '2026-10-01T10:00:00.000Z', { valor: 20 }), med('r1', '2026-09-16T10:00:00.000Z')],
    r2: [med('r2', '2026-10-20T10:00:00.000Z')],
    r3: [med('r3', '2026-09-20T08:00:00.000Z')],
    r4: [med('r4', '2026-09-16T10:00:00.000Z', { classificacao: 'Encerrado' })],
  };
  const p = planoRetroativo(riscos, vulns, medicoes);
  assert.deepStrictEqual(p.medicoes.map((x) => [x.riscoId, x.dados.coletadoEm]), [['r1', '2026-02-01T15:00:00.000Z'], ['r2', '2026-03-15T15:00:00.000Z']]);
  const r1 = p.medicoes[0].dados;
  assert.strictEqual(r1.valor, 12, 'copia a PRIMEIRA medicao (16/09), nao a mais recente');
  assert.strictEqual(r1.classificacao, 'Identificado');
  assert.strictEqual(r1.retroativa, true);
  assert.strictEqual(r1.retroativaDe, '2026-09-16T10:00:00.000Z');
  assert.strictEqual(p.medicoes[0].id, 'risco__r1__2026-02-01T15:00:00.000Z', 'id estavel: rodar de novo nao duplica');
  assert.deepStrictEqual(p.correcoesRisco, [{ id: 'r2', dataIdentificacao: '2026-03-15', antes: '2026-10-20' }]);
  assert.deepStrictEqual(p.resumo, { riscos: 5, retroativas: 2, semMedicao: 1, encerradoNaPrimeira: 1, jaNoInicio: 1, correcoesDeData: 1 });
  // Idempotencia: com a retroativa ja gravada, nada novo.
  const depois = planoRetroativo(riscos, vulns, Object.assign({}, medicoes, {
    r1: medicoes.r1.concat([p.medicoes[0].dados]), r2: medicoes.r2.concat([p.medicoes[1].dados]),
  }));
  assert.strictEqual(depois.medicoes.length, 0);
});

test('diasParaRegravar: medicao recente datada no passado regrava do dia dela ate ontem; limite de 400 dias', () => {
  const agora = '2026-10-21T09:00:00.000Z';
  assert.deepStrictEqual(retratoRisco.diasParaRegravar([med('r1', '2026-10-21T08:00:00.000Z', { registradoEm: agora })], agora), [], 'medicao de hoje: o retrato de hoje basta');
  assert.deepStrictEqual(retratoRisco.diasParaRegravar([med('r1', '2026-10-17T15:00:00.000Z', { registradoEm: '2026-10-21T08:30:00.000Z' })], agora),
    ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
  assert.deepStrictEqual(retratoRisco.diasParaRegravar([med('r1', '2026-10-01T15:00:00.000Z', { registradoEm: '2026-10-18T08:30:00.000Z' })], agora), [], 'registrada ha mais de 26 h: ja foi tratada');
  const longe = retratoRisco.diasParaRegravar([med('r1', '2024-01-01T15:00:00.000Z', { registradoEm: agora })], agora);
  assert.strictEqual(longe.length, retratoRisco.LIMITE_DIAS_REGRAVAR);
  assert.strictEqual(longe[longe.length - 1], '2026-10-20');
});

test('inicioDoLivro: a medicao mais antiga que nao e retroativa', () => {
  assert.strictEqual(retratoRisco.inicioDoLivro([
    med('r1', '2026-02-01T15:00:00.000Z', { retroativa: true }),
    med('r1', '2026-09-15T10:00:00.000Z'),
    med('r2', '2026-09-20T10:00:00.000Z'),
  ]), '2026-09-15');
  assert.strictEqual(retratoRisco.inicioDoLivro([]), null);
});
