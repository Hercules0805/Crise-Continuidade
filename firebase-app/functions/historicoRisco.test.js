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

// ============================================================
// LINHA DO TEMPO POR ESCOPO (Relatorio Executivo de Riscos, 20/10/2026)
// ============================================================

test('serieMensal: fim de cada mes, novos e saidos, so os ids do escopo e marcos do periodo', () => {
  const insumos = {
    medicoesRisco: [
      medicao({ sujeitoId: 'r1', sujeitoRotulo: 'Ransomware', area: 'TI', valor: 10, coletadoEm: '2026-08-05T10:00:00Z' }),
      medicao({ sujeitoId: 'r1', sujeitoRotulo: 'Ransomware', area: 'TI', valor: 20, coletadoEm: '2026-10-02T10:00:00Z' }),
      medicao({ sujeitoId: 'r2', sujeitoRotulo: 'Fraude', area: 'Financeiro', valor: 5, coletadoEm: '2026-09-15T10:00:00Z' }),
      medicao({ sujeitoId: 'r2', sujeitoRotulo: 'Fraude', area: 'Financeiro', valor: 5, classificacao: 'Encerrado', coletadoEm: '2026-10-10T10:00:00Z' }),
    ],
    vinculosPorRiscoId: {}, processosPorId: {}, criticidadePorFornecedor: {},
  };
  const peso = HR.PESO_PADRAO;
  const tudo = HR.serieMensal(insumos, { meses: 3, mesAtual: '2026-10', agoraISO: '2026-10-20T12:00:00Z' });
  assert.deepStrictEqual(tudo.pontos.map((p) => p.mes), ['2026-08', '2026-09', '2026-10']);
  assert.deepStrictEqual(tudo.pontos.map((p) => p.carga), [10 * peso, (10 + 5) * peso, 20 * peso]);
  assert.deepStrictEqual(tudo.pontos.map((p) => [p.novos, p.sairam]), [[1, 0], [1, 0], [0, 1]]);
  assert.deepStrictEqual(tudo.pontos[1].areas.map((a) => [a.area, a.novos]), [['TI', 0], ['Financeiro', 1]].sort((x, y) => (y[0] === 'TI') - (x[0] === 'TI')));
  assert.strictEqual(tudo.marcos[0].titulo, 'Ransomware', 'o que mais mexeu na carga no periodo');
  const ti = HR.serieMensal(insumos, { meses: 3, mesAtual: '2026-10', agoraISO: '2026-10-20T12:00:00Z', idsFiltro: ['r1'] });
  assert.deepStrictEqual(ti.pontos.map((p) => p.carga), [10 * peso, 10 * peso, 20 * peso], 'so o risco do escopo');
  assert.ok(ti.marcos.every((m) => m.riscoId === 'r1'));
  const vazio = HR.serieMensal(insumos, { meses: 2, mesAtual: '2026-07', agoraISO: '2026-07-20T12:00:00Z' });
  assert.deepStrictEqual(vazio.pontos.map((p) => p.carga), [0, 0], 'mes sem medicao: zero riscos contados');
});

// ---- Processo renomeado / resposta com processoId (21/10/2026) ----
test('processo renomeado continua com o score do BIA pelo nome antigo (nomesAnteriores)', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento Novo', nomesAnteriores: ['Financeiro||Faturamento'] }];
  const respostasBia = [{ area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-09-10T00:00:00.000Z' }];
  const porId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  assert.strictEqual(porId.p1.score, 14);
});

test('resposta com processoId casa pelo id e vence a mais antiga por nome', () => {
  const processosRaw = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
  const respostasBia = [
    { area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-09-01T00:00:00.000Z' },
    { area: 'Outra', processo: 'Outro nome', processoId: 'p1', score: 5, timestamp: '2026-09-20T00:00:00.000Z' },
  ];
  const porId = HR.resolverProcessosComBia(processosRaw, respostasBia);
  assert.strictEqual(porId.p1.score, 5);
  assert.deepStrictEqual(HR.chavesBiaDoProcesso({ area: 'A', processo: 'B', nomesAnteriores: ['A||X', 'lixo', 'A||B'] }), ['A||B', 'A||X']);
});

// --- Criticidade do fornecedor: formato {score, scoreMaximo, automatica} (29/10/2026) ---
test('pesoPorCriticidadeFornecedor: numero antigo usa os cortes fixos; objeto usa corte proporcional', () => {
  assert.strictEqual(HR.pesoPorCriticidadeFornecedor(13), 3);
  assert.strictEqual(HR.pesoPorCriticidadeFornecedor(null), null);
  // 10 de 12 = 83% -> Alta (com o corte fixo 13 seria Media)
  assert.strictEqual(HR.pesoPorCriticidadeFornecedor({ score: 10, scoreMaximo: 12 }), 3);
  assert.strictEqual(HR.pesoPorCriticidadeFornecedor({ score: 1, scoreMaximo: 18 }), 1);
  assert.strictEqual(HR.pesoPorCriticidadeFornecedor({ score: null, scoreMaximo: 18 }), null);
});

test('criticidade automatica (processo Tier 1) pesa 3 no risco do fornecedor', () => {
  const crit = { f1: { score: 1, scoreMaximo: 18, automatica: true } };
  assert.strictEqual(HR.pesoDoRisco({ fornecedor: 'f1' }, {}, crit), 3);
});

test('fornecedoresDeProcessoCritico: direto e via Servico contam; Tier 2 e processo fora da Continuidade nao', () => {
  const dependencias = [
    { id: 'fd', categoria: 'Fornecedores', nome: 'Direto' },
    { id: 'fs', categoria: 'Fornecedores', nome: 'Via servico' },
    { id: 'f2', categoria: 'Fornecedores', nome: 'So Tier 2' },
    { id: 'fx', categoria: 'Fornecedores', nome: 'Fora da continuidade' },
  ];
  const servicos = [{ id: 's1', nome: 'SRV-01', dependenciaItens: [{ categoria: 'Fornecedores', id: 'fs', nome: 'Via servico' }] }];
  const processosPorId = {
    p1: { id: 'p1', processo: 'Folha', avaliado: true, score: 15, dependenciaItens: [{ categoria: 'Fornecedores', id: 'fd', nome: 'Direto' }, { categoria: 'Serviços', id: 's1', nome: 'SRV-01' }] },
    p2: { id: 'p2', processo: 'Compras', avaliado: true, score: 8, dependenciaItens: [{ categoria: 'Fornecedores', id: 'f2', nome: 'So Tier 2' }] },
    p3: { id: 'p3', processo: 'Interno', avaliado: true, score: 15, continuidade: false, dependenciaItens: [{ categoria: 'Fornecedores', id: 'fx', nome: 'Fora da continuidade' }] },
  };
  const ids = HR.fornecedoresDeProcessoCritico(processosPorId, servicos, dependencias);
  assert.deepStrictEqual([...ids].sort(), ['fd', 'fs']);
});
