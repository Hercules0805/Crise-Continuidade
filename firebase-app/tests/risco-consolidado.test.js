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
  // Escala NIST 5x5 (15/10/2026): Alta(4) x Crítico->Muito alto(5) = 20; Média->Moderada(3) x Moderado(3) = 9.
  assert.strictEqual(antes, 60);   // 20 x 3
  assert.strictEqual(depois, 78);  // 60 + (9 x 2)
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

test('um risco soma score x peso, e o maximo por risco e 75 (25 x 3)', () => {
  assert.strictEqual(RC.cargaDoRisco({ probabilidade: 'Muito alta', impacto: 'Muito alto', processoId: 'p1' }, { p1: PROCESSOS[0] }), 75);
  assert.strictEqual(RC.CARGA_MAXIMA_POR_RISCO, 75);
  assert.strictEqual(RC.SCORE_MAXIMO, 25);
  assert.strictEqual(RC.cargaDoRisco({ probabilidade: 'Muito baixa', impacto: 'Muito baixo', processoId: 'p3' }, { p3: PROCESSOS[2] }), 1);
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

test('indexarProcessos monta um mapa id -> processo, o mesmo formato que consolidar() usa internamente', () => {
  const mapa = RC.indexarProcessos([{ id: 'a', nome: 'Um' }, { id: 'b', nome: 'Dois' }]);
  assert.deepStrictEqual(mapa, { a: { id: 'a', nome: 'Um' }, b: { id: 'b', nome: 'Dois' } });
});

test('indexarProcessos com lista vazia ou ausente devolve mapa vazio', () => {
  assert.deepStrictEqual(RC.indexarProcessos([]), {});
  assert.deepStrictEqual(RC.indexarProcessos(undefined), {});
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
  assert.strictEqual(r.empresa.carga, 8);  // Baixa(2) x Baixo(2) = 4, x 2
});

test('risco Aceito ENTRA na soma — aceitar nao faz o risco desaparecer', () => {
  const r = RC.consolidar([risco({ status: 'Aceito', probabilidade: 'Alta', impacto: 'Crítico' })], PROCESSOS);
  assert.strictEqual(r.empresa.contados, 1);
  assert.strictEqual(r.empresa.carga, 40);  // 20 x 2 (corporativo)
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
  // Nivel pela matriz NIST (SP 800-30 Tabela I-2), nao pelo produto.
  const r = RC.consolidar([
    risco({ probabilidade: 'Alta', impacto: 'Muito alto' }),   // Muito alto
    risco({ probabilidade: 'Alta', impacto: 'Alto' }),         // Alto
    risco({ probabilidade: 'Moderada', impacto: 'Alto' }),     // Moderado
    risco({ probabilidade: 'Moderada', impacto: 'Moderado' }), // Moderado
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),       // Baixo
    risco({ probabilidade: 'Muito baixa', impacto: 'Alto' }),  // Baixo
    risco({ probabilidade: 'Alta', impacto: 'Muito baixo' }),  // Muito baixo
  ], PROCESSOS);
  assert.deepStrictEqual(r.empresa.composicao, { 'Muito alto': 1, 'Alto': 1, 'Moderado': 2, 'Baixo': 2, 'Muito baixo': 1 });
  assert.strictEqual(r.empresa.contados, 7);
});

test('vinte riscos moderados NAO empatam com uma catastrofe — o motivo de nao ter teto', () => {
  const moderados = Array.from({ length: 20 }, () => risco({ probabilidade: 'Média', impacto: 'Moderado' }));
  const catastrofe = [risco({ probabilidade: 'Alta', impacto: 'Crítico', processoId: 'p1' })];
  const cargaModerados = RC.consolidar(moderados, PROCESSOS).empresa.carga;
  const cargaCatastrofe = RC.consolidar(catastrofe, PROCESSOS).empresa.carga;
  assert.notStrictEqual(cargaModerados, cargaCatastrofe);
  // E a composicao permite distinguir os dois casos, que a carga sozinha nao faria.
  assert.strictEqual(RC.consolidar(moderados, PROCESSOS).empresa.composicao['Muito alto'], 0);
  assert.strictEqual(RC.consolidar(catastrofe, PROCESSOS).empresa.composicao['Muito alto'], 1);
});

test('o pior caso volta junto, com a faixa dele', () => {
  const r = RC.consolidar([
    risco({ probabilidade: 'Baixa', impacto: 'Baixo' }),
    risco({ probabilidade: 'Alta', impacto: 'Crítico' }),
  ], PROCESSOS);
  assert.strictEqual(r.empresa.piorScore, 20);
  assert.strictEqual(r.empresa.piorFaixa.rotulo, 'Muito alto');
});

test('o nivel do risco segue a matriz do NIST SP 800-30 (Tabela I-2), celula a celula', () => {
  const P = RC.PROBABILIDADES;
  const I = RC.IMPACTOS;
  const esperado = [
    ['Muito baixo', 'Muito baixo', 'Muito baixo', 'Baixo', 'Baixo'],
    ['Muito baixo', 'Baixo', 'Baixo', 'Baixo', 'Moderado'],
    ['Muito baixo', 'Baixo', 'Moderado', 'Moderado', 'Alto'],
    ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'],
    ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'],
  ];
  P.forEach((p, i) => I.forEach((imp, j) => {
    assert.strictEqual(RC.nivelPorMatriz(p, imp), esperado[i][j], `${p} x ${imp}`);
  }));
  assert.strictEqual(RC.nivelPorMatriz('', 'Alto'), null);
});

test('rotulos da escala antiga (3x4) e variantes sao normalizados -- dado nao migrado e PCN antigo continuam valendo', () => {
  assert.strictEqual(RC.normalizarProbabilidade('Média'), 'Moderada');
  assert.strictEqual(RC.normalizarProbabilidade('media'), 'Moderada');
  assert.strictEqual(RC.normalizarProbabilidade('Alta'), 'Alta');
  assert.strictEqual(RC.normalizarImpacto('Crítico'), 'Muito alto');
  assert.strictEqual(RC.normalizarImpacto('Médio'), 'Moderado');
  assert.strictEqual(RC.normalizarImpacto('Grave'), '');
  assert.strictEqual(RC.normalizarNivel('Crítico'), 'Muito alto');
  assert.strictEqual(RC.scoreDoRisco({ probabilidade: 'Média', impacto: 'Crítico' }), 15);
  assert.strictEqual(RC.nivelDoRisco({ probabilidade: 'Média', impacto: 'Crítico' }), 'Alto', 'Média x Crítico era Alto e continua Alto');
});

test('cada nivel tem cor e fundo; faixaDoRisco usa a matriz', () => {
  RC.ORDEM_NIVEL.forEach((n) => assert.ok(RC.faixaNivel(n).cor, n));
  assert.strictEqual(RC.faixaDoRisco({ probabilidade: 'Alta', impacto: 'Muito alto' }).rotulo, 'Muito alto');
  assert.strictEqual(RC.faixaDoRisco({}), null);
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
  // {score, scoreMaximo} -- scoreMaximo congelado na avaliacao (perguntas
  // de criticidade sao cadastraveis, ver fornecedor-criticidade.js).
  const criticidade = { f1: { score: 15, scoreMaximo: 18 } }; // 15/18 = faixa Alta
  assert.strictEqual(RC.pesoDoRisco(riscoForn(), {}, criticidade), 3);
});

test('risco de fornecedor com criticidade Baixa pesa 1, o mesmo peso do Tier 3', () => {
  const criticidade = { f1: { score: 1, scoreMaximo: 18 } }; // 1/18 = faixa Baixa
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
  const criticidade = { f1: { score: 1, scoreMaximo: 18 } }; // faixa Baixa, peso 1 -- nao deveria valer aqui
  assert.strictEqual(RC.pesoDoRisco(r, { p1: PROCESSOS[0] }, criticidade), 3); // Tier 1
});

test('a carga da empresa reflete a criticidade do fornecedor: Alta pesa mais que Baixa', () => {
  const riscos = [
    riscoForn({ fornecedor: 'critico', probabilidade: 'Alta', impacto: 'Crítico' }),
  ];
  const cargaAlta = RC.consolidar(riscos, [], { critico: { score: 15, scoreMaximo: 18 } }).empresa.carga;
  const cargaBaixa = RC.consolidar(riscos, [], { critico: { score: 0, scoreMaximo: 18 } }).empresa.carga;
  assert.ok(cargaAlta > cargaBaixa, `criticidade Alta deveria pesar mais: ${cargaAlta} <= ${cargaBaixa}`);
  assert.strictEqual(cargaAlta, 20 * 3); // score 20, peso 3 (Alta)
  assert.strictEqual(cargaBaixa, 20 * 1); // score 20, peso 1 (Baixa)
});

test('consolidar sem o parametro de criticidade nao quebra — risco de fornecedor cai no peso padrao', () => {
  const riscos = [riscoForn()];
  const r = RC.consolidar(riscos, []);
  assert.strictEqual(r.empresa.carga, 20 * RC.PESO_PADRAO);
});

// ============================================================
// GOVERNANCA NIST (15/10/2026): apetite, residual, reavaliacao, exigencias
// ============================================================

const alto = { probabilidade: 'Alta', impacto: 'Alto', status: 'Em Tratamento' };        // matriz = Alto
const moderado = { probabilidade: 'Média', impacto: 'Moderado', status: 'Identificado' }; // 4 = Moderado

test('nível do risco pelo score inerente; null sem avaliação', () => {
  assert.strictEqual(RC.nivelDoRisco(alto), 'Alto');
  assert.strictEqual(RC.nivelDoRisco(moderado), 'Moderado');
  assert.strictEqual(RC.nivelDoRisco({ probabilidade: 'Alta' }), null);
});

test('apetite: acima só quando o nível passa do apetite e o risco ainda conta (Encerrado não)', () => {
  assert.strictEqual(RC.acimaDoApetite(alto, 'Moderado'), true);
  assert.strictEqual(RC.acimaDoApetite(moderado, 'Moderado'), false);
  assert.strictEqual(RC.acimaDoApetite(alto, 'Crítico'), false);
  assert.strictEqual(RC.acimaDoApetite(Object.assign({}, alto, { status: 'Encerrado' }), 'Moderado'), false);
  assert.strictEqual(RC.acimaDoApetite(Object.assign({}, alto, { status: 'Aceito' }), 'Moderado'), true, 'aceito continua contando');
  assert.strictEqual(RC.acimaDoApetite(alto, 'qualquer coisa'), true, 'apetite inválido cai no padrão Moderado');
});

test('residual: score dos campos residuais; vazio = null', () => {
  assert.strictEqual(RC.scoreResidual({ probabilidadeResidual: 'Baixa', impactoResidual: 'Alto' }), 8);
  assert.strictEqual(RC.nivelResidual({ probabilidadeResidual: 'Baixa', impactoResidual: 'Alto' }), 'Baixo');
  assert.strictEqual(RC.scoreResidual({}), null);
});

test('reavaliação: sugerida pelo nível (30/90/180/365 dias) e vencida só para risco ativo', () => {
  assert.strictEqual(RC.proximaReavaliacaoSugerida(alto, '2026-10-15'), '2027-01-13'); // Alto -> 90 dias
  assert.strictEqual(RC.proximaReavaliacaoSugerida({ probabilidade: 'Alta', impacto: 'Muito alto' }, '2026-10-15'), '2026-11-14'); // Muito alto -> 30
  assert.strictEqual(RC.proximaReavaliacaoSugerida(moderado, '2026-10-15'), '2027-04-13');
  assert.strictEqual(RC.proximaReavaliacaoSugerida({}, '2026-10-15'), null);
  assert.strictEqual(RC.reavaliacaoVencida({ proximaReavaliacao: '2026-10-01', status: 'Aceito' }, '2026-10-15'), true);
  assert.strictEqual(RC.reavaliacaoVencida({ proximaReavaliacao: '2026-10-01', status: 'Encerrado' }, '2026-10-15'), false);
  assert.strictEqual(RC.reavaliacaoVencida({ proximaReavaliacao: '2026-10-20', status: 'Aceito' }, '2026-10-15'), false);
});

test('função CSF padrão por origem', () => {
  assert.strictEqual(RC.funcaoCsfPadrao('Vulnerabilidade'), 'Identificar');
  assert.strictEqual(RC.funcaoCsfPadrao('Fornecedor'), 'Governar');
  assert.strictEqual(RC.funcaoCsfPadrao('Indicador de Segurança'), 'Detectar');
  assert.strictEqual(RC.funcaoCsfPadrao('Manual'), '');
  assert.deepStrictEqual(RC.FUNCOES_CSF, ['Governar', 'Identificar', 'Proteger', 'Detectar', 'Responder', 'Recuperar']);
});

test('exigências por status: só na mudança de status', () => {
  assert.deepStrictEqual(RC.pendenciasDoStatus({ status: 'Aceito' }, 'Aceito', 'Moderado'), [], 'mesmo status: não trava registro antigo');
  assert.deepStrictEqual(RC.pendenciasDoStatus({ status: 'Identificado' }, '', 'Moderado'), []);
});

test('exigências: Em Avaliação+ pede P e I; Em Tratamento pede estratégia e, se Mitigar, ação', () => {
  assert.match(RC.pendenciasDoStatus({ status: 'Em Avaliação' }, 'Identificado', 'Moderado')[0], /Probabilidade e Impacto/);
  const trat = { probabilidade: 'Alta', impacto: 'Alto', status: 'Em Tratamento' };
  assert.deepStrictEqual(RC.pendenciasDoStatus(trat, 'Em Avaliação', 'Moderado'), ['Estratégia de Tratamento']);
  assert.match(RC.pendenciasDoStatus(Object.assign({}, trat, { estrategiaTratamento: 'Mitigar' }), 'Em Avaliação', 'Moderado')[0], /ao menos uma ação/);
  assert.deepStrictEqual(RC.pendenciasDoStatus(Object.assign({}, trat, { estrategiaTratamento: 'Mitigar', planoAcao: [{ acao: 'x' }] }), 'Em Avaliação', 'Moderado'), []);
  assert.deepStrictEqual(RC.pendenciasDoStatus(Object.assign({}, trat, { estrategiaTratamento: 'Transferir' }), 'Em Avaliação', 'Moderado'), []);
});

test('exigências: Aceito pede justificativa e reavaliação; acima do apetite pede aprovador; Encerrado pede justificativa', () => {
  const aceito = { probabilidade: 'Alta', impacto: 'Alto', status: 'Aceito' };
  assert.deepStrictEqual(RC.pendenciasDoStatus(aceito, 'Em Tratamento', 'Moderado'),
    ['Justificativa do aceite', 'Próxima reavaliação', 'Aprovador do aceite (risco acima do apetite)']);
  assert.deepStrictEqual(RC.pendenciasDoStatus(Object.assign({}, aceito, { justificativaAceite: 'ok', proximaReavaliacao: '2027-01-01' }), 'Em Tratamento', 'Crítico'), [],
    'dentro do apetite não precisa de aprovador');
  assert.deepStrictEqual(RC.pendenciasDoStatus({ status: 'Encerrado' }, 'Em Tratamento', 'Moderado'), ['Justificativa de encerramento']);
});

// ============================================================
// AUTOMACOES DO DRAWER (15/10/2026): prioridade, status, acoes, etapas
// ============================================================

test('prioridade calculada pelo nível; um degrau acima quando passa do apetite', () => {
  assert.strictEqual(RC.prioridadeCalculada({ probabilidade: 'Baixa', impacto: 'Baixo' }, 'Moderado'), 'Baixa');
  assert.strictEqual(RC.prioridadeCalculada({ probabilidade: 'Moderada', impacto: 'Moderado' }, 'Moderado'), 'Média');
  assert.strictEqual(RC.prioridadeCalculada({ probabilidade: 'Alta', impacto: 'Alto' }, 'Moderado'), 'Crítica', 'Alto (Alta) + acima do apetite');
  assert.strictEqual(RC.prioridadeCalculada({ probabilidade: 'Alta', impacto: 'Alto' }, 'Muito alto'), 'Alta');
  assert.strictEqual(RC.prioridadeCalculada({}, 'Moderado'), '');
});

test('status avança sozinho só para frente e só se a pessoa não mexeu no status', () => {
  const base = { status: 'Identificado', probabilidade: 'Alta', impacto: 'Alto' };
  assert.strictEqual(RC.statusAvancado(base, 'Identificado'), 'Em Avaliação');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { estrategiaTratamento: 'Mitigar', planoAcao: [{ acao: 'x', status: 'Pendente' }] }), 'Identificado'), 'Em Tratamento');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { estrategiaTratamento: 'Mitigar', planoAcao: [{ acao: 'x', status: 'Concluído' }] }), 'Identificado'), 'Em Monitoramento');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { estrategiaTratamento: 'Transferir', estrategiaDescricao: 'Seguro cyber' }), 'Identificado'), 'Em Tratamento');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { status: 'Em Tratamento' }), 'Em Tratamento'), null, 'não volta');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { status: 'Em Avaliação' }), 'Identificado'), null, 'a pessoa escolheu');
  assert.strictEqual(RC.statusAvancado(Object.assign({}, base, { status: 'Aceito' }), 'Aceito'), null);
  assert.strictEqual(RC.statusAvancado({ status: 'Identificado' }, 'Identificado'), null, 'sem avaliação não avança');
});

