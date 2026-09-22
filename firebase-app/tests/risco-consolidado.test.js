const test = require('node:test');
const assert = require('node:assert');
const RC = require('../public/risco-consolidado.js');
const Criticidade = require('../public/criticidade.js');

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
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[0]), Criticidade.TIER.T1);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[1]), Criticidade.TIER.T2);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[2]), Criticidade.TIER.T3);
  assert.strictEqual(Criticidade.tierDoProcesso(PROCESSOS[3]), Criticidade.TIER.PENDENTE);
});

// ============================================================
// O TESTE QUE EXISTE POR CAUSA DE UM ERRO REAL
// ============================================================

test('ACRESCENTAR RISCO NUNCA BAIXA A CARGA — o defeito achado no teste de 21/09', () => {
  // Caso exato relatado: uma area com um risco maximo, e um risco menor entra.
  // Com media ponderada a area caia de 100 para 80. Com soma, nunca cai.
  const grave = risco({ processoId: 'p1', probabilidade: 'Alta', impacto: 'Crítico' });
  const menor = risco({ processoId: 'p2', probabilidade: 'Média', impacto: 'Moderado' });

  const antes = RC.consolidar([grave], PROCESSOS).empresa.carga;
  const depois = RC.consolidar([grave, menor], PROCESSOS).empresa.carga;

  assert.ok(depois > antes, `carga caiu ou empatou: ${antes} -> ${depois}`);
  assert.strictEqual(antes, 36);   // 12 x 3
  assert.strictEqual(depois, 44);  // 36 + (4 x 2)
});

test('monotonicidade: qualquer risco adicionado, de qualquer tamanho, so faz subir', () => {
  const base = [risco({ processoId: 'p1', probabilidade: 'Alta', impacto: 'Crítico' })];
  let anterior = RC.consolidar(base, PROCESSOS).empresa.carga;
  const adicionais = [
    { probabilidade: 'Baixa', impacto: 'Baixo', processoId: 'p3' },
    { probabilidade: 'Baixa', impacto: 'Baixo' },
    { probabilidade: 'Média', impacto: 'Alto', processoId: 'p2' },
    { probabilidade: 'Alta', impacto: 'Crítico', processoId: 'p1' },
    { probabilidade: 'Baixa', impacto: 'Moderado', area: 'Outra' },
  ];
  adicionais.forEach((extra, i) => {
    base.push(risco(extra));
    const agora = RC.consolidar(base, PROCESSOS).empresa.carga;
    assert.ok(agora > anterior, `risco ${i + 1} baixou a carga: ${anterior} -> ${agora}`);
    anterior = agora;
  });
});

test('encerrar risco baixa a carga — o numero tem que responder a melhora', () => {
  const a = risco({ probabilidade: 'Alta', impacto: 'Crítico' });
  const b = risco({ probabilidade: 'Alta', impacto: 'Crítico' });
  const cheia = RC.consolidar([a, b], PROCESSOS).empresa.carga;
  const parcial = RC.consolidar([a, Object.assign({}, b, { status: 'Encerrado' })], PROCESSOS).empresa.carga;
  assert.ok(parcial < cheia, `encerrar nao baixou: ${cheia} -> ${parcial}`);
});

test('reduzir probabilidade ou impacto de um risco baixa a carga', () => {
  const antes = RC.consolidar([risco({ probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS).empresa.carga;
  const depois = RC.consolidar([risco({ probabilidade: 'Baixa', impacto: 'Crítico' })], PROCESSOS).empresa.carga;
  assert.ok(depois < antes, `reduzir nao baixou: ${antes} -> ${depois}`);
});

// ============================================================
// A CONTA
// ============================================================

test('sem risco nenhum a carga e 0 e nao ha areas', () => {
  const r = RC.consolidar([], PROCESSOS);
  assert.strictEqual(r.empresa.carga, 0);
  assert.strictEqual(r.empresa.contados, 0);
  assert.strictEqual(r.empresa.piorScore, null);
  assert.deepStrictEqual(r.areas, []);
});

test('um risco soma score x peso, e o maximo por risco e 36', () => {
  assert.strictEqual(RC.cargaDoRisco({ probabilidade: 'Alta', impacto: 'Crítico', processoId: 'p1' }, { p1: PROCESSOS[0] }), 36);
  assert.strictEqual(RC.CARGA_MAXIMA_POR_RISCO, 36);
  assert.strictEqual(RC.cargaDoRisco({ probabilidade: 'Baixa', impacto: 'Baixo', processoId: 'p3' }, { p3: PROCESSOS[2] }), 1);
});

test('risco em processo Tier 1 soma 3 vezes o mesmo risco em Tier 3', () => {
  const mapa = { p1: PROCESSOS[0], p3: PROCESSOS[2] };
  const t1 = RC.cargaDoRisco({ probabilidade: 'Média', impacto: 'Alto', processoId: 'p1' }, mapa);
  const t3 = RC.cargaDoRisco({ probabilidade: 'Média', impacto: 'Alto', processoId: 'p3' }, mapa);
  assert.strictEqual(t1, t3 * 3);
});

test('risco corporativo (sem processo) pesa 2, o meio da escala', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: null }, {}), 2);
  assert.strictEqual(RC.PESO_PADRAO, 2);
});

