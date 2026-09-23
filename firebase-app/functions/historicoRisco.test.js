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

test('Excluído fica fora, mesma regra de Encerrado -- risco apagado para de contar', () => {
  const r = reconstruir([medicao({ classificacao: 'Excluído' })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.foraPorStatus, 1);
});

test('risco excluido DEPOIS da data alvo ainda contava naquele dia (fechamento nao reescreve o passado)', () => {
  const medicoes = [
    medicao({ classificacao: 'Identificado', valor: 6, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ classificacao: 'Excluído', valor: 6, coletadoEm: '2026-09-25T00:00:00.000Z' }),
  ];
  const r = reconstruir(medicoes, '2026-09-15T00:00:00.000Z');
  assert.strictEqual(r.empresa.contados, 1, 'em 15/09 o risco ainda nao tinha sido excluido');
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
// IMPACTO FINANCEIRO (22/09/2026) — soma em R$, SEM peso de Tier/criticidade
// ============================================================

test('impacto financeiro do risco soma na empresa e na area, sem ponderar pelo peso', () => {
  const r = reconstruir(
    [medicao({ valor: 6, valorFinanceiro: 50000 })],
    '2026-09-20T00:00:00.000Z',
    { r1: { processoId: 'p1', area: 'Financeiro' } },
    { p1: { avaliado: true, score: 14 } } // Tier 1, peso 3 -- nao deve afetar o financeiro
  );
  assert.strictEqual(r.empresa.impactoFinanceiro, 50000, 'peso 3 nao multiplica o valor em R$');
  assert.strictEqual(r.areas[0].impactoFinanceiro, 50000);
});

test('risco sem valorFinanceiro (medicao antiga ou sem estimativa) conta em semImpactoFinanceiro, mas nao para de contar em carga/contados', () => {
  const r = reconstruir([medicao({ valor: 6 })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.empresa.impactoFinanceiro, 0);
  assert.strictEqual(r.semImpactoFinanceiro, 1);
  assert.strictEqual(r.empresa.contados, 1, 'sem estimativa financeira nao e a mesma coisa que sem avaliacao de risco');
  assert.strictEqual(r.empresa.carga, 6 * 2, 'a carga (score x peso) continua contando normalmente');
});

test('valorFinanceiro zero e uma estimativa real (zero de verdade), nao conta em semImpactoFinanceiro', () => {
  const r = reconstruir([medicao({ valor: 6, valorFinanceiro: 0 })], '2026-09-20T00:00:00.000Z');
  assert.strictEqual(r.semImpactoFinanceiro, 0, 'estimou e deu zero -- diferente de nao ter estimado');
  assert.strictEqual(r.empresa.impactoFinanceiro, 0);
});

test('impacto financeiro da empresa e a soma das areas, mesma garantia da carga', () => {
  const medicoes = [
    medicao({ sujeitoId: 'r1', area: 'Financeiro', valor: 6, valorFinanceiro: 10000 }),
    medicao({ sujeitoId: 'r2', area: 'TI', valor: 9, valorFinanceiro: 25000 }),
  ];
  const r = reconstruir(medicoes, '2026-09-20T00:00:00.000Z');
  const somaAreas = r.areas.reduce((t, a) => t + a.impactoFinanceiro, 0);
  assert.strictEqual(r.empresa.impactoFinanceiro, 35000);
  assert.strictEqual(r.empresa.impactoFinanceiro, somaAreas);
});

test('acrescentar um risco com valor financeiro so aumenta o total, nunca diminui', () => {
  const base = [medicao({ sujeitoId: 'r1', valor: 6, valorFinanceiro: 10000, coletadoEm: '2026-09-05T00:00:00.000Z' })];
  const comMais = base.concat([medicao({ sujeitoId: 'r2', valor: 3, valorFinanceiro: 5000, coletadoEm: '2026-09-06T00:00:00.000Z' })]);
  const antes = reconstruir(base, '2026-09-20T00:00:00.000Z').empresa.impactoFinanceiro;
  const depois = reconstruir(comMais, '2026-09-20T00:00:00.000Z').empresa.impactoFinanceiro;
  assert.ok(depois > antes);
});

// ============================================================
// resolverProcessosComBia — o score/Tier do processo vem de respostas_bia,
// nao do documento de /processos (bug corrigido em 22/09/2026: sem este
// join, todo processo caia em Pendente/peso 2 mesmo com BIA respondido)
// ============================================================

test('processo sem nenhuma resposta_bia fica Pendente (nao avaliado)', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const porId = HR.resolverProcessosComBia(processosRaw, []);
  assert.strictEqual(porId.p1.avaliado, false);
  assert.strictEqual(porId.p1.score, 0);
  assert.strictEqual(HR.tierDoProcesso(porId.p1), HR.TIER.PENDENTE);
});

test('processo com resposta_bia resolve score/avaliado e o Tier certo', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const respostasBia = [{ area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-09-10T00:00:00.000Z' }];
  const porId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  assert.strictEqual(porId.p1.avaliado, true);
  assert.strictEqual(porId.p1.score, 14);
  assert.strictEqual(HR.tierDoProcesso(porId.p1), HR.TIER.T1, '14 >= 12 e Tier 1');
});

test('duas respostas_bia do mesmo processo: vence a mais recente por timestamp', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const respostasBia = [
    { area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-09-01T00:00:00.000Z' },
    { area: 'Financeiro', processo: 'Faturamento', score: 3, timestamp: '2026-09-15T00:00:00.000Z' },
  ];
  const porId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  assert.strictEqual(porId.p1.score, 3, 'a resposta de 15/09 e mais recente que a de 01/09');
});

test('processo com tierManual mas sem resposta_bia preserva o tierManual', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento', tierManual: HR.TIER.T2 }];
  const porId = HR.resolverProcessosComBia(processosRaw, []);
  assert.strictEqual(HR.tierDoProcesso(porId.p1), HR.TIER.T2);
});

test('respostas_bia de outro processo nao vaza pro processo errado', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const respostasBia = [{ area: 'TI', processo: 'Outro', score: 14, timestamp: '2026-09-10T00:00:00.000Z' }];
  const porId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  assert.strictEqual(porId.p1.avaliado, false);
});

test('reconstrucao ponta a ponta: processo com BIA respondido pesa pelo Tier real, nao Pendente', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const respostasBia = [{ area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-09-10T00:00:00.000Z' }];
  const processosPorId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  const r = HR.reconstruirEmData(
    [medicao({ valor: 6 })],
    { r1: { processoId: 'p1', area: 'Financeiro' } },
    processosPorId,
    {},
    '2026-09-20T00:00:00.000Z'
  );
  assert.strictEqual(r.empresa.carga, 6 * 3, 'Tier 1 pesa 3, nao 2 (Pendente)');
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