test('ação do plano fica Atrasada sozinha quando o prazo passou; concluída nunca', () => {
  assert.strictEqual(RC.statusDaAcao({ status: 'Pendente', quando: '2026-10-01' }, '2026-10-15'), 'Atrasado');
  assert.strictEqual(RC.statusDaAcao({ status: 'Em andamento', quando: '2026-10-01' }, '2026-10-15'), 'Atrasado');
  assert.strictEqual(RC.statusDaAcao({ status: 'Concluído', quando: '2026-10-01' }, '2026-10-15'), 'Concluído');
  assert.strictEqual(RC.statusDaAcao({ status: 'Atrasado', quando: '2026-12-01' }, '2026-10-15'), 'Pendente', 'prazo novo tira o atraso');
  assert.strictEqual(RC.statusDaAcao({ status: 'Pendente' }, '2026-10-15'), 'Pendente');
});

test('trilha das etapas NIST (Enquadrar, Avaliar, Responder, Monitorar)', () => {
  assert.deepStrictEqual(RC.etapasNist({}), { enquadrar: false, avaliar: false, responder: false, monitorar: false });
  const r = { titulo: 'T', responsavel: 'Ana', probabilidade: 'Alta', impacto: 'Alto', estrategiaTratamento: 'Aceitar', justificativaAceite: 'ok', proximaReavaliacao: '2027-01-01' };
  assert.deepStrictEqual(RC.etapasNist(r), { enquadrar: true, avaliar: true, responder: true, monitorar: true });
});