test('risco em processo ainda Pendente pesa 2 — falta de avaliacao nao puxa o numero', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'p4' }, { p4: PROCESSOS[3] }), 2);
});

test('processo apagado ou id que nao existe mais cai no peso padrao, sem quebrar', () => {
  assert.strictEqual(RC.pesoDoRisco({ processoId: 'nao-existe' }, {}), RC.PESO_PADRAO);
});

test('A CARGA DA EMPRESA E A SOMA DAS AREAS — conferivel somando a coluna', () => {
  const riscos = [
    risco({ area: 'A', probabilidade: 'Alta', impacto: 'Crítico', processoId: 'p1' }),
    risco({ area: 'B', probabilidade: 'Média', impacto: 'Moderado' }),
    risco({ area: 'B', probabilidade: 'Baixa', impacto: 'Baixo', processoId: 'p3' }),
    risco({ area: 'C', probabilidade: 'Alta', impacto: 'Alto', processoId: 'p2' }),
  ];
  const r = RC.consolidar(riscos, PROCESSOS);
  const somaDasAreas = r.areas.reduce((t, a) => t + a.carga, 0);
  assert.strictEqual(r.empresa.carga, somaDasAreas);
});

// ============================================================
// O QUE ENTRA E O QUE FICA DE FORA
// ============================================================

