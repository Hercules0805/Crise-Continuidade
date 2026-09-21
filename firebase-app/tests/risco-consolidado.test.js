const test = require('node:test');
const assert = require('node:assert');
const RC = require('../public/risco-consolidado.js');

// Processos de apoio: um de cada Tier, mais um nunca avaliado.
const PROCESSOS = [
  { id: 'p1', processo: 'Faturamento', area: 'Financeiro', avaliado: true, score: 14 },  // Tier 1
  { id: 'p2', processo: 'Compras', area: 'Suprimentos', avaliado: true, score: 7 },      // Tier 2
  { id: 'p3', processo: 'Arquivo', area: 'Administrativo', avaliado: true, score: 2 },   // Tier 3
  { id: 'p4', processo: 'Onboarding', area: 'RH' },                                      // Pendente
];

const risco = (extra) => Object.assign({
  area: 'TI', probabilidade: 'Alta', impacto: 'Crítico', status: 'Identificado',
}, extra);

test('os processos de apoio estao nos Tiers que o teste assume', () => {
  const Criticidade = require('../public/criticidade.js');
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[0]), Criticidade.TIER.T1);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[1]), Criticidade.TIER.T2);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[2]), Criticidade.TIER.T3);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[3]), Criticidade.TIER.PENDENTE);
});

test('sem risco nenhum o numero e 0 e a faixa diz que nada foi registrado', () => {
  const r = RC.consolidar([], PROCESSOS);
  assert.strictEqual(r.empresa.numero, 0);
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.empresa.faixa.rotulo, 'Sem risco registrado');
  assert.deepStrictEqual(r.areas, []);
});

test('um unico risco maximo da 100', () => {
  const r = RC.consolidar([risco({ processoId: 'p1' })], PROCESSOS);
  assert.strictEqual(r.empresa.numero, 100);
  assert.strictEqual(r.empresa.faixa.rotulo, 'Crítico');
});

test('o menor risco possivel da 8, nao 0 — ausencia tem que ser distinguivel', () => {
  const r = RC.consolidar([risco({ probabilidade: 'Baixa', impacto: 'Baixo' })], PROCESSOS);
  assert.strictEqual(r.empresa.numero, 8);
  assert.notStrictEqual(r.empresa.faixa.rotulo, 'Sem risco registrado');
});

test('risco em processo Tier 1 pesa 3 vezes o de Tier 3', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'p1' }, { p1: PROCESSOS[0] }), 3);
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'p2' }, { p2: PROCESSOS[1] }), 2);
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'p3' }, { p3: PROCESSOS[2] }), 1);
});

test('risco corporativo (sem processo) pesa 2, o meio da escala', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: null }, {}), RC.PESO_PADRAO);
  assert.strictEqual(RC.PESO_PADRAO, 2);
});

test('risco em processo ainda Pendente pesa 2 — falta de avaliacao nao puxa o numero', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'p4' }, { p4: PROCESSOS[3] }), 2);
});

test('processo apagado ou id que nao existe mais cai no peso padrao, sem quebrar', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'nao-existe' }, {}), RC.PESO_PADRAO);
});

test('a ponderacao muda o resultado: o risco do Tier 1 domina o do Tier 3', () => {
  const grave = risco({ processoId: 'p1', probabilidade: 'Alta', impacto: 'Crítico' });   // 12, peso 3
  const leve = risco({ processoId: 'p3', probabilidade: 'Baixa', impacto: 'Baixo' });     // 1, peso 1
  const r = RC.consolidar([grave, leve], PROCESSOS);
  // (12*3 + 1*1) / (3+1) = 9.25 -> 77
  assert.strictEqual(r.empresa.numero, 77);
  // Media simples daria (12+1)/2 = 6.5 -> 54. A ponderacao existe para isso.
  assert.notStrictEqual(r.empresa.numero, 54);
});

