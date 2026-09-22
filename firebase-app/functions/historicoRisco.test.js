const { test } = require('node:test');
const assert = require('node:assert');
const HR = require('./historicoRisco');

const medicao = (extra) => Object.assign({
  sujeitoTipo: 'risco',
  sujeitoId: 'r1',
  area: 'Financeiro',
  valor: 6,
  classificacao: 'Identificado',
  coletadoEm: '2026-09-10T12:00:00.000Z',
}, extra);

const reconstruir = (medicoes, dataAlvo, vinculos, processos, criticidade) =>
  HR.reconstruirEmData(medicoes, vinculos || {}, processos || {}, criticidade || {}, dataAlvo);

// ============================================================
// SO A MEDICAO MAIS RECENTE POR RISCO, ATE A DATA ALVO, CONTA
// ============================================================

test('usa a medicao mais recente do risco, nao a primeira', () => {
  const medicoes = [
    medicao({ valor: 3, coletadoEm: '2026-09-01T00:00:00.000Z' }),
    medicao({ valor: 9, coletadoEm: '2026-09-15T00:00:00.000Z' }),
  ];
  const r = reconstruir(medicoes, '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.carga, 9 * 2); // score 9 x peso padrao 2 (sem vinculo)
});

test('ignora medicao POSTERIOR a data alvo — e isso que faz a foto ser do passado', () => {
  const medicoes = [
    medicao({ valor: 3, coletadoEm: '2026-09-01T00:00:00.000Z' }),
    medicao({ valor: 9, coletadoEm: '2026-09-25T00:00:00.000Z' }), // depois da data alvo
  ];
  const r = reconstruir(medicoes, '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.carga, 3 * 2, 'em 20/09 so existia a medicao de score 3');
});

test('risco criado depois da data alvo nao aparece', () => {
  const medicoes = [medicao({ coletadoEm: '2026-09-25T00:00:00.000Z' })];
  const r = reconstruir(medicoes, '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.empresa.carga, 0);
});

test('empate exato de data e horario entra (<=, nao <)', () => {
  const medicoes = [medicao({ coletadoEm: '2026-09-20T12:00:00.000Z' })];
  const r = reconstruir(medicoes, '2026-09-20T12:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 1);
});

// ============================================================
// STATUS: SO ENCERRADO SAI (mesma regra do consolidado de hoje)
// ============================================================

test('Encerrado fica fora, mas conta em foraPorStatus', () => {
  const r = reconstruir([medicao({ classificacao: 'Encerrado' })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.foraPorStatus, 1);
});

test('Aceito continua contando', () => {
  const r = reconstruir([medicao({ classificacao: 'Aceito' })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 1);
});

test('um risco que fechou DEPOIS da data alvo ainda contava naquele dia', () => {
  const medicoes = [
    medicao({ classificacao: 'Identificado', valor: 6, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ classificacao: 'Encerrado', valor: 6, coletadoEm: '2026-09-25T00:00:00.000Z' }),
  ];
  const r = reconstruir(medicoes, '2026-09-15T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 1, 'em 15/09 o risco ainda estava aberto');
});

// ============================================================
// AREA: vem do vinculo atual quando existe, senao da propria medicao
// ============================================================

test('area vem do vinculo atual quando disponivel', () => {
  const r = reconstruir(
    [medicao({ area: 'Financeiro' })],
    '2026-09-20T00:00:00.000Z',
    { r1: { area: 'TI', processoId: null } }
  );
  assert.strictEqual(r.areas[0].area, 'TI');
});

test('sem vinculo atual, cai na area gravada na propria medicao', () => {
  const r = reconstruir([medicao({ area: 'Financeiro' })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.areas[0].area, 'Financeiro');
  assert.strictEqual(r.semVinculo, 1);
});

test('sem area nenhuma, cai no corporativo', () => {
  const r = reconstruir([medicao({ area: '' })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.areas[0].area, HR.AREA_CORPORATIVA);
});

// ============================================================
// PESO: Tier do processo OU criticidade do fornecedor, do estado ATUAL
// ============================================================

test('risco de processo Tier 1 pesa 3', () => {
  const r = reconstruir(
    [medicao({ valor: 6 })],
    '2026-09-20T00:00:00.000Z',
    { r1: { processoId: 'p1', area: 'Financeiro' } },
    { p1: { avaliado: true, score: 14 } } // >= 12 = Tier 1
  );
  assert.strictEqual(r.empresa.carga, 6 * 3);
});

test('risco de processo Pendente pesa 2 (padrao), nao zero', () => {
  const r = reconstruir(
    [medicao({ valor: 6 })],
    '2026-09-20T00:00:00.000Z',
    { r1: { processoId: 'p1', area: 'Financeiro' } },
    { p1: { avaliado: false } }
  );
  assert.strictEqual(r.empresa.carga, 6 * 2);
});

test('risco de fornecedor usa a criticidade do fornecedor, nao o Tier', () => {
  const r = reconstruir(
    [medicao({ valor: 6, area: '' })],
    '2026-09-20T00:00:00.000Z',
    { r1: { fornecedor: 'f1', area: '' } },
    {},
    { f1: 15 } // >=13 = Alta = peso 3
  );
  assert.strictEqual(r.empresa.carga, 6 * 3);
});

test('fornecedor sem criticidade avaliada pesa padrao (2)', () => {
  const r = reconstruir(
    [medicao({ valor: 6, area: '' })],
    '2026-09-20T00:00:00.000Z',
    { r1: { fornecedor: 'f1', area: '' } }
  );
  assert.strictEqual(r.empresa.carga, 6 * 2);
});

// ============================================================
// SEM SCORE (probabilidade/impacto invalidos na medicao) — nao entra na carga
// ============================================================

test('valor zero ou invalido conta como sem avaliacao, nao como carga zero disfarcada', () => {
  const r = reconstruir([medicao({ valor: NaN })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.semAvaliacao, 1);
});

// ============================================================
// EMPRESA = SOMA DAS AREAS (mesma garantia do consolidado de hoje)
// ============================================================

test('carga da empresa e a soma das cargas das areas', () => {
  const medicoes = [
    medicao({ sujeitoId: 'r1', area: 'Financeiro', valor: 6 }),
    medicao({ sujeitoId: 'r2', area: 'TI', valor: 9 }),
  ];
  const r = reconstruir(medicoes, '2026-09-20T00:00:00.000Z');
  const somaAreas = r.areas.reduce((t, a) => t + a.carga, 0);
  assert.strictEqual(r.empresa.carga, somaAreas);
});

// ============================================================
// MONOTONICIDADE NO TEMPO — a mesma licao da carga de hoje, aplicada a curva:
// um retrato mais recente com um risco a mais nunca pode ficar mais baixo
// so por causa desse acrescimo, se nada mais mudou.
// ============================================================

test('acrescentar um segundo risco so aumenta a carga do retrato', () => {
  const base = [medicao({ sujeitoId: 'r1', valor: 6, coletadoEm: '2026-09-05T00:00:00.000Z' })];
  const comMais = base.concat([medicao({ sujeitoId: 'r2', valor: 3, coletadoEm: '2026-09-06T00:00:00.000Z' })]);
  const cargaAntes = reconstruir(base, '2026-09-20T00:00:00.000Z').empresa.carga;
  const cargaDepois = reconstruir(comMais, '2026-09-20T00:00:00.000Z').empresa.carga;
  assert.ok(cargaDepois > cargaAntes);
});