test('risco Encerrado fica fora da soma e e contado em foraPorStatus', () => {
  const r = RC.consolidar([
    risco({ status: 'Encerrado', probabilidade: 'Alta', impacto: 'Crítico' }),
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.foraPorStatus, 1);
  assert.strictEqual(r.empresa.carga, 2);  // 1 x 2
});

test('risco Aceito ENTRA na soma — aceitar nao faz o risco desaparecer', () => {
  const r = RC.consolidar([risco({ status: 'Aceito', probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.empresa.carga, 24);  // 12 x 2 (corporativo)
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

test('escala fora do padrao (risco importado de PCN) nao entra como zero silencioso', () => {
  assert.strictEqual(RC.scoreDoRisco({ probabilidade: 'Medio', impacto: 'Grave' }), null);
  assert.strictEqual(RC.cargaDoRisco({ probabilidade: 'Medio', impacto: 'Grave' }, {}), null);
  const r = RC.consolidar([risco({ probabilidade: 'Medio', impacto: 'Grave' })], PROCESSOS);
  assert.strictEqual(r.empresa.carga, 0);
  assert.strictEqual(r.empresa.semAvaliacao, 1);
});

test('area com risco so sem avaliacao aparece na lista, com carga 0 e o aviso', () => {
  const r = RC.consolidar([risco({ area: 'Jurídico', probabilidade: '', impacto: '' })], PROCESSOS);
  assert.strictEqual(r.areas.length, 1);
  assert.strictEqual(r.areas[0].area, 'Jurídico');
  assert.strictEqual(r.areas[0].carga, 0);
  assert.strictEqual(r.areas[0].semAvaliacao, 1);
});

test('risco que nasceu sem area (desvio de indicador) vai para Corporativo, e nao se perde', () => {
  const r = RC.consolidar([risco({ area: '', probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS);
  assert.strictEqual(r.areas.length, 1);
  assert.strictEqual(r.areas[0].area, RC.AREA_CORPORATIVA);
  assert.strictEqual(r.empresa.contados, 1);
});

// ============================================================
// COMO O NUMERO SE LE: composicao e pior caso, nao faixa do total
// ============================================================

test('a composicao diz de que a carga e feita, por faixa', () => {
  const r = RC.consolidar([
    risco({ probabilidade: 'Alta', impacto: 'Crítico' }),   // 12 Crítico
    risco({ probabilidade: 'Alta', impacto: 'Alto' }),      // 9  Crítico
    risco({ probabilidade: 'Média', impacto: 'Alto' }),     // 6  Alto
    risco({ probabilidade: 'Média', impacto: 'Moderado' }), // 4  Moderado
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),    // 1  Baixo
  ], PROCESSOS);
  assert.deepStrictEqual(r.empresa.composicao, { 'Crítico': 2, 'Alto': 1, 'Moderado': 1, 'Baixo': 1 });
  assert.strictEqual(r.empresa.contados, 5);
});

test('vinte riscos moderados NAO empatam com uma catastrofe — o motivo de nao ter teto', () => {
  const moderados = Array.from({ length: 20 }, () => risco({ probabilidade: 'Média', impacto: 'Moderado' }));
  const catastrofe = [risco({ probabilidade: 'Alta', impacto: 'Crítico', processoId: 'p1' })];
  const cargaModerados = RC.consolidar(moderados, PROCESSOS).empresa.carga;
  const cargaCatastrofe = RC.consolidar(catastrofe, PROCESSOS).empresa.carga;
  assert.notStrictEqual(cargaModerados, cargaCatastrofe);
  // E a composicao permite distinguir os dois casos, que a carga sozinha nao faria.
  assert.strictEqual(RC.consolidar(moderados, PROCESSOS).empresa.composicao['Crítico'], 0);
  assert.strictEqual(RC.consolidar(catastrofe, PROCESSOS).empresa.composicao['Crítico'], 1);
});

test('o pior caso volta junto, com a faixa dele', () => {
  const r = RC.consolidar([
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ probabilidade: 'Alta', impacto: 'Crítico' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.piorScore, 12);
  assert.strictEqual(r.empresa.piorFaixa.rotulo, 'Crítico');
});

test('as faixas do risco individual seguem a regra de 1 a 12 de sempre', () => {
  assert.strictEqual(RC.faixaScore(12).rotulo, 'Crítico');
  assert.strictEqual(RC.faixaScore(9).rotulo, 'Crítico');
  assert.strictEqual(RC.faixaScore(8).rotulo, 'Alto');
  assert.strictEqual(RC.faixaScore(6).rotulo, 'Alto');
  assert.strictEqual(RC.faixaScore(5).rotulo, 'Moderado');
  assert.strictEqual(RC.faixaScore(3).rotulo, 'Moderado');
  assert.strictEqual(RC.faixaScore(2).rotulo, 'Baixo');
  assert.strictEqual(RC.faixaScore(1).rotulo, 'Baixo');
});

test('as areas voltam ordenadas da maior carga para a menor', () => {
  const r = RC.consolidar([
    risco({ area: 'Leve', probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ area: 'Pesada', probabilidade: 'Alta', impacto: 'Crítico' }),
    risco({ area: 'Meio', probabilidade: 'Média', impacto: 'Moderado' }),
  ], PROCESSOS);
  assert.deepStrictEqual(r.areas.map((a) => a.area), ['Pesada', 'Meio', 'Leve']);
});

test('lista nula ou undefined nao quebra', () => {
  assert.strictEqual(RC.consolidar(null, null).empresa.carga, 0);
  assert.strictEqual(RC.consolidar(undefined, undefined).areas.length, 0);
});

// ============================================================
// PESO DO RISCO DE FORNECEDOR (criticidade, 22/09/2026)
//
// Mesma ideia do Tier do BIA, mas pro risco que nao tem processo, so
// fornecedor. As duas escalas foram desenhadas pra caber no mesmo peso 1/2/3.
// ============================================================

const riscoForn = (extra) => Object.assign({
  area: '', probabilidade: 'Alta', impacto: 'Crítico', status: 'Identificado', fornecedor: 'f1',
}, extra);

test('risco de fornecedor com criticidade Alta pesa 3, o mesmo peso do Tier 1', () => {
  const criticidade = { f1: 7 }; // 7 = faixa Alta
  assert.strictEqual(RC.pesoDoRisco(riscoForn(), {}, criticidade), 3);
});

test('risco de fornecedor com criticidade Baixa pesa 1, o mesmo peso do Tier 3', () => {
  const criticidade = { f1: 1 }; // 1 = faixa Baixa
  assert.strictEqual(RC.pesoDoRisco(riscoForn(), {}, criticidade), 1);
});

test('risco de fornecedor sem avaliacao de criticidade cai no peso padrao', () => {
  assert.strictEqual(RC.pesoDoRisco(riscoForn(), {}, {}), RC.PESO_PADRAO);
  assert.strictEqual(RC.pesoDoRisco(riscoForn(), {}, undefined), RC.PESO_PADRAO);
});

test('risco com processoId usa o Tier, mesmo que tambem tenha fornecedor', () => {
  // Nao deveria acontecer na pratica (um risco e de processo OU de fornecedor),
  // mas se acontecer, processo manda -- e a mesma ordem que decidir() do
  // servidor usa pra abrir risco (o processo e quem tem o dado mais concreto).
  const r = riscoForn({ processoId: 'p1' });
  const criticidade = { f1: 1 }; // faixa Baixa, peso 1 -- nao deveria valer aqui
  assert.strictEqual(RC.pesoDoRisco(r, { p1: PROCESSOS[0] }, criticidade), 3); // Tier 1
});

test('a carga da empresa reflete a criticidade do fornecedor: Alta pesa mais que Baixa', () => {
  const riscos = [
    riscoForn({ fornecedor: 'critico', probabilidade: 'Alta', impacto: 'Crítico' }),
  ];
  const cargaAlta = RC.consolidar(riscos, [], { critico: 8 }).empresa.carga;
  const cargaBaixa = RC.consolidar(riscos, [], { critico: 0 }).empresa.carga;
  assert.ok(cargaAlta > cargaBaixa, `criticidade Alta deveria pesar mais: ${cargaAlta} <= ${cargaBaixa}`);
  assert.strictEqual(cargaAlta, 12 * 3); // score 12, peso 3 (Alta)
  assert.strictEqual(cargaBaixa, 12 * 1); // score 12, peso 1 (Baixa)
});

test('consolidar sem o parametro de criticidade nao quebra — risco de fornecedor cai no peso padrao', () => {
  const riscos = [riscoForn()];
  const r = RC.consolidar(riscos, []);
  assert.strictEqual(r.empresa.carga, 12 * RC.PESO_PADRAO);
});