test('risco Encerrado fica fora da conta e e contado em foraPorStatus', () => {
  const r = RC.consolidar([
    risco({ status: 'Encerrado', probabilidade: 'Alta', impacto: 'Crítico' }),
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.foraPorStatus, 1);
  assert.strictEqual(r.empresa.numero, 8);
});

test('risco Aceito ENTRA na conta — decisao 21/09/2026', () => {
  const r = RC.consolidar([risco({ status: 'Aceito', probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.empresa.numero, 100);
  assert.strictEqual(r.foraPorStatus, 0);
});

test('todos os status de trabalho entram na conta', () => {
  ['Identificado', 'Em Análise', 'Em Avaliação', 'Em Tratamento', 'Em Monitoramento', 'Aceito'].forEach((s) => {
    assert.strictEqual(RC.contaNoConsolidado({ status: s }), true, s + ' deveria contar');
  });
  assert.strictEqual(RC.contaNoConsolidado({ status: 'Encerrado' }), false);
});

test('risco sem status nenhum conta como aberto, nao desaparece', () => {
  assert.strictEqual(RC.contaNoConsolidado({}), true);
});

test('risco sem probabilidade ou sem impacto nao entra, mas aparece em semAvaliacao', () => {
  const r = RC.consolidar([
    risco({ probabilidade: '', impacto: 'Crítico' }),
    risco({ probabilidade: 'Alta', impacto: '' }),
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.empresa.semAvaliacao, 2);
  assert.strictEqual(r.areas[0].semAvaliacao, 2);
});

test('escala fora do padrao (risco importado de PCN) nao entra como zero', () => {
  assert.strictEqual(RC.scoreDoRisco({ probabilidade: 'Medio', impacto: 'Grave' }), null);
  const r = RC.consolidar([risco({ probabilidade: 'Medio', impacto: 'Grave' })], PROCESSOS);
  assert.strictEqual(r.empresa.numero, 0);
  assert.strictEqual(r.empresa.semAvaliacao, 1);
});

test('area com risco so sem avaliacao aparece na lista, com numero 0 e o aviso', () => {
  const r = RC.consolidar([risco({ area: 'Jurídico', probabilidade: '', impacto: '' })], PROCESSOS);
  assert.strictEqual(r.areas.length, 1);
  assert.strictEqual(r.areas[0].area, 'Jurídico');
  assert.strictEqual(r.areas[0].numero, 0);
  assert.strictEqual(r.areas[0].semAvaliacao, 1);
});

test('risco que nasceu sem area (desvio de indicador) vai para Corporativo, e nao se perde', () => {
  const r = RC.consolidar([risco({ area: '', probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS);
  assert.strictEqual(r.areas.length, 1);
  assert.strictEqual(r.areas[0].area, RC.AREA_CORPORATIVA);
  assert.strictEqual(r.empresa.contados, 1);
});

test('o numero da empresa e a media de todos os riscos, nao a media das areas', () => {
  // Area A: 1 risco de 12. Area B: 3 riscos de 1. Todos corporativos (peso 2).
  const riscos = [
    risco({ area: 'A', probabilidade: 'Alta', impacto: 'Crítico' }),
    risco({ area: 'B', probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ area: 'B', probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ area: 'B', probabilidade: 'Baixa', impacto: 'Baixo' }),
  ];
  const r = RC.consolidar(riscos, PROCESSOS);
  // (12 + 1 + 1 + 1) / 4 = 3.75 -> 31
  assert.strictEqual(r.empresa.numero, 31);
  // Media das areas seria (100 + 8) / 2 = 54. Nao e isso.
  assert.notStrictEqual(r.empresa.numero, 54);
});

test('as areas voltam ordenadas do maior risco para o menor', () => {
  const r = RC.consolidar([
    risco({ area: 'Baixa', probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ area: 'Alta', probabilidade: 'Alta', impacto: 'Crítico' }),
    risco({ area: 'Meio', probabilidade: 'Média', impacto: 'Moderado' }),
  ], PROCESSOS);
  assert.deepStrictEqual(r.areas.map((a) => a.area), ['Alta', 'Meio', 'Baixa']);
});

test('as faixas do consolidado batem com as do risco individual', () => {
  // 9 de 12 = Crítico -> 75; 6 = Alto -> 50; 3 = Moderado -> 25.
  assert.strictEqual(RC.paraEscala100(9), 75);
  assert.strictEqual(RC.paraEscala100(6), 50);
  assert.strictEqual(RC.paraEscala100(3), 25);
  assert.strictEqual(RC.faixaConsolidado(75).rotulo, RC.faixaScore(9).rotulo);
  assert.strictEqual(RC.faixaConsolidado(50).rotulo, RC.faixaScore(6).rotulo);
  assert.strictEqual(RC.faixaConsolidado(25).rotulo, RC.faixaScore(3).rotulo);
  assert.strictEqual(RC.faixaConsolidado(24).rotulo, 'Baixo');
  assert.strictEqual(RC.faixaConsolidado(74).rotulo, 'Alto');
});

test('o pior risco volta junto, para a tela poder mostrar media e pior caso', () => {
  const r = RC.consolidar([
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ probabilidade: 'Alta', impacto: 'Crítico' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.piorScore, 12);
});

test('lista nula ou undefined nao quebra', () => {
  assert.strictEqual(RC.consolidar(null, null).empresa.numero, 0);
  assert.strictEqual(RC.consolidar(undefined, undefined).areas.length, 0);
});
